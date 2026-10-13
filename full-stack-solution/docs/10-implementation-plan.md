# Implementation Plan

The order of delivery, what is done, and what is deliberately left. Status reflects
the repository at the time of writing; the commit history on branch
`kiane-casagrande` is the authority.

## Sequencing principle

Bottom-up, and **vertical slices only**: a capability is not "done" until the UI calls
the real endpoint, the endpoint hits PostgreSQL and the rules are enforced
server-side. The brief is explicit that a half-built feature counts for less than a
thin end-to-end one, so nothing was built in a layer that could not yet be reached
from the layer above.

The shared library came first because it is what keeps the two sides from drifting
([D9](./11-decisions.md#d9--business-rules-live-in-libsshared)).

## Phases

### Phase 0 — Workspace ✅

Nx monorepo, TypeScript, ESLint, Jest, Docker Compose for PostgreSQL 16, environment
validated at startup with Zod.

Key choice: the lint config forbids importing Prisma outside repositories, so the
layering is enforced by the build rather than by review.

### Phase 1 — Shared domain library ✅

`libs/shared`: Zod schemas for every payload, domain types, and the rule predicates
(`isSensorModelAllowed` and friends), with the page size and the minimum-points
constant.

### Phase 2 — API foundation ✅

Express 5 app factory, `routes → controller → service → repository` layering,
`container.ts` wiring, `AppError` hierarchy and the single global error handler.
Prisma schema, initial migration, seed.

### Phase 3 — Authentication ✅

`POST /auth/login`, `GET /auth/me`, `POST /auth/logout`; JWT HS256 with the algorithm
pinned on verify; bcrypt cost 10; the dummy-hash compare that closes user
enumeration; `authenticate` middleware.

### Phase 4 — Machines ✅

Full CRUD, ownership from the token, the `Fan → Pump` conflict guard
([BR-2](./07-business-rules.md#br-2--a-machines-type-cannot-change-into-a-violation-of-br-1)),
cascade deletes, `monitoringPointsCount` derived for the UI.

### Phase 5 — Monitoring points and sensors ✅

Points under a machine; the paginated, sortable list in SQL with an `id` tie-breaker;
sensor install/replace in a transaction with the Pump rule checked **before** any
write; sensor removal.

### Phase 6 — Time series ✅

Batch ingest (≤ 5 000, duplicates skipped and reported), range reads, SQL metrics,
user-wide count, range deletes. Delivered with the migration that turned `Reading`'s
key into `(monitoringPointId, timestamp)`
([D5](./11-decisions.md#d5--readings-primary-key-is-monitoringpointid-timestamp)).

### Phase 7 — Frontend foundation ✅

Vite + React 18 + MUI 5 ([D1](./11-decisions.md#d1--vite-over-nextjs)); theme adapted
from the Devias template; HTTP client with one normalized error shape; Redux store,
typed hooks, the auth and token-persistence middlewares; Vitest environment and the
`renderWithProviders` helper.

### Phase 8 — Frontend features ✅

In this order, each slice end-to-end: login + route guard → reusable components and
the dashboard shell → machines → monitoring points and sensors → time series →
overview and the route table.

### Phase 9 — Documentation and verification ✅

Root README (setup, API reference, decisions, assumptions), these documents, the
end-to-end verification pass, and atomic Conventional Commits throughout.

### Phase 10 — Layout correction ✅

The card grids were replaced with a gap-based `ResponsiveGrid` after a reported
misalignment ([D11](./11-decisions.md#d11--native-css-grid-instead-of-mui-5s-grid)),
with a regression test.

### Phase 11 — Latency measurement and the ingest body limit ✅

Measuring the 350 ms requirement exposed that the advertised 5 000-reading batch was
unreachable: the ingest path's larger `express.json` limit was dead code, because the
default parser ran first and body-parser skips an already-consumed body. The
effective ceiling was 100 KB (~1 900 readings), and exceeding it answered `500`
instead of `413`.

Fixed by registering the sized parser before the default one, sizing it from
`MAX_READINGS_PER_BATCH`, and mapping `entity.too.large` to `413 PAYLOAD_TOO_LARGE`.
Pinned by a test that posts a full-size batch and one that asserts the `413`.
Numbers in [Performance](./14-performance.md).

## Current state

| Area | Status |
|------|--------|
| Authentication, machines, monitoring points, sensors, time series | Implemented end-to-end |
| `libs/shared` as the single home of the rules | Implemented |
| Responsive layout, reusable components | Implemented |
| Unit tests on both sides | Implemented — see [Testing Strategy](./09-testing-strategy.md) |
| Nx monorepo (bonus) | Implemented |
| End-to-end flow verified against the real API and database | Verified manually |
| Latency below 350 ms | Measured — [Performance](./14-performance.md) |
| Cypress, deployment, prediction, load balancing, load tests (bonuses) | Not implemented |

## Backlog

In the order it would be picked up.

### Next

1. **Cypress end-to-end test** of one full flow: log in → create a machine → add two
   points → install a sensor → send readings → see the chart → log out. The bonus
   that most directly strengthens the submission.
2. **A sustained latency measurement** — a repeated run against a larger dataset, to
   turn the spot checks in [Performance](./14-performance.md) into a trend.
3. **`helmet` and login rate limiting** — cheap, and closes the two gaps named in
   [Security](./08-security.md#not-implemented).

### Later, with a reason to

4. **Deployment** to a cloud provider, with the SPA and the API behind one origin so
   the no-CORS property survives production.
5. **Server-side pagination for the readings list** if a series ever outgrows what one
   response should carry; today the chart receives the range the user asked for.
6. **Reading retention or partitioning**, driven by measurements rather than
   anticipation — the project's own principle is to optimize only with numbers.
7. **Refresh tokens in `HttpOnly` cookies**, if the auth surface is ever allowed to
   grow past "one fixed user".
8. **Prediction of future values**, once a method can be defended with real data.

## Working agreements kept throughout

- Conventional Commits, atomic, in English, with the reasoning in the body — the
  commit log is meant to be defensible in a technical interview.
- Tests added or updated with every behavior change, refusal cases included; a test
  is never weakened to make it pass.
- `npx nx run-many -t test lint -p shared api web` before committing.
- Schema changes go through migrations; an applied migration is never edited.
- No claim that tests, lint, builds or latency passed without running and observing
  them.
