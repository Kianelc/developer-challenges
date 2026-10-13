# Requirements Traceability

Each requirement from `../../full-stack-challenge.md` mapped to where it is
implemented and where it is tested. Use this to check the submission without reading
the whole codebase.

Legend: ✅ implemented · ⚠️ implemented with a documented interpretation · ❌ not
implemented (scope decision)

## 1 — Authentication

| Requirement | Status | Implementation | Tests |
|---|---|---|---|
| Log in with a fixed email and password | ✅ | `auth.service.ts`, `LoginPage.tsx`; user from the seed ([A1](./12-assumptions.md#a1--log-in-using-a-fixed-email-and-password)) | `auth.service.spec.ts`, `auth.routes.spec.ts`, `LoginPage.spec.tsx`, `auth.slice.spec.ts` |
| Log out | ✅ | `auth.routes.ts`, `MainNav.tsx`, `signOut` thunk | `auth.slice.spec.ts`, `token-persistence-middleware.spec.ts` |
| No private route reachable without authentication | ✅ | `auth.middleware.ts` (server), `RequireAuth.tsx` (client) | `*.routes.spec.ts` unauthorized cases, `RequireAuth.spec.tsx` |

## 2 — Machine management

| Requirement | Status | Implementation | Tests |
|---|---|---|---|
| Create with a name and a type from `["Pump","Fan"]` | ✅ | `machines.service.ts`, `MachineFormDialog.tsx`, `createMachineSchema` | `machines.service.spec.ts`, `machine.spec.ts`, `machines.slice.spec.ts` |
| Edit name and type | ✅ | `MachinesService.update` (with the conflict guard) | `machines.service.spec.ts`, `machines.routes.spec.ts` |
| Delete | ✅ | `MachinesService.remove`, cascades in the schema | `machines.service.spec.ts`, `MachinesTable.spec.tsx` |

## 3 — Monitoring points and sensors

| Requirement | Status | Implementation | Tests |
|---|---|---|---|
| At least two points per machine | ⚠️ | UI warning only — the API does not enforce it ([A3](./12-assumptions.md#a3--create-at-least-two-monitoring-points)) | `machines.slice.spec.ts` (`selectMachinesBelowMinimumPoints`) |
| Associate a sensor with a unique id and a model from the list | ✅ | `MonitoringPointsService.assignSensor`, `SensorFormDialog.tsx`; id is the PK ([A2](./12-assumptions.md#a2--sensor-id-uniqueness-per-point-per-machine-or-global)) | `monitoring-points.service.spec.ts`, `SensorFormDialog.spec.tsx` |
| Prevent `TcAg`/`TcAs` on `Pump` | ✅ | `isSensorModelAllowed` in `libs/shared`, enforced at `422` and in the form ([BR-1](./07-business-rules.md#br-1--tcag-and-tcas-cannot-be-installed-on-a-pump)) | `sensor.spec.ts`, `monitoring-points.service.spec.ts`, `monitoring-points.routes.spec.ts`, `SensorFormDialog.spec.tsx` |
| Paginated list, 5 per page, with the four required columns | ✅ | `monitoring-points.repository.ts`, `MonitoringPointsTable.tsx` | `monitoring-points.repository.spec.ts`, `monitoring-points.slice.spec.ts`, `MonitoringPointsTable.spec.tsx` |
| Sort by any column, ascending and descending | ✅ | SQL ordering with an `id` tie-breaker; `SortableTableHead` | same as above |

## 4 — Ambiguity handling

| Requirement | Status | Where |
|---|---|---|
| Make reasonable assumptions | ✅ | [Assumptions](./12-assumptions.md) — 15 entries, each with the alternative reading |
| Document them | ✅ | Same file, linked from the [root README](../README.md#documentation) |

## 5 — Technical requirements

| Requirement | Status | Evidence |
|---|---|---|
| TypeScript | ✅ | Whole repository; `strict` in `tsconfig.base.json` |
| React | ✅ | React 18.3.1 (pinned for MUI 5 — [D1](./11-decisions.md#d1--vite-over-nextjs)) |
| Redux for global state | ✅ | Redux Toolkit 2.13; five slices in `apps/web/src/features/*` |
| Redux Thunk **or** Saga | ✅ | `createAsyncThunk` throughout ([D3](./11-decisions.md#d3--thunks-over-redux-saga)) |
| Next.js **or** Vite | ✅ | Vite 8 ([D1](./11-decisions.md#d1--vite-over-nextjs)) |
| Material UI 5 | ✅ | `@mui/material` 5.18.0; theme in `apps/web/src/theme` |
| Reusable components | ✅ | `components/common/*`: `PageHeader`, `ConfirmDialog`, `ErrorAlert`, `EmptyState`, `StatCard`, `SortableTableHead` (generic over the sort field), `ResponsiveGrid`, the form-field wrappers, `AppSnackbar` |
| Well-organized and documented code | ✅ | Feature folders, lint-enforced layering ([Architecture](./04-architecture.md)), doc comments on non-obvious decisions, this `/docs` set |
| Responsive layout | ✅ | Sidebar → drawer below `lg`; stacking page headers; tables scroll inside their card; `ResponsiveGrid` |
| Automated unit tests for business logic | ✅ | [Testing Strategy](./09-testing-strategy.md) |

## 6 — Back-end requirements

| Requirement | Status | Evidence |
|---|---|---|
| Own backend on Node.js | ✅ | Express 5 + TypeScript in `apps/api` |
| PostgreSQL or MongoDB | ✅ | PostgreSQL 16 via Docker Compose |
| Prisma (or Drizzle/Kysely) for PostgreSQL | ✅ | Prisma 7.10.0; client confined to repositories by lint rule |
| REST endpoints for all required functionality | ✅ | [API Contracts](./06-api-contracts.md) |
| Time-series storage and retrieval | ✅ | `time-series` module; composite-key `Reading` |
| Proper error handling and validation | ✅ | Zod on every payload; one `AppError` hierarchy; one global handler; one error body shape |
| Unit tests for backend code | ✅ | Service tests against repository fakes, plus route tests through Supertest |
| Latency below 350 ms | ✅ | Measured — see [Performance](./14-performance.md). The batch cap was lowered to 4 000 to keep the largest ingest inside the budget after readings grew |

## 7 — Time-series data management

| Requirement | Status | Implementation |
|---|---|---|
| Store raw data as time series | ✅ | `POST /monitoring-points/:id/readings`, batches ≤ 4 000, each reading carrying its quantity |
| Retrieve metrics | ✅ | `GET …/readings/metrics`, one SQL aggregate, scoped to one quantity ([A6](./12-assumptions.md#a6--which-metrics), [BR-15](./07-business-rules.md#br-15--an-aggregate-covers-exactly-one-quantity)) |
| Delete data I have sent | ✅ | `DELETE …/readings`, whole series or a range ([A7](./12-assumptions.md#a7--must-deletion-be-all-or-by-range)) |
| Retrieve the number stored | ✅ | `GET /readings/count` — readings, not series ([A5](./12-assumptions.md#a5--what-is-a-time-series-as-a-resource)) |
| Retrieve a full series | ✅ | `GET …/readings` with no range |
| Visualize in a chart | ✅ | `ReadingsChart.tsx` (Recharts): a numeric time axis with span-aware ticks, a Y axis labelled with the quantity and its unit, legend and unit-aware tooltip, and **one chart per quantity** so incompatible units never share an axis |

## 8 — Bonus

| Bonus | Status | Note |
|---|---|---|
| Nx monorepo | ✅ | Two apps + one shared library |
| Cypress end-to-end tests | ❌ | Next item in the [backlog](./10-implementation-plan.md#next); flows covered by component tests and a verified manual pass |
| Refactor provided baseline code | n/a | No baseline was provided; the one refactor done is recorded as [D11](./11-decisions.md#d11--native-css-grid-instead-of-mui-5s-grid) |
| Cloud deployment | ❌ | [Non-goals](./01-requirements.md#non-goals) |
| Future prediction | ❌ | Would need a method defensible with real data |
| Load balancer | ❌ | Infrastructure, not application design |
| Load tests | ❌ | Same |

## Evaluation criteria

| Criterion | Where to look |
|---|---|
| Anyone can follow the instructions and run it | [Root README](../README.md#setup) — six steps |
| User stories implemented as specified | Sections 1–3 and 7 above |
| Frontend integrated with the backend API | Every screen calls real endpoints; [verification](./09-testing-strategy.md#end-to-end-verification) |
| Backend integrated with persistent storage | Prisma + PostgreSQL; migrations in `apps/api/prisma/migrations` |
| Time-series stored, processed, visualized | Section 7 above |
| Refactoring and unit tests on both sides | [Testing Strategy](./09-testing-strategy.md), [D11](./11-decisions.md#d11--native-css-grid-instead-of-mui-5s-grid) |
| Best practices on both sides | [Architecture](./04-architecture.md) — layering, lint-enforced boundaries, no duplicated rules |
| API performance | [Performance](./14-performance.md) |
| Problem-solving and handling ambiguity | [Assumptions](./12-assumptions.md), [Decisions](./11-decisions.md) |
| Code quality, readability, maintainability | Feature folders, one error shape, shared rules, generic table head |
| Code well organized and documented | [Architecture](./04-architecture.md#frontend-layering), this document set |
| Atomic, semantic commits | `git log` on `kiane-casagrande` — Conventional Commits with the reasoning in each body |
