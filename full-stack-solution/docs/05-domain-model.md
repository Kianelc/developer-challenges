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
┌──▼──────┐   ┌───▼──────────────────────────────────────┐
│ Sensor  │   │ Reading                                   │
│ id, mdl │   │ (monitoringPointId, metric, timestamp)    │
└─────────┘   │   → value                                 │
              └───────────────────────────────────────────┘
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
| `metric` | `MeasurementMetric` | The physical quantity. Part of the PK |
| `timestamp` | `DateTime` | Part of the PK |
| `value` | `Float` | Expressed in the unit of its `metric` |

**The primary key is `(monitoringPointId, metric, timestamp)`**, and there is no
surrogate `id` — nothing addresses a single reading. Both the reasoning and the
rejected alternative are in
[D5](./11-decisions.md#d5--readings-primary-key-is-monitoringpointid-metric-timestamp);
the consequences the key enforces are
[BR-6](./07-business-rules.md#br-6--duplicate-readings-are-skipped-and-the-skip-is-reported)
and [BR-14](./07-business-rules.md#br-14--a-quantity-is-part-of-a-readings-identity).

**The unit is not stored**, only derived from `metric`
([BR-13](./07-business-rules.md#br-13--every-reading-declares-its-physical-quantity-and-the-unit-is-derived)).

## Enumerations

```prisma
enum MachineType       { Fan  Pump }
enum SensorModel       { HF_PLUS @map("HF+")  TcAg  TcAs }
enum MeasurementMetric { temperature  vibrationAccelerationRms  vibrationVelocityRms }
```

`MeasurementMetric` holds the three continuous telemetry quantities the DynaPredict
platform charts ("Histórico de Velocidade RMS, Temperatura e Aceleração RMS"). Their
units live in `libs/shared`, not in the database:

| Metric | Unit | Source of the unit |
|--------|------|--------------------|
| `temperature` | `°C` | Stated in the platform manual |
| `vibrationVelocityRms` | `mm/s` | ISO 20816 convention — see [Assumptions](./12-assumptions.md#a13--which-units-do-the-vibration-quantities-use) |
| `vibrationAccelerationRms` | `m/s²` | Same |

Spectral data, frequency bands and per-axis (X/Y/Z) breakdowns are deliberately
absent: this system stores scalar samples, not signal analysis.

All three are declared **alphabetically on purpose**, which server-side sorting
depends on
([BR-12](./07-business-rules.md#br-12--enum-sort-order-must-match-alphabetical-order)).

`HF+` cannot be a PostgreSQL enum identifier, so it is stored as `HF_PLUS` and mapped
in exactly one place, `apps/api/src/shared/database/sensor-model.mapper.ts`. Every
layer above it, and the whole API surface, speaks `"HF+"`.

## Invariants

| Invariant | Enforced by |
|-----------|-------------|
| A sensor id is unique across the system | PK on `Sensor.id` |
| A monitoring point holds at most one sensor | `@unique` on `Sensor.monitoringPointId` |
| One reading per point, per quantity, per instant | PK `(monitoringPointId, metric, timestamp)` |
| Every reading declares its quantity | `metric` is `NOT NULL` and required by `readingSchema` |
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
| `20261009192959_reading_composite_key` | Replaced `Reading`'s surrogate id with a composite primary key |
| `20261013150000_reading_metric` | Added `MeasurementMetric` and `Reading.metric`, and put the metric in the primary key. **Destructive:** the readings already stored carried no quantity, and assigning one would have misrepresented them, so they were deleted — leftover manual-test data only, since the seed creates no readings |

Applied migrations are never edited; a schema change is a new migration.
