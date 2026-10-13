# Architecture

## Shape

An Nx monorepo with two applications and one library. The library exists so that the
rules the two applications share have exactly one home.

```
full-stack-solution/
├── apps/api        Express 5 REST API  ──────┐
├── apps/web        Vite + React 18 SPA  ─────┤── both import
└── libs/shared     Zod schemas, types, rules ┘
```

| Package | Stack | Responsibility |
|---------|-------|----------------|
| `apps/api` | Express 5, TypeScript, Prisma 7.10, PostgreSQL 16, jsonwebtoken, bcryptjs | Owns the data and the rules. The only writer to the database. |
| `apps/web` | Vite 8, React 18.3, MUI 5.18, Redux Toolkit 2.13, React Router 6, Recharts 3, react-hook-form | Renders the state and collects input. Holds no rule the server does not also enforce. |
| `libs/shared` | Zod 4 | Request/response schemas, domain types and the pure functions behind the sensor rules. Imported as `@full-stack-solution/shared`. |

Nx was chosen partly because the brief lists it as a bonus, but mostly because the
shared library is the whole point: with one `tsconfig` path, a rule change in
`libs/shared` breaks the compile of whichever side drifted.

## Runtime topology

```
┌─────────────┐   /api/*    ┌──────────────────┐   SQL    ┌──────────────┐
│  Browser    │ ──────────► │  Vite dev server │ ───────► │              │
│  (SPA)      │             │  (proxy :4200)   │          │              │
└─────────────┘             └────────┬─────────┘          │  PostgreSQL  │
                                     │ proxies to         │  16 (Docker) │
                                     ▼                    │              │
                            ┌──────────────────┐  Prisma  │              │
                            │  Express API     │ ───────► │              │
                            │  :3000           │          └──────────────┘
                            └──────────────────┘
```

The browser only ever talks to its own origin. In development the Vite dev server
proxies `/api` to Express (`apps/web/vite.config.mts`); in production both are served
behind one origin. **There is therefore no CORS configuration anywhere in the
codebase** — the problem was removed rather than configured. `VITE_API_URL` exists for
the case where the API has to live on another origin.

## Backend layering

Every module in `apps/api/src/modules/<name>/` is the same four files:

```
routes  ──►  controller  ──►  service  ──►  repository  ──►  Prisma
   │             │               │              │
   │             │               │              └─ all database access, the only
   │             │               │                 place Prisma types are imported
   │             │               └─ business rules; knows nothing about HTTP or SQL
   │             └─ parses input with the Zod schema, calls the service, sets status
   └─ path + auth middleware
```

Why the layers earn their keep here:

- **The service knows no HTTP and no Prisma.** Repositories are interfaces, so a
  service test runs against a fake in memory with no database. That is what makes
  the rule tests fast and exhaustive instead of slow and sampled.
- **Prisma is confined to `*.repository.ts`, `database/` and `container.ts`, and this
  is enforced by ESLint**, not by convention (`eslint.config.mjs` restricts importing
  `@prisma/client` and `**/generated/prisma/**` elsewhere). A leak fails the lint
  task, not a review.
- **Wiring happens only in `container.ts`.** There is no DI framework and no
  decorators: one file constructs the repositories, injects them into the services
  and hands those to the controllers.

### Request flow, with the pieces named

`PUT /api/monitoring-points/:id/sensor`:

1. `auth.middleware.ts` verifies the `Bearer` token (HS256) and puts the user id on
   the request. No token, no further step.
2. `monitoring-points.controller.ts` runs `assignSensorSchema.parse(req.body)`. A
   malformed body stops here as `400 VALIDATION_ERROR`.
3. `monitoring-points.service.ts` loads the point **scoped to the user id**. Not
   found, or owned by someone else → `404`.
4. The same service asks `isSensorModelAllowed(...)` — the function from
   `libs/shared` the browser also called — and throws `BusinessRuleError` → `422` if
   it says no, **before any write**
   ([BR-1](./07-business-rules.md#br-1--tcag-and-tcas-cannot-be-installed-on-a-pump)).
5. `monitoring-points.repository.ts` replaces the sensor inside a transaction, so a
   failed install cannot leave the point without the sensor it had.
6. `error-handler.ts` turns any thrown `AppError` or `ZodError` into the single error
   body shape. Controllers never format errors.

## Frontend layering

`apps/web/src` is organized by feature, not by technical kind — a change to "sensors"
touches one folder:

```
src/
├── api/          http-client.ts (fetch wrapper), api-error.ts (one error shape)
├── app/          store, typed hooks, thunk config, middlewares, routes
├── components/
│   ├── common/   reusable, presentational: tables, dialogs, form fields, cards
│   └── layout/   the shell: sidebar, top bar, mobile drawer
├── features/     one folder per domain:
│   └── <name>/   <name>.api.ts · <name>.slice.ts · its components
├── routes/       path constants
├── test/         Vitest setup, render helper, fixtures
├── theme/        MUI 5 theme
└── utils/        formatting
```

The call chain is always the same, and components never skip a link:

```
component ──► thunk (createAsyncThunk) ──► <feature>.api.ts ──► api/http-client.ts
```

### State

| Kind of state | Where it lives |
|---------------|----------------|
| Session, machines, monitoring points + list query, time series, notifications | Redux Toolkit |
| Open dialogs, form values, the date inputs | Component state |
| Form validation | react-hook-form + the Zod schemas from `libs/shared` |

**Side effects are thunks** ([D3](./11-decisions.md#d3--thunks-over-redux-saga)).
Every thunk reads the token via `requireToken(getState())` and rejects with
`serializeApiError(error)`, so a reducer never receives a class instance Redux cannot
serialize.

Two middlewares hold what would otherwise be copy-pasted into every feature:

- `app/auth-middleware.ts` — ends the session when *any* request is rejected with
  `401`. `signIn` is excluded, because a wrong password is also a `401` and must stay
  on the login form.
- `app/token-persistence-middleware.ts` — the only code that writes the token to
  `localStorage`. Reducers stay pure; persistence follows the store from one place.

### Consequence of server-side paging

Paging and ordering happen in SQL
([D7](./11-decisions.md#d7--pagination-and-sorting-on-the-server)), so the query
(`page`, `pageSize`, `sortBy`, `order`) lives in the slice and the component only
reports which column was clicked. It follows that **after a mutation the list is
refetched, never patched locally** — a local insert could land a row on a page it
does not belong to.

## Cross-cutting conventions

| Concern | Convention |
|---------|-----------|
| Validation | One Zod schema per payload in `libs/shared`, parsed by the controller and reused by the form. |
| Errors | `{ error: { code, message, details? } }`, produced only by the global handler. Normalized client-side into `ApiError`. |
| Authorization | Part of every query's `WHERE`, never a separate check that can be skipped ([BR-10](./07-business-rules.md#br-10--every-row-belongs-to-its-creator-and-another-users-row-does-not-exist)) |
| Enum ordering | Declared alphabetically, which server-side sorting depends on ([BR-12](./07-business-rules.md#br-12--enum-sort-order-must-match-alphabetical-order)) |
| `HF+` | Stored as `HF_PLUS` and converted in exactly one place, `shared/database/sensor-model.mapper.ts` ([Domain Model](./05-domain-model.md#enumerations)) |

## Build and tasks

Commands are in the [root README](../README.md#running-tests-and-lint). Two things
about how the targets are wired:

- `apps/web` wraps the Vite CLI through `nx:run-commands` rather than an Nx Vite
  plugin, which keeps the app free of plugin version constraints — relevant because
  this project is pinned to React 18 for MUI 5
  ([D1](./11-decisions.md#d1--vite-over-nextjs)).
- Route components are lazily loaded, so the login screen does not download the
  dashboard and the charting library only arrives with the time-series page
  ([Performance](./14-performance.md#frontend)).
