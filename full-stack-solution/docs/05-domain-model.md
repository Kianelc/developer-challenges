# Domain Model

Source of truth: `apps/api/prisma/schema.prisma`. Domain types shared with the
frontend: `libs/shared/src/lib/*.ts`.

## Entities and relationships

```
┌────────────┐
│    User    │
└─────┬──────┘
      │ 1    owns (Restrict)
      │ *
┌─────▼──────┐
│  Machine   │  name, type: Pump | Fan
└─────┬──────┘
      │ 1    Cascade on delete
      │ *
┌─────▼──────────────┐
│  MonitoringPoint   │  name
└──┬──────────────┬──┘
   │ 1            │ 1       both Cascade on delete
   │ 0..1         │ *
┌──▼──────┐   ┌───▼──────┐
│ Sensor  │   │ Reading  │  (monitoringPointId, timestamp) → value
│ id, mdl │   └──────────┘
└─────────┘
```

| Relationship | Cardinality | On delete |
|--------------|-------------|-----------|
| User → Machine | 1 : N | `Restrict` — a user with assets cannot be deleted |
| Machine → MonitoringPoint | 1 : N | `Cascade` |
| MonitoringPoint → Sensor | 1 : 0..1 | `Cascade` |
| MonitoringPoint → Reading | 1 : N | `Cascade` |

Deleting a machine therefore removes its points, their sensors and every reading
below them, in one database operation. The UI says so before asking for
confirmation.

## Entities in detail

### User

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` PK | UUID |
| `email` | `String` unique | |
| `password` | `String` | bcrypt hash, cost 10. Never returned, never logged. |
| `createdAt` | `DateTime` | |

Created only by the seed (`apps/api/prisma/seed.ts`) from `SEED_USER_EMAIL` /
`SEED_USER_PASSWORD`. There is no registration endpoint.

### Machine

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` PK | UUID |
| `name` | `String` | 2–100 characters, trimmed (`createMachineSchema`) |
| `type` | `MachineType` | `Pump` \| `Fan` |
| `createdById` | `String` FK → User | Always taken from the JWT, never from the body |
| `createdAt` / `updatedAt` | `DateTime` | |

The API response adds `monitoringPointsCount`, a derived count the UI needs to warn
about machines below the recommended minimum. It is not a stored column.

### MonitoringPoint

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` PK | UUID |
| `name` | `String` | 1–100 characters, trimmed |
| `machineId` | `String` FK → Machine | Indexed |
| `createdById` | `String` FK → User | From the JWT |
| `createdAt` | `DateTime` | |

Names are **not** unique: two machines may each have a "Bearing", and even one
machine may have two points with the same name — the brief gives no uniqueness
requirement and the id is what identifies a point.

The API response is denormalized for the list screen: `machineName`, `machineType`,
`sensorId` and `sensorModel` come back flattened beside the point's own fields, so
the required table renders from one query.

### Sensor

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` PK | **Typed by the user**, 2–50 characters, globally unique |
| `model` | `SensorModel` | `TcAg` \| `TcAs` \| `HF+` (stored `HF_PLUS`) |
| `monitoringPointId` | `String` FK unique | The `unique` is what makes it 1 : 0..1 |
| `createdById` | `String` FK → User | From the JWT |
| `createdAt` | `DateTime` | |

Two deliberate choices:

- **The id is the primary key**, not a generated column, because the brief says the
  sensor "should have a unique ID" chosen by the user. Uniqueness is then a database
  guarantee: a duplicate id is a constraint violation surfaced as `409`, not a
  race-prone pre-check.
- **`monitoringPointId` is unique**, so a point holds at most one sensor and
  installing a new one *replaces* the old one, in a transaction.

### Reading

| Field | Type | Notes |
|-------|------|-------|
| `monitoringPointId` | `String` FK → MonitoringPoint | Part of the PK |
| `timestamp` | `DateTime` | Part of the PK |
| `value` | `Float` | |

**The primary key is `(monitoringPointId, timestamp)`** — the one schema decision
worth defending:

1. It makes a duplicate sample a constraint, not a question. Re-sending a batch
   cannot create a second row for the same instant, which is what makes re-delivery
   safe (the endpoint reports `received` vs `inserted` so a re-send is visible rather
   than a silent success).
2. The composite index it creates is exactly the access pattern: *all readings of one
   point, ordered by time, optionally bounded*. Range queries and the metrics
   aggregate walk it in order with no extra index and no sort step.

There is no surrogate `id`: nothing addresses a single reading, so a surrogate key
would be a wider row and a second index for no query.

## Enumerations

```prisma
enum MachineType { Fan  Pump }
enum SensorModel { HF_PLUS @map("HF+")  TcAg  TcAs }
```

Declared **alphabetically on purpose**. PostgreSQL sorts enum values by declaration
order, not by label, so alphabetical declaration is what makes
`ORDER BY machine.type` and `ORDER BY sensor.model` come out in the order the user
expects from a column header. Reordering these declarations would silently change
sort results — a migration, not a cosmetic edit.

`HF+` cannot be a PostgreSQL enum identifier, so it is stored as `HF_PLUS` and mapped
in exactly one place, `apps/api/src/shared/database/sensor-model.mapper.ts`. Every
layer above it, and the whole API surface, speaks `"HF+"`.

## Invariants

| Invariant | Enforced by |
|-----------|-------------|
| A sensor id is unique across the system | PK on `Sensor.id` |
| A monitoring point holds at most one sensor | `@unique` on `Sensor.monitoringPointId` |
| One reading per point per instant | PK `(monitoringPointId, timestamp)` |
| `TcAg`/`TcAs` never installed on a `Pump` | Service check before any write, plus the type-change guard — see [Business Rules](./07-business-rules.md) |
| Every row belongs to the authenticated user | `createdById` from the JWT; ownership in every query's `WHERE` |
| A machine's type change cannot orphan an illegal sensor | Conflict check in `MachinesService.update` |

The minimum of two monitoring points per machine is **not** an invariant: the API
accepts a machine with none. It is surfaced as a warning in the UI; see
[Assumptions](./12-assumptions.md).

## Migrations

| Migration | What it did |
|-----------|-------------|
| `20261008200350_init` | Initial schema |
| `20261009192959_reading_composite_key` | Replaced `Reading`'s surrogate id with the composite primary key described above |

Applied migrations are never edited; a schema change is a new migration.
