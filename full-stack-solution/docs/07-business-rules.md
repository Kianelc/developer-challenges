# Business Rules

Every rule that both sides need lives in `libs/shared` and is imported by both. The
rules below name the function or schema that implements them, so there is no second
copy of the logic to drift.

## BR-1 — `TcAg` and `TcAs` cannot be installed on a `Pump`

The one genuine domain rule in the brief.

**Implementation:** `libs/shared/src/lib/sensor.ts`

```ts
export function isSensorModelAllowed(
  machineType: MachineType,
  sensorModel: SensorModel,
): boolean {
  if (machineType === "Pump") {
    return !MODELS_BLOCKED_FOR_PUMP.includes(sensorModel);  // ["TcAg", "TcAs"]
  }
  return true;
}
```

Enforced in three places, each for a different reason:

| Where | What it does | Why it exists |
|-------|--------------|---------------|
| `MonitoringPointsService.assignSensor` | Throws `BusinessRuleError` → **422** | The authority. Runs **before any write**, so a refused install leaves the previous sensor in place. |
| `SensorFormDialog` (web) | Disables the option and refuses to submit | Turns a round trip into instant feedback, and shows *why* the model is unavailable instead of hiding it. |
| `MachineFormDialog` (web) | Lists the models a type rejects | Makes the rule visible before the user can trip over it. |

This is deliberately **not** rule duplication: all three call the same function. The
helpers `getAllowedSensorModels`, `getBlockedSensorModels` and
`sensorNotAllowedMessage` live beside it, so even the message text has one source.

## BR-2 — A machine's type cannot change into a violation of BR-1

The case that is easy to miss: BR-1 holds at install time, then someone edits the
machine from `Fan` to `Pump` and the installed `TcAg` becomes illegal retroactively.

**Implementation:** `MachinesService.update`

```ts
const becomesPump = input.type === "Pump" && machine.type !== "Pump";
if (becomesPump && (await this.repository.hasSensorsBlockedForPump(id))) {
  throw new ConflictError(/* names the blocked models */);
}
```

→ **409 CONFLICT**, not 422: the payload is valid, the *current state* is what
refuses it. The user's options are to remove the sensors first or leave the type
alone — the error message says which models are in the way.

A `Pump` → `Pump` update skips the check (`machine.type !== "Pump"`), so renaming a
pump that somehow holds a legacy sensor is not blocked by an unrelated edit.

## BR-3 — A monitoring point holds at most one sensor; installing replaces

**Implementation:** `@unique` on `Sensor.monitoringPointId` (schema) +
`MonitoringPointsRepository.replaceSensor`, which deletes and inserts **in one
transaction**.

The endpoint is `PUT` because the operation is idempotent replacement. Re-assigning
the same sensor id to the point it already occupies replaces it in place rather than
failing.

## BR-4 — A sensor id is globally unique and chosen by the user

**Implementation:** `Sensor.id` is the primary key; `assignSensorSchema` constrains
it to a trimmed 2–50 characters.

Uniqueness is a database guarantee rather than a pre-check, so there is no
read-then-write race. A collision surfaces as **409 CONFLICT** through
`shared/database/prisma-errors.ts`.

## BR-5 — "At least two monitoring points per machine" is a warning, not a constraint

**Implementation:** `MIN_MONITORING_POINTS_PER_MACHINE = 2` in `libs/shared`, read by
`selectMachinesBelowMinimumPoints` (web). **The API does not enforce it.**

Reasoning: the brief phrases it as a user story ("I want to create at least two
monitoring points"), not as a validation rule. Enforcing it server-side would make
the first point of every new machine impossible to create — you cannot create two
points in one request. So the API accepts any count and the UI flags machines below
the minimum, on both the overview and the machines list. Recorded in
[Assumptions](./12-assumptions.md#a3--create-at-least-two-monitoring-points).

## BR-6 — Duplicate readings are skipped, and the skip is reported

**Implementation:** primary key `(monitoringPointId, metric, timestamp)` + an insert
that ignores conflicts, returning `{ received, inserted }`.

A gateway that loses an acknowledgement resends its batch, so re-sending has to be
safe *and* visible: the counts let a caller tell "stored" from "already present",
which a bare success could not. The alternatives are in
[D6](./11-decisions.md#d6--duplicate-readings-are-skipped-and-reported).

## BR-7 — Batch size is capped at 4 000 readings

**Implementation:** `MAX_READINGS_PER_BATCH` in `libs/shared`, enforced by
`createReadingsSchema` on both sides; the ingest route accepts a body of up to 1 MB,
sized from that cap (4 000 × ~100 bytes ≈ 400 KB compact), while every other route
keeps the Express default. An oversized body answers `413 PAYLOAD_TOO_LARGE`.

A cap is needed because the payload is unbounded otherwise, and 4 000 is the largest
batch that keeps one request inside the latency budget — measured at ~265 ms against
the 350 ms requirement ([Performance](./14-performance.md#ingest)) — while still
being a realistic gateway batch.

**The cap is a measured figure, not a round number.** It was 5 000 until readings
gained their `metric`: each reading grew ~37%, and a full batch then measured 347 ms,
past the requirement. The cap followed the measurement.

The two limits have to agree: they did not, and the mismatch made the advertised
maximum unreachable until it was measured. The regression is now pinned by a test
that posts a full `MAX_READINGS_PER_BATCH` batch.

## BR-8 — Reading timestamps must carry a time zone

**Implementation:** `readingSchema` uses `z.iso.datetime({ offset: true })`.

`2026-01-01T00:00:00` names no instant without knowing the writer's zone. Accepting
it would mean guessing, and a guess in time-series data is a silent corruption, so it
is a `400` instead. The UI converts its `datetime-local` inputs with `toISOString()`
before sending.

## BR-9 — Range bounds are inclusive on both ends

**Implementation:** `readingsRangeQuerySchema`, which also refuses `from` later than
`to`.

Either bound may be omitted, leaving that side open. One inclusive rule applies to
reading, measuring and deleting alike, so a user who deletes `[t1, t2]` and then
queries `[t1, t2]` gets an empty result with no off-by-one surprise.

## BR-10 — Every row belongs to its creator, and another user's row does not exist

**Implementation:** `createdById` is taken from the verified JWT (never from the
body); ownership is part of every query's `WHERE` (`findOwned`,
`machineBelongsToUser`, `pointBelongsToUser`); a miss raises `NotFoundError` → **404**.

Authorization is therefore a property of each query, not a separate check a new
endpoint could forget. `404` rather than `403` keeps other users' ids from leaking
([D8](./11-decisions.md#d8--ownership-answers-404-not-403)).

## BR-11 — Deleting cascades down the hierarchy

**Implementation:** `onDelete: Cascade` from machine → points → sensor/readings in
the schema; `Restrict` from user → everything, so a user with data cannot be deleted.

The cascade is in the database rather than in application code so it cannot be
bypassed by a future code path. Both delete dialogs state what else will be removed
before asking for confirmation.

## BR-13 — Every reading declares its physical quantity, and the unit is derived

**Implementation:** `metric` is required by `readingSchema` and `NOT NULL` in the
schema; `METRIC_UNITS` and `METRIC_LABELS` in `libs/shared/src/lib/measurement.ts`
map each quantity to its unit and name.

A value without a quantity cannot be charted: an axis has to say what it measures,
and `20.5` is a plausible temperature in °C and a plausible velocity in mm/s at the
same time. So the quantity is part of the data, not inferred — and never guessed
from the sensor model, which would be wrong the moment one sensor reports two
quantities (they all do).

**The unit is derived, never stored and never transmitted.** A stored unit would be a
second source of truth, free to drift from the quantity it claims to describe; the
client derives it from the same map the server uses. The quantities, their units and
where those units come from are listed in
[Domain Model](./05-domain-model.md#enumerations).

## BR-14 — A quantity is part of a reading's identity

**Implementation:** `metric` sits inside the primary key
`(monitoringPointId, metric, timestamp)`.

A sensor samples temperature and vibration together, so those readings share a
timestamp. Keyed on `(point, timestamp)` alone, the second quantity of every sample
would be silently dropped as a duplicate — the data would look ingested
(`received: 3`) while only one row survived. Verified end to end: three quantities
at one instant return `inserted: 3`, while re-sending the same quantity at that
instant returns `inserted: 0`.

## BR-15 — An aggregate covers exactly one quantity

**Implementation:** `readingsMetricsQuerySchema` requires `metric`;
`GET …/readings/metrics` answers `400` without it, and the response echoes the
quantity.

`min`, `max` and `avg` are only meaningful within one unit. Allowing the quantity to
be omitted would produce an average of °C and mm/s — a number with no
interpretation, displayed next to a label that could not name its unit.

The UI follows the same rule: one chart per quantity, each with its own Y axis, and
the aggregate tiles labelled with the unit of the quantity they describe.

## BR-12 — Enum sort order must match alphabetical order

**Implementation:** `MachineType`, `SensorModel` and `MeasurementMetric` are declared
alphabetically in `schema.prisma`.

PostgreSQL sorts enums by declaration order. The list must sort by `machineType` and
`sensorModel`, and a user clicking a column header expects alphabetical. Reordering
those declarations would silently change query results — it is a migration, not a
formatting change.

## Where to add a new rule

1. If both sides need it, the predicate goes in `libs/shared` as a pure function or a
   schema — never as a copy on each side.
2. The server enforces it in the **service**, before any write, throwing the
   `AppError` subclass that matches the semantics (`422` for a payload the domain
   refuses, `409` for a conflict with current state).
3. The client may call the same predicate for immediate feedback, and must still
   handle the server's refusal.
4. Add a test for the rule **and** for its refusal path. The quality gate is explicit
   about refusal cases.
