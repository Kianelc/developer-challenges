# Dynamox Full-Stack Challenge — Kiane Casagrande

TypeScript monorepo (Nx) with an Express 5 REST API backed by PostgreSQL.

- `apps/api` — Express 5 + Prisma 7 + PostgreSQL 16
- `apps/web` — Next.js + React + MUI 5 + Redux Toolkit _(not implemented yet)_
- `libs/shared` — Zod schemas, domain types and business rules shared between apps

---

## Requirements

- Node.js 20+
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

---

## Running tests and lint

```bash
npx nx run-many -t test lint -p shared api
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
Batch limit: **5 000 readings** per request.  
`from` and `to` are both inclusive. Duplicate `(monitoringPointId, timestamp)` pairs are silently skipped.

### Error format

```json
{
  "error": {
    "code": "VALIDATION_ERROR | NOT_FOUND | UNAUTHORIZED | CONFLICT | BUSINESS_RULE_VIOLATION | INTERNAL_ERROR",
    "message": "Human-readable description",
    "details": [{ "path": "field", "message": "what is wrong" }]
  }
}
```

---

## Frontend integration

The frontend (`apps/web`) will use **Next.js rewrites** to proxy all `/api/*` requests to the backend, avoiding CORS entirely:

```ts
// apps/web/next.config.ts
export default {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000"}/api/:path*`,
      },
    ];
  },
};
```

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

### Enum ordering
- `MachineType` and `SensorModel` are declared alphabetically in the schema so that PostgreSQL enum sort order matches alphabetical order, making server-side sorting predictable.

### Nx monorepo
- Prisma schema and migrations live in `apps/api/prisma/`; the root `prisma.config.ts` points to them.
- The generated Prisma client (`apps/api/src/generated/prisma/`) is git-ignored and must be regenerated after `npm install` or a schema change.
- `libs/shared` is imported as `@full-stack-solution/shared`; the generated Prisma client may only be imported in `*.repository.ts`, `database/` and `container.ts` (enforced by ESLint).
