# Problem Definition

## The problem

Maintenance teams need to register an asset hierarchy and keep the raw sensor data
attached to it, so that degradation can be seen in the data before it is heard on
the shop floor. Three capabilities follow from that:

1. **Describe the assets.** Create machines, place monitoring points on them, and
   install sensors on those points — with the physical compatibility rules enforced,
   because an incompatible sensor produces data that silently means nothing.
2. **Hold the series.** Accept raw readings in batches, store them durably, serve
   them back whole or filtered by time, aggregate them, count them, delete them.
3. **Make it legible.** Show the inventory in a list that can be paged and ordered,
   and the series as a chart.

## What makes it non-trivial

| Challenge | Why it is not just CRUD |
|-----------|-------------------------|
| **Compatibility rule** | `TcAg`/`TcAs` cannot go on a `Pump`. The rule must hold when a sensor is installed *and* when a machine's type later changes under an installed sensor — the second case is the one that is easy to miss. |
| **Sensor identity** | The sensor id is typed by a human and must be globally unique, so it is a natural primary key with a uniqueness constraint, not a generated id. |
| **Series volume** | Readings arrive in batches and grow without bound, while machines and points stay few. The storage, the keys and the queries have to assume that asymmetry. |
| **Re-delivery** | A gateway that loses an acknowledgement resends its batch. Re-sending must be safe and must not look like a silent success. |
| **Ownership** | Every row belongs to a user. Authorization is a property of each query, not a middleware that can be forgotten. |
| **Listing** | Up to 5 rows per page, orderable by four columns in both directions — over a join of three tables. Doing that in the client would mean shipping the whole inventory to the browser. |

## Constraints

Imposed by the brief (`../../full-stack-challenge.md`, sections 5 and 6):

- TypeScript; React; Redux for global state; Redux Thunk **or** Saga for side effects;
  Next.js **or** Vite; Material UI **5**; reusable components; responsive layout;
  automated unit tests.
- Backend on Node.js (not Java, not PHP, not Python); PostgreSQL with Prisma (or
  Drizzle/Kysely) **or** MongoDB with Mongoose; REST endpoints; time-series storage
  and retrieval; proper error handling and validation; unit tests.
- Request latency below **350 ms**.
- Atomic, semantic commits (Conventional Commits).

Self-imposed, to keep the solution defensible:

- **No duplicated business rules.** A rule that both sides need lives in `libs/shared`
  and is imported by both. See [Business Rules](./07-business-rules.md).
- **The server is the authority.** Client-side validation exists to spare a round
  trip, never to be the only check.
- **No speculative abstraction.** Patterns are introduced when a second caller
  appears, not in anticipation of one.

## Non-goals

Stated here so their absence reads as a decision rather than an omission. The
reasoning for each is in [Scope](./03-scope.md).

- Multi-tenancy, roles, user registration, password reset.
- Real sensor ingestion (MQTT, gateways, device provisioning).
- Alerting, thresholds, failure prediction.
- Horizontal scaling, load balancing, partitioning the readings table.

## Definition of done

The brief is explicit that a half-built feature counts for less than a thin
end-to-end one:

> Complete integration between frontend and backend is more important than
> implementing isolated or unfinished client-side features.

So a capability is "done" here only when the UI calls the real endpoint, the endpoint
hits PostgreSQL, the rules are enforced server-side, and tests cover the behavior
*and* its refusal cases. The end-to-end verification that was actually executed is
recorded in [Testing Strategy](./09-testing-strategy.md#end-to-end-verification).
