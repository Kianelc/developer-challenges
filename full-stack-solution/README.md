# Dynamox Full-Stack Challenge — Kiane Casagrande

Full-stack application for managing industrial machines, monitoring points, sensors, and time-series readings.

## Technologies

- **Backend:** Node.js, Express 5, TypeScript, Prisma 7, and PostgreSQL 16.
- **Frontend:** React 18, Vite 8, TypeScript, MUI 5, Redux Toolkit, and Recharts.
- **Shared:** Nx monorepo and Zod 4 for shared validation schemas and business rules.

```text
full-stack-solution/
├── apps/
│   ├── api/       # REST API
│   └── web/       # Frontend application
└── libs/
    └── shared/    # Shared schemas, types, and rules
```

## Getting Started

### 1. Prerequisites

- Node.js `^20.19` or `>=22.12`
- npm 10+
- Docker

### 2. Install dependencies

```bash
git clone <repo-url>
cd full-stack-solution
npm install
```

### 3. Configure the environment

```bash
cp .env.example .env
```

Fill in the required variables in `.env`, including the PostgreSQL credentials, `DATABASE_URL`, `JWT_SECRET`, `SEED_USER_EMAIL`, and `SEED_USER_PASSWORD`.

Use a randomly generated JWT secret with at least 32 characters. Refer to `.env.example` for all available environment variables.

### 4. Start the database

```bash
docker compose up -d
```

Apply the database migrations and create the initial user:

```bash
npx prisma migrate deploy
npx prisma db seed
```

### 5. Start the applications

Start the API:

```bash
npx nx serve api
```

In a separate terminal, start the frontend:

```bash
npx nx serve web
```

Open `http://localhost:4200` and sign in using the credentials configured in `SEED_USER_EMAIL` and `SEED_USER_PASSWORD`.

The API is available at `http://localhost:3000/api`.

Health check: `GET /api/health`.

## Testing and Code Quality

```bash
# Run tests and lint across all projects
npx nx run-many -t test lint -p shared api web

# Type-check, test, and lint the frontend
npx nx run-many -t typecheck test lint -p web

# Build the frontend for production
npx nx build web
```

Tests use mocked dependencies where appropriate and do not require the database or API to be running.

## API

Base URL: `http://localhost:3000/api`

The API uses JWT authentication and provides the following features:

- Authentication and session management.
- Machine creation and management.
- Monitoring point and sensor management.
- Ingestion, querying, aggregation, and deletion of time-series readings.

All endpoints require an access token except `POST /auth/login` and `GET /health`.

## Documentation

Technical documentation is organized in [`docs/`](./docs/README.md) and covers:

- Requirements and domain model.
- Architecture and API contracts.
- Business rules and security.
- Testing strategy and performance.
- Implementation plan, decisions, and requirements traceability.
