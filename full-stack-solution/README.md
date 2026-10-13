# Dynamox Full-Stack Challenge — Kiane Casagrande

TypeScript monorepo (Nx) with an Express 5 REST API backed by PostgreSQL and a
React single-page application.

- `apps/api` — Express 5 + Prisma 7 + PostgreSQL 16
- `apps/web` — Vite + React 18 + TypeScript + MUI 5 + Redux Toolkit
- `libs/shared` — Zod schemas, domain types and business rules shared between apps

---

## Requirements

- Node.js `^20.19` or `>=22.12` (required by Vite 8)
- Docker (for PostgreSQL)
- npm 10+

---

## Setup

### 1. Clone and install dependencies

```bash
git clone <repo-url>
cd full-stack-solution
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in all required fields:

| Variable           | Description                                                       |
|--------------------|-------------------------------------------------------------------|
| `POSTGRES_USER`    | PostgreSQL username (choose any value)                            |
| `POSTGRES_PASSWORD`| PostgreSQL password (choose any value)                            |
| `POSTGRES_DB`      | Database name (default: `dynamox`)                                |
| `POSTGRES_PORT`    | Host port mapped to PostgreSQL (default: `5432`)                  |
| `DATABASE_URL`     | Prisma connection string — must match the credentials above       |
| `PORT`             | API port (default: `3000`)                                        |
| `JWT_SECRET`       | Random string ≥ 32 characters (`openssl rand -hex 32`)            |
| `JWT_EXPIRES_IN`   | Token lifetime (default: `1h`)                                    |
| `SEED_USER_EMAIL`  | Email for the fixed login user created by the seed                |
| `SEED_USER_PASSWORD` | Password for that user (min. 8 characters)                      |

Example `DATABASE_URL`:
```
DATABASE_URL=postgresql://myuser:mypassword@localhost:5432/dynamox?schema=public
```

### 3. Start the database

```bash
docker compose up -d
```

Wait for the health check to pass (the `db` service shows `(healthy)`):

```bash
docker compose ps
```

### 4. Run migrations and seed the database

```bash
npx prisma migrate deploy   # apply all migrations
npx prisma db seed          # create the login user from SEED_USER_EMAIL / SEED_USER_PASSWORD
```

### 5. Start the API

```bash
npx nx serve api
```

The API is available at `http://localhost:3000/api`.

Health check: `GET http://localhost:3000/api/health` → `{"status":"ok"}`

### 6. Start the web app

In a second terminal, with the API already running:

```bash
npx nx serve web
```

Open `http://localhost:4200` and sign in with `SEED_USER_EMAIL` /
`SEED_USER_PASSWORD`.

The dev server proxies `/api/*` to the API (`VITE_API_PROXY_TARGET`, default
`http://localhost:3000`), so the browser only ever talks to one origin and no
CORS configuration is needed.

---

## Running tests and lint

```bash
# everything
npx nx run-many -t test lint -p shared api web

# frontend only (fast: no database required)
npx nx run-many -t typecheck test lint -p web
```

`api` tests talk to the PostgreSQL container, so it must be running. The `web`
tests are unit/component tests with Vitest + Testing Library and stub `fetch`;
they need neither the API nor the database.

Production build of the SPA (output in `dist/apps/web`):

```bash
npx nx build web
```

---

## API reference

All endpoints except `POST /api/auth/login` require the header:

```
Authorization: Bearer <accessToken>
```

### Authentication

| Method | Path              | Body / query                        | Response                              |
|--------|-------------------|-------------------------------------|---------------------------------------|
| POST   | `/api/auth/login` | `{ email, password }`               | `{ accessToken, user: { id, email } }`|
| GET    | `/api/auth/me`    | —                                   | `{ id, email }`                       |
| POST   | `/api/auth/logout`| —                                   | 204                                   |

### Machines

| Method | Path                  | Body                      | Response               |
|--------|-----------------------|---------------------------|------------------------|
| GET    | `/api/machines`       | —                         | `Machine[]`            |
| POST   | `/api/machines`       | `{ name, type }`          | `Machine` (201)        |
| PATCH  | `/api/machines/:id`   | `{ name?, type? }`        | `Machine`              |
| DELETE | `/api/machines/:id`   | —                         | 204                    |

`type` must be `"Pump"` or `"Fan"`.

### Monitoring points

| Method | Path                                       | Body / query                       | Response                    |
|--------|--------------------------------------------|------------------------------------|------------------------------|
| POST   | `/api/machines/:id/monitoring-points`      | `{ name }`                         | `MonitoringPoint` (201)      |
| GET    | `/api/monitoring-points`                   | `page`, `pageSize`, `sortBy`, `order` | `Paginated<MonitoringPoint>` |
| PATCH  | `/api/monitoring-points/:id`               | `{ name }`                         | `MonitoringPoint`            |
| DELETE | `/api/monitoring-points/:id`               | —                                  | 204                          |
| PUT    | `/api/monitoring-points/:id/sensor`        | `{ id, model }`                    | `Sensor`                     |
| DELETE | `/api/monitoring-points/:id/sensor`        | —                                  | 204                          |

**List query parameters:**

| Parameter  | Default        | Allowed values                                     |
|------------|----------------|----------------------------------------------------|
| `page`     | `1`            | integer ≥ 1                                        |
| `pageSize` | `5`            | 1–50                                               |
| `sortBy`   | `machineName`  | `machineName`, `machineType`, `name`, `sensorModel`|
| `order`    | `asc`          | `asc`, `desc`                                      |

Sensor `model` must be `"TcAg"`, `"TcAs"` or `"HF+"`.  
`TcAg` and `TcAs` are **not** allowed on `Pump` machines (returns 422).

### Time-series data

| Method | Path                                            | Body / query              | Response                   |
|--------|-------------------------------------------------|---------------------------|----------------------------|
| POST   | `/api/monitoring-points/:id/readings`           | `{ readings: Reading[] }` | `{ received, inserted }` (201) |
| GET    | `/api/monitoring-points/:id/readings`           | `from?`, `to?`            | `Reading[]`                |
| GET    | `/api/monitoring-points/:id/readings/metrics`   | `from?`, `to?`            | `ReadingsMetrics`          |
| GET    | `/api/readings/count`                           | —                         | `{ count }`                |
| DELETE | `/api/monitoring-points/:id/readings`           | `from?`, `to?`            | `{ deleted }`              |

`Reading`: `{ timestamp: string (ISO 8601 with time zone), value: number }`  
Batch limit: **5 000 readings** per request (~264 KB; the ingest path accepts up to
1 MB and answers `413` beyond that).  
`from` and `to` are both inclusive. Duplicate `(monitoringPointId, timestamp)` pairs are silently skipped.

### Error format

```json
{
  "error": {
    "code": "VALIDATION_ERROR | NOT_FOUND | UNAUTHORIZED | CONFLICT | BUSINESS_RULE_VIOLATION | PAYLOAD_TOO_LARGE | INTERNAL_ERROR",
    "message": "Human-readable description",
    "details": [{ "path": "field", "message": "what is wrong" }]
  }
}
```

---

## Frontend

Single-page application built with Vite, React 18, TypeScript, Material UI 5 and
Redux Toolkit.

### Screens

| Route                | What it does                                                                        |
|----------------------|-------------------------------------------------------------------------------------|
| `/login`             | Sign in with the seeded credentials. The only public route.                          |
| `/`                  | Overview: counters, machines below the recommended number of monitoring points.      |
| `/machines`          | Create, edit and delete machines; add a monitoring point to a machine.               |
| `/monitoring-points` | Paginated (5/page) and sortable list; assign, replace or remove sensors; rename; delete. |
| `/time-series`       | Send readings, chart the raw series, read metrics, delete readings by range.          |

### Structure

```
apps/web/src
├── api/            HTTP client and normalized API errors
├── app/            store, typed hooks, auth middleware, routes
├── components/
│   ├── common/     reusable building blocks (tables, dialogs, form fields, cards)
│   └── layout/     dashboard shell: sidebar, top bar, mobile drawer
├── features/       one folder per domain: <name>.api.ts, <name>.slice.ts, components
├── routes/         route paths
├── test/           Vitest setup, render helper, fixtures
├── theme/          MUI 5 theme (tokens + component overrides)
└── utils/          formatting helpers
```

Each feature owns its API calls, its slice and its components. Business rules
are never re-implemented: they are imported from `libs/shared`, the same module
the API validates against (`loginSchema`, `createMachineSchema`,
`assignSensorSchema`, `createReadingsSchema`, `isSensorModelAllowed`,
`MONITORING_POINTS_PAGE_SIZE`, `MIN_MONITORING_POINTS_PER_MACHINE`).

### State management

- **Redux Toolkit** holds the global state: session, machines, monitoring points
  (including the list query), time series and notifications.
- **Asynchronous side effects use thunks** (`createAsyncThunk`). Redux Saga was
  considered and rejected: there are no long-lived, cancellable or orchestrated
  flows here, so sagas would add a second mental model and generator plumbing
  for no benefit. Every thunk reads the token from the store, calls the feature
  API module and rejects with a serialized error, which keeps the reducers free
  of class instances Redux cannot serialize.
- Two small **middlewares** keep cross-cutting concerns out of the features:
  `app/auth-middleware.ts` ends the session whenever any request is rejected
  with 401 (a failed login is excluded, since a wrong password is also a 401),
  and `app/token-persistence-middleware.ts` mirrors the token into
  `localStorage`, so the reducers stay pure and persistence lives in one place.
- Local UI state (open dialogs, form values, date inputs) stays in the
  components. Forms use react-hook-form with the shared Zod schemas.

### Reusable components

`PageHeader`, `ConfirmDialog`, `ErrorAlert` (renders the API's field-level
`details`), `EmptyState`, `StatCard`, `SortableTableHead` (generic over the sort
field, so a column the API cannot sort by does not compile), `FormTextField`,
`FormSelectField`, `AppSnackbar`.

### Responsiveness

The sidebar is permanent from `lg` up and becomes a drawer below it; page
headers stack their action on `xs`; tables scroll horizontally inside their card
instead of breaking the layout; cards and metric tiles use a 1/2/4-column grid.

### Base template

The layout, theme tokens (colors, typography, shadows, radii) and component
overrides are adapted from
[Devias Material Kit React](https://github.com/devias-io/material-kit-react)
(MIT), as suggested by the challenge. What had to change: that template targets
MUI 7 and React 19 and styles everything through CSS variables
(`var(--mui-palette-*)`), which **do not exist in MUI 5**, so every token
reference was rewritten against the `theme` object; Phosphor icons were replaced
with `@mui/icons-material`; Next.js routing (`next/link`, `usePathname`) was
replaced with React Router; and ApexCharts with Recharts. Files carrying adapted
code say so in their header comment.

### Performance notes

Route components are lazily loaded, so the login screen does not download the
dashboard and the charting library only arrives with the time-series page. The
monitoring points list is paginated and sorted **on the server**, so the client
never holds more than one page.

---

## Design decisions and assumptions

### Authentication
- JWT HS256, returned in the response body (`accessToken`). The client must store and send it as a `Bearer` token.
- **Logout is stateless:** the server discards nothing; the client drops the token. A logged-out token remains technically valid until it expires. This is an intentional trade-off to avoid a token blacklist.
- `createdById` always comes from the verified JWT, never from the request body. Accessing a resource owned by another user returns 404 (not 403) to avoid leaking existence.

### Machines
- Changing a machine's type from `Fan` to `Pump` while it has `TcAg` or `TcAs` sensors installed returns **409 Conflict**.
- Deleting a machine cascades to its monitoring points, which cascade to their sensors and readings.

### Monitoring points and sensors
- "At least 2 monitoring points per machine" is a **UI-level warning only**; the API does not enforce a minimum.
- `PUT /monitoring-points/:id/sensor` **replaces** the current sensor in a transaction. The Pump sensor rule is checked before any data is written; if the rule is violated, the existing sensor is preserved.
- Sensor `id` is provided by the user and must be **globally unique** (it is the primary key). Re-assigning the same sensor ID to the same point it is already on replaces it in place.

### Time-series data
- A "time-series" belongs to a monitoring point; there is no separate "series" entity.
- **Duplicate timestamps are silently ignored.** The response includes `received` (total sent) and `inserted` (actually written), so callers can detect re-submissions without receiving an error. This makes batch re-delivery safe.
- Sensor model `HF+` is stored in the database as `HF_PLUS` (PostgreSQL enum restriction) and converted transparently. The API always exposes `"HF+"`.

### Frontend
- **Token storage:** the JWT is kept in `localStorage` so a reload does not sign
  the user out. It is readable by any script on the origin (XSS); the API returns
  the token in the body and sets no cookie, so the client must store it
  somewhere, and a short `JWT_EXPIRES_IN` limits the exposure. A refresh-token
  flow with an `HttpOnly` cookie would be the production answer and is out of
  scope here.
- **Session restore:** a token found in storage is validated against
  `GET /api/auth/me` before the private routes render, so a stale token cannot
  briefly show the dashboard.
- **The Pump sensor rule is checked twice on purpose:** the form disables TcAg
  and TcAs (showing *why* they are disabled) and refuses to submit them, while
  the API remains the authority and answers 422. The rule itself exists once, in
  `libs/shared`.
- **The "at least 2 monitoring points" requirement is a warning**, consistent
  with the API: the overview and the machines list flag the machines below the
  minimum but nothing is blocked.
- **Readings are sent as a JSON payload** instead of a one-reading-at-a-time
  form: the real producer is a sensor gateway, so a batch payload is closer to
  the actual contract. It is validated with the shared schema before any
  request, and a sample series can be generated to exercise the flow.
- **After a mutation the affected lists are refetched** rather than patched
  locally, because pagination and sorting happen on the server and a local
  insert could place a row on the wrong page.
- **Only a light theme** is provided; a dark scheme would double the styling
  surface with no requirement behind it.

### Enum ordering
- `MachineType` and `SensorModel` are declared alphabetically in the schema so that PostgreSQL enum sort order matches alphabetical order, making server-side sorting predictable.

### Nx monorepo
- Prisma schema and migrations live in `apps/api/prisma/`; the root `prisma.config.ts` points to them.
- The generated Prisma client (`apps/api/src/generated/prisma/`) is git-ignored and must be regenerated after `npm install` or a schema change.
- `libs/shared` is imported as `@full-stack-solution/shared`; the generated Prisma client may only be imported in `*.repository.ts`, `database/` and `container.ts` (enforced by ESLint).
