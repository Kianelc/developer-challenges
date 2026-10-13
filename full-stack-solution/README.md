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

# frontend only, fastest loop
npx nx run-many -t typecheck test lint -p web

# production build of the SPA → dist/apps/web
npx nx build web
```

No test needs the database or a running API: every repository spec injects a fake
Prisma client and the web tests stub `fetch`. What that buys and what it leaves
unproven is in [Testing Strategy](./docs/09-testing-strategy.md).

---

## API

Base URL `http://localhost:3000/api`. Every endpoint except `POST /auth/login` and
`GET /health` needs `Authorization: Bearer <accessToken>`.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/auth/login` | Exchange credentials for a JWT |
| GET | `/auth/me` | Validate the token, return its owner |
| POST | `/auth/logout` | Stateless logout |
| GET · POST | `/machines` | List · create |
| PATCH · DELETE | `/machines/:id` | Update · delete (cascades) |
| POST | `/machines/:id/monitoring-points` | Create a point on a machine |
| GET | `/monitoring-points` | Paginated, sortable list |
| PATCH · DELETE | `/monitoring-points/:id` | Rename · delete |
| PUT · DELETE | `/monitoring-points/:id/sensor` | Install or replace · remove |
| POST | `/monitoring-points/:id/readings` | Ingest a batch of readings |
| GET | `/monitoring-points/:id/readings` | Read the series, optionally filtered |
| GET | `/monitoring-points/:id/readings/metrics` | Aggregate one quantity |
| DELETE | `/monitoring-points/:id/readings` | Delete the series or a range |
| GET | `/readings/count` | Total readings stored by the user |
| GET | `/health` | Liveness, no authentication |

**Payloads, query parameters, status codes and the error format:**
[API Contracts](./docs/06-api-contracts.md).

---

## Documentation

| Document | What it answers |
|----------|-----------------|
| [Requirements](./docs/01-requirements.md) | What the system does, its constraints and non-goals |
| [Architecture](./docs/04-architecture.md) | How the pieces fit and how a request flows |
| [Domain Model](./docs/05-domain-model.md) | Entities, relationships, schema and invariants |
| [API Contracts](./docs/06-api-contracts.md) | Every endpoint in detail |
| [Business Rules](./docs/07-business-rules.md) | The domain rules and how they fail |
| [Security](./docs/08-security.md) | Authentication, authorization, trade-offs |
| [Testing Strategy](./docs/09-testing-strategy.md) | What is tested, at which level, and the gaps |
| [Implementation Plan](./docs/10-implementation-plan.md) | Status and backlog |
| [Decisions](./docs/11-decisions.md) | Each decision, its alternative and the reasoning |
| [Assumptions](./docs/12-assumptions.md) | Every ambiguity in the brief and how it was resolved |
| [Traceability](./docs/13-requirements-traceability.md) | Where each challenge requirement lives |
| [Performance](./docs/14-performance.md) | The 350 ms requirement, measured |

Start at [docs/README.md](./docs/README.md) for the full index.
