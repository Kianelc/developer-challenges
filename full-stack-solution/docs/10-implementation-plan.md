# Implementation Plan

Status and what remains. The commit history on branch `kiane-casagrande` is the
authority on order; why each thing was built the way it was is in
[Decisions](./11-decisions.md).

## Sequencing principle

Bottom-up, and **vertical slices only**: nothing was built in a layer that could not
yet be reached from the layer above. A capability counts as done only end to end —
see [Definition of done](./01-requirements.md#definition-of-done).

The shared library came first, because it is what keeps the two applications from
drifting ([D9](./11-decisions.md#d9--business-rules-live-in-libsshared)).

Delivery order: workspace → `libs/shared` → API foundation (layering, error handler,
schema, seed) → authentication → machines → monitoring points and sensors → time
series → frontend foundation (theme, HTTP client, store, test setup) → frontend
features in the same order as the API → documentation. Two corrections followed:
the card grids ([D11](./11-decisions.md#d11--native-css-grid-instead-of-mui-5s-grid))
and the ingest body limit, found while measuring latency
([Performance](./14-performance.md#what-these-measurements-found)). Then
measurements gained their physical quantity
([D14](./11-decisions.md#d14--readings-carry-their-quantity-the-unit-is-derived),
[D15](./11-decisions.md#d15--the-x-axis-is-a-time-scale-not-a-category-axis)).

## Current state

| Area | Status |
|------|--------|
| Authentication, machines, monitoring points, sensors, time series | Implemented end-to-end |
| `libs/shared` as the single home of the rules | Implemented |
| Responsive layout, reusable components | Implemented |
| Unit and component tests on both sides | Implemented — [Testing Strategy](./09-testing-strategy.md) |
| Nx monorepo (bonus) | Implemented |
| End-to-end flow against the real API and database | [Verified manually](./09-testing-strategy.md#end-to-end-verification) |
| Latency below 350 ms | [Measured](./14-performance.md) |
| Cypress, deployment, prediction, load balancing, load tests (bonuses) | Not implemented — [non-goals](./01-requirements.md#non-goals) |

## Backlog

### Next

1. **Cypress end-to-end test** of one full flow: log in → create a machine → add two
   points → install a sensor → send readings → see the chart → log out. The bonus
   that most strengthens the submission, and the honest answer to the gap in
   [Testing Strategy](./09-testing-strategy.md#known-gaps).
2. **An integration suite against a disposable database**, to cover what only
   PostgreSQL enforces: the cascades, the unique constraints and the composite
   primary key.
3. **A load test**, turning the single-request figures in
   [Performance](./14-performance.md#not-covered) into a trend under concurrency.
4. **`helmet` and login rate limiting** — cheap, and closes the two gaps in
   [Security](./08-security.md#not-implemented).

### Later, with a reason to

5. **Deployment**, with the SPA and the API behind one origin so the no-CORS property
   survives production.
6. **Server-side pagination for the readings list**, if a series outgrows what one
   response should carry.
7. **Retention or partitioning for `Reading`**, driven by measurements.
8. **Refresh tokens in `HttpOnly` cookies**, if the auth surface is ever allowed to
   grow past one fixed user.
9. **Prediction of future values**, once a method can be defended with real data.

## Working agreements

- Conventional Commits, atomic, in English, with the reasoning in the body: the log
  is meant to be defensible in a technical interview.
- Tests added or updated with every behavior change, refusal cases included; a test
  is never weakened to make it pass.
- `npx nx run-many -t test lint -p shared api web` before committing.
- Schema changes go through migrations; an applied migration is never edited.
- No claim that tests, lint, builds or latency passed without running and observing
  them.
