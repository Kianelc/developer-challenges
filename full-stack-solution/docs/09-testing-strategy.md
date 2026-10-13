# Testing Strategy

## What is worth testing here

The brief asks for "correct business logic and behavior" to be ensured by automated
tests. So the tests concentrate on the three things that can actually be wrong in
this application:

1. **The domain rules**, including every refusal path — a rule that is only tested on
   its happy path is not tested.
2. **The state transitions** — what the store holds after a request succeeds, fails,
   or is rejected with `401`.
3. **The contracts** — the status code and body each endpoint produces, and the shape
   the client turns them into.

Rendering is tested where behavior is visible through it (a disabled sensor model, a
sort indicator, a warning chip), not for its own sake. There are no snapshot tests:
they would fail on styling changes and pass on broken logic.

## Levels

| Level | Where | Runner | What it covers |
|-------|-------|--------|----------------|
| Pure domain rules | `libs/shared` | Jest | Schemas and rule predicates, no I/O |
| Services | `apps/api/.../*.service.spec.ts` | Jest + repository fakes | Business rules and refusals, no database |
| Repositories | `apps/api/.../*.repository.spec.ts` | Jest + PostgreSQL | SQL that is too specific to fake: paging, ordering, aggregates, conflict handling |
| Routes | `apps/api/.../*.routes.spec.ts` | Jest + Supertest | Status codes, validation, auth, the error body |
| Slices & middlewares | `apps/web/src/**/*.spec.ts` | Vitest | State transitions, with `fetch` stubbed |
| Components | `apps/web/src/**/*.spec.tsx` | Vitest + Testing Library | Behavior a user can reach |

Two runners by decision, not accident — see
[D12](./11-decisions.md#d12--vitest-for-the-frontend-jest-for-the-backend). Both sit
behind the same `nx test` target.

## Current counts

| Project | Files | Tests | Runner | Needs the database |
|---------|-------|-------|--------|--------------------|
| `libs/shared` | 5 | 46 | Jest | no |
| `apps/api` | 14 | 137 | Jest | yes |
| `apps/web` | 17 | 86 | Vitest | no |
| **Total** | **36** | **269** | | |

All three were run and observed at these numbers. Warm, the API suite finishes in
about 5 seconds and the web suite in about 4. One earlier run took ~18 minutes — a
cold `ts-jest` compile while the web suite and two dev servers competed for the same
CPU — so the frontend also has a command that needs no database at all:

```bash
npx nx run-many -t typecheck test lint -p web      # seconds, no database
npx nx run-many -t test lint -p shared api web     # everything
```

## What the design buys the tests

**Services are tested without a database.** Repositories are interfaces with a Prisma
implementation, injected in `container.ts`, so a service test constructs the service
with a fake and asserts on the rule:

```ts
// a Fan machine with a TcAg installed cannot become a Pump
await expect(service.update(id, userId, { type: "Pump" }))
  .rejects.toBeInstanceOf(ConflictError);
```

That is why the refusal paths are covered exhaustively rather than sampled: each one
costs milliseconds.

**The store is tested through real dispatches.** `createStore(preloadedState)` gives
each test an isolated store, `fetch` is stubbed, and the assertion is on the state a
real thunk produced — not on dispatched action objects:

```ts
await store.dispatch(fetchMachines());
expect(store.getState().machines).toMatchObject({ status: "succeeded", items: machines });
```

**Components are tested through their providers.** `renderWithProviders` mounts a
component with the store, the theme and a router, exactly as in production, and
returns the store so an interaction can be checked by its effect on state.

## Behaviors that are explicitly pinned

| Behavior | Test |
|----------|------|
| `TcAg`/`TcAs` refused on a `Pump`, at every layer | `sensor.spec.ts`, `monitoring-points.service.spec.ts`, `monitoring-points.routes.spec.ts`, `SensorFormDialog.spec.tsx` |
| `Fan → Pump` conflict with a blocked sensor installed | `machines.service.spec.ts`, `machines.routes.spec.ts`, `machines.slice.spec.ts` (list left untouched) |
| A refused sensor install leaves the previous sensor in place | `monitoring-points.service.spec.ts` |
| Paging, ordering by each of the four columns, and the `id` tie-breaker | `monitoring-points.repository.spec.ts` |
| Zero-based MUI page ↔ one-based API page | `monitoring-points.slice.spec.ts` |
| Clicking the active column flips direction; a new column starts ascending; both return to page 1 | `monitoring-points.slice.spec.ts` |
| Duplicate readings skipped, `received` ≠ `inserted` surfaced | `time-series.repository.spec.ts`, `time-series.slice.spec.ts` |
| A timestamp without a time zone is rejected | `reading.spec.ts`, `IngestReadingsDialog.spec.ts` |
| Another user's resource answers `404` | `*.routes.spec.ts` |
| Any `401` ends the session — except a failed login | `auth-middleware.spec.ts` |
| A stored token is validated before the private area renders | `RequireAuth.spec.tsx` |
| The token reaches `localStorage` only through the middleware | `token-persistence-middleware.spec.ts` |
| Network failures and non-JSON error bodies become `ApiError` | `http-client.spec.ts` |
| The card grid has no negative margin and no `auto-fit` | `ResponsiveGrid.spec.tsx` |
| A full `MAX_READINGS_PER_BATCH` batch is accepted (the ingest limit really is larger than the default) | `time-series.routes.spec.ts`, `app.spec.ts` |
| An oversized body answers `413`, not `500` | `app.spec.ts` |

The last three exist because the bugs they describe were real: a layout regression
([D11](./11-decisions.md#d11--native-css-grid-instead-of-mui-5s-grid)) and an ingest
limit that made the documented batch size unreachable
([Performance](./14-performance.md#what-these-measurements-found)). Both were found
after the feature was "done", which is why they are pinned rather than just fixed.

## Conventions

- **Never weaken a test to make it pass**, and never mock the behavior under test.
- **Add the refusal case with the feature.** A rule test and its violation test are
  one unit of work.
- **Tests must be locale- and machine-independent.** One assertion originally compared
  a formatted number to `"1.23"` and failed on a `pt-BR` machine; it now compares
  against `toLocaleString()`.
- **Fixtures are shared and deterministic** (`src/test/fixtures.ts`,
  `makeMachine`/`makeMonitoringPoint`/`makeReadings`), so a test reads as the delta
  from a known baseline.

## Known gaps

Stated so they are not mistaken for coverage.

| Gap | Consequence | Mitigation |
|-----|-------------|------------|
| **No browser-based end-to-end test** | Nothing automated proves the full click-path across pages | A full flow was verified manually (below); Cypress is the next backlog item |
| **jsdom is not a layout engine** | `ResponsiveGrid`'s column counts are asserted from the generated stylesheet, not from measured geometry; media queries are not resolved | Visual check in a real browser, plus the structural assertions |
| **No load or soak test** | Latency is known for single requests, not under concurrency | [Performance](./14-performance.md) states exactly what was measured |
| **The API suite needs a live database** | Slow, and not runnable in a bare CI job without a service container | The frontend has a separate fast command |

## End-to-end verification

Not automated, so recorded here as what was actually executed and observed, through
the Vite dev-server proxy on `localhost:4200` against the real API and database:

| Step | Observed |
|------|----------|
| `POST /api/auth/login` with the seeded credentials | token returned |
| `GET /api/auth/me` | the seeded user |
| `POST /api/machines` (`Fan`) | `201`, machine created |
| `POST /api/machines/:id/monitoring-points` | `201`, point created |
| `PUT /api/monitoring-points/:id/sensor` (`TcAg` on a `Fan`) | `200`, allowed as the rule requires |
| `GET /api/monitoring-points?page=1&pageSize=5&sortBy=machineName&order=asc` | paginated, ordered page |
| `POST /api/monitoring-points/:id/readings` (2 readings) | `{ "received": 2, "inserted": 2 }` |
| `GET …/readings/metrics` | `count 2, min 1, max 2, avg 1.5`, with both timestamps |
| `GET /api/readings/count` | `{ "count": 2 }` |
| `PATCH /api/machines/:id` → `Pump` with the `TcAg` installed | **`409`**, as [BR-2](./07-business-rules.md#br-2--a-machines-type-cannot-change-into-a-violation-of-br-1) requires |
| `DELETE /api/machines/:id` | `204`, cascade |

The proxy was also verified to honour `VITE_API_PROXY_TARGET`: pointed at a dead
port, the dev server answered `502` with `ECONNREFUSED` on that port, which is how a
real defect in that variable's handling was found and fixed.
