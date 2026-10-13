# Requirements

What the system does, what it must not do, and the constraints it was built under.
The authority on *what* to build is the challenge brief
(`../../full-stack-challenge.md`); this file records how that was interpreted. Every
ambiguity resolved along the way is in [Assumptions](./12-assumptions.md).

## Context

DynaPredict is Dynamox's asset condition monitoring platform. Industrial equipment —
pumps, fans — is instrumented with sensors that sample a physical quantity over
time. Maintenance teams read those series to spot degradation *before* a machine
fails: the difference between a scheduled stop and an unplanned one.

This repository implements the slice the challenge describes: registering the asset
hierarchy, and storing, measuring and visualizing the raw series collected from it.

**One role.** An authenticated maintenance user who owns the assets they register.
Data is per user: one user never sees another's rows
([Security](./08-security.md#authorization)).

## Vocabulary

Used consistently across these documents and in the code.

| Term | Meaning |
|------|---------|
| Machine | A physical asset. Type `Pump` or `Fan`. |
| Monitoring point | A named location on a machine where a measurement is taken. |
| Sensor | The device installed on a monitoring point. Model `TcAg`, `TcAs` or `HF+`; its id is typed by the user and globally unique. |
| Reading | One sample: timestamp, value, and the physical quantity it measures. |
| Metric / quantity | What a reading measures: temperature, vibration velocity RMS or vibration acceleration RMS. |
| Time series | The readings of one monitoring point. A query, not a stored entity. |
| Aggregate | count, min, max, average, first and last timestamp over one quantity. |

The entities and their relationships are in [Domain Model](./05-domain-model.md).

## What the system must do

| Capability | Delivered |
|------------|-----------|
| **Authentication** | Login with the seeded fixed user (JWT in the body), logout, and no private route reachable without a validated session |
| **Machines** | Create with a name and a type, edit both, delete (cascading down) |
| **Monitoring points** | Create on a machine, rename, delete |
| **Sensors** | Install, replace and remove; user-typed unique id; compatibility with the machine type enforced |
| **Inventory list** | Paginated 5 per page, showing machine name, machine type, point name and sensor model, orderable by any of the four in both directions — in SQL |
| **Time series** | Ingest raw readings in batches, read a full series or a range, aggregate per quantity, count everything stored, delete a series or a range |
| **Visualization** | One chart per quantity, with a time axis, a labelled unit, legend and tooltip |
| **Cross-cutting** | Responsive from phone to desktop, reusable components, shared rule library, unit and component tests on both sides, Nx monorepo |

The rules that govern these are in [Business Rules](./07-business-rules.md); the
endpoints in [API Contracts](./06-api-contracts.md); where each requirement is
implemented and tested, in
[Requirements Traceability](./13-requirements-traceability.md).

## What makes it more than CRUD

| Challenge | Why |
|-----------|-----|
| **Compatibility rule** | It must hold when a sensor is installed *and* when a machine's type later changes under an installed sensor — the second case is the one easy to miss ([BR-1](./07-business-rules.md#br-1--tcag-and-tcas-cannot-be-installed-on-a-pump), [BR-2](./07-business-rules.md#br-2--a-machines-type-cannot-change-into-a-violation-of-br-1)) |
| **Identifying a measurement** | A value alone is uninterpretable: `20.5` is a plausible temperature in °C and a plausible velocity in mm/s. The quantity has to be part of the data ([BR-13](./07-business-rules.md#br-13--every-reading-declares-its-physical-quantity-and-the-unit-is-derived)) |
| **Sensor identity** | The id is typed by a human and must be globally unique, so it is a natural key, not a generated one ([BR-4](./07-business-rules.md#br-4--a-sensor-id-is-globally-unique-and-chosen-by-the-user)) |
| **Series volume** | Readings grow without bound while machines and points stay few; the keys and queries assume that asymmetry ([D5](./11-decisions.md#d5--readings-primary-key-is-monitoringpointid-metric-timestamp)) |
| **Re-delivery** | A gateway that loses an acknowledgement resends its batch. Re-sending must be safe *and* visible ([BR-6](./07-business-rules.md#br-6--duplicate-readings-are-skipped-and-the-skip-is-reported)) |
| **Ownership** | Authorization is a property of every query, not a middleware that can be forgotten ([BR-10](./07-business-rules.md#br-10--every-row-belongs-to-its-creator-and-another-users-row-does-not-exist)) |
| **Listing** | Paging and ordering over a join of three tables; doing it in the client would ship the whole inventory to the browser ([D7](./11-decisions.md#d7--pagination-and-sorting-on-the-server)) |

## Constraints

**From the brief** (sections 5 and 6): TypeScript; React; Redux for global state;
Redux Thunk **or** Saga; Next.js **or** Vite; Material UI **5**; reusable
components; responsive layout; automated unit tests. Backend on Node.js (not Java,
PHP or Python); PostgreSQL with Prisma (or Drizzle/Kysely) **or** MongoDB with
Mongoose; REST endpoints; time-series storage and retrieval; error handling and
validation; unit tests. Request latency below **350 ms**. Atomic, semantic commits.

Which option was taken for each choice, and why, is in
[Decisions](./11-decisions.md).

**Self-imposed:**

- **No duplicated business rules.** A rule both sides need lives in `libs/shared`
  and is imported by both ([D9](./11-decisions.md#d9--business-rules-live-in-libsshared)).
- **The server is the authority.** Client-side validation spares a round trip; it is
  never the only check.
- **No speculative abstraction.** A pattern appears when a second caller does.

## Non-goals

Absent by decision, not by omission.

| Not built | Reasoning |
|-----------|-----------|
| User registration, password reset, roles | The brief asks for a *fixed* user. Account management would expand the auth surface with nothing in the requirements behind it |
| Token refresh / revocation list | Logout is stateless by decision — the trade-off is stated in [Security](./08-security.md#logout-is-stateless) |
| Real device ingestion (MQTT, gateways) | No requirement names a transport. The HTTP batch endpoint *is* the contract; a gateway would sit in front of it ([D13](./11-decisions.md#d13--the-readings-editor-takes-a-json-batch)) |
| Alerting, thresholds, failure prediction | A bonus, and it needs a modelling decision that cannot be defended without domain data |
| Signal processing, spectral analysis, per-axis breakdown | Out of scope by the refactor brief; this system stores scalar samples ([A14](./12-assumptions.md#a14--which-quantities-does-each-sensor-model-report)) |
| Cypress end-to-end tests | A bonus, and the next backlog item — see [Implementation Plan](./10-implementation-plan.md#next) |
| Cloud deployment, load balancer, load tests | Bonuses that exercise infrastructure, not the design being graded |
| Partitioning / retention for `Reading` | Premature at this volume; revisit with measurements ([Performance](./14-performance.md#not-covered)) |
| Dark theme, i18n | No requirement; each would double a maintenance surface |

## Boundaries worth stating

- **A "time series" is not an entity.** It is the readings of one monitoring point,
  reached through that point. There is no `/series` resource
  ([A5](./12-assumptions.md#a5--what-is-a-time-series-as-a-resource)).
- **"At least two monitoring points per machine" is a UI warning**, never an API
  constraint ([BR-5](./07-business-rules.md#br-5--at-least-two-monitoring-points-per-machine-is-a-warning-not-a-constraint)).
- **One user, one dataset.** No sharing, no teams, no transfer of ownership.

## Definition of done

The brief is explicit that a half-built feature counts for less than a thin
end-to-end one:

> Complete integration between frontend and backend is more important than
> implementing isolated or unfinished client-side features.

So a capability counts as done only when the UI calls the real endpoint, the endpoint
hits PostgreSQL, the rules are enforced server-side, and tests cover the behavior
*and* its refusal cases. What was actually executed end to end is recorded in
[Testing Strategy](./09-testing-strategy.md#end-to-end-verification).
