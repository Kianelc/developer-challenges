# API Contracts

Base URL `http://localhost:3000/api` (served to the browser as `/api` through the
dev-server proxy — see [Architecture](./04-architecture.md#runtime-topology)).

Request and response bodies are JSON. Every payload is validated by a Zod schema from
`libs/shared`, so this document and the running code cannot disagree without failing
the compile.

## Authentication

Every endpoint except `POST /auth/login` and `GET /health` requires:

```
Authorization: Bearer <accessToken>
```

A missing, malformed or expired token answers `401 UNAUTHORIZED`.

## Error format

One shape, produced only by `apps/api/src/shared/middlewares/error-handler.ts`:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": [{ "path": "model", "message": "Invalid option" }]
  }
}
```

`details` appears only for validation failures, one entry per offending field.

| Code | HTTP | When |
|------|------|------|
| `VALIDATION_ERROR` | 400 | A payload or query failed its schema |
| `INVALID_JSON` | 400 | The body is not parseable JSON |
| `UNAUTHORIZED` | 401 | No token, bad token, expired token, or wrong credentials |
| `NOT_FOUND` | 404 | The resource does not exist **or belongs to another user** |
| `PAYLOAD_TOO_LARGE` | 413 | The request body exceeds the route's limit (1 MB on the ingest path, the Express default elsewhere) |
| `CONFLICT` | 409 | A uniqueness or state conflict (duplicate sensor id; `Fan`→`Pump` with blocked sensors installed) |
| `BUSINESS_RULE_VIOLATION` | 422 | A domain rule refused the request (`TcAg`/`TcAs` on a `Pump`) |
| `INTERNAL_ERROR` | 500 | Unhandled failure; details are logged, never returned |

Why `404` and not `403` for someone else's resource: answering `403` would confirm
that the id exists. See [Security](./08-security.md).

---

## Health

### `GET /api/health`
No authentication. → `200 { "status": "ok" }`

---

## Authentication endpoints

### `POST /api/auth/login`

```json
{ "email": "user@example.com", "password": "secret123" }
```

→ `200`

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs…",
  "user": { "id": "79071a22-…", "email": "user@example.com" }
}
```

→ `401 UNAUTHORIZED` — `"Invalid email or password"`. The same message and the same
work are done for an unknown email as for a wrong password (a dummy bcrypt compare),
so the response does not reveal which addresses are registered.

### `GET /api/auth/me`
→ `200 { "id": "…", "email": "…" }`

Used by the SPA on boot to validate a token found in storage before rendering the
private area.

### `POST /api/auth/logout`
→ `204`

Stateless: the server stores nothing, the client discards the token. The token stays
technically valid until it expires — an intentional trade-off, see
[Security](./08-security.md#logout-is-stateless).

---

## Machines

### `GET /api/machines`
→ `200` — every machine owned by the caller.

```json
[{ "id": "…", "name": "Pump 01", "type": "Pump", "monitoringPointsCount": 2 }]
```

### `POST /api/machines`

```json
{ "name": "Pump 01", "type": "Pump" }
```

→ `201` with the created machine.
`name`: trimmed, 2–100 characters. `type`: `"Pump"` or `"Fan"`.

### `PATCH /api/machines/:id`

```json
{ "name": "Pump 01 rev B" }
```

Both fields optional, at least one required. → `200` with the updated machine.

→ `409 CONFLICT` when changing `type` to `Pump` while a `TcAg` or `TcAs` sensor is
installed anywhere below the machine. The message names the blocked models.

### `DELETE /api/machines/:id`
→ `204`. Cascades to monitoring points, sensors and readings.

---

## Monitoring points

### `POST /api/machines/:id/monitoring-points`

```json
{ "name": "Pump bearing" }
```

→ `201` with the point, denormalized for the list:

```json
{
  "id": "…", "name": "Pump bearing",
  "machineId": "…", "machineName": "Pump 01", "machineType": "Pump",
  "sensorId": null, "sensorModel": null
}
```

### `GET /api/monitoring-points`

| Query | Default | Allowed |
|-------|---------|---------|
| `page` | `1` | integer ≥ 1 |
| `pageSize` | `5` | 1–50 |
| `sortBy` | `machineName` | `machineName`, `machineType`, `name`, `sensorModel` |
| `order` | `asc` | `asc`, `desc` |

→ `200`

```json
{ "data": [ /* MonitoringPoint[] */ ], "page": 1, "pageSize": 5, "total": 7 }
```

Paging and ordering are done in SQL, with `id` as the tie-breaker so a page boundary
is stable between requests. An out-of-range `page` returns an empty `data` with the
page the server actually served, which the client adopts.

### `PATCH /api/monitoring-points/:id`
`{ "name": "New name" }` → `200` with the updated point.

### `DELETE /api/monitoring-points/:id`
→ `204`. Cascades to the sensor and the readings.

### `PUT /api/monitoring-points/:id/sensor`

```json
{ "id": "A1B2C3", "model": "HF+" }
```

→ `200 { "id": "A1B2C3", "model": "HF+", "monitoringPointId": "…" }`

`PUT`, not `POST`, because the operation is **idempotent replacement**: a point holds
at most one sensor, and installing one replaces whatever was there, inside a
transaction.

- `id`: typed by the user, trimmed, 2–50 characters, **globally unique**.
- `model`: `"TcAg"`, `"TcAs"` or `"HF+"`.
- → `422 BUSINESS_RULE_VIOLATION` for `TcAg`/`TcAs` on a `Pump`. **Validated before
  any write**, so a refused install leaves the existing sensor untouched.
- → `409 CONFLICT` if that sensor id is already used on another monitoring point.

### `DELETE /api/monitoring-points/:id/sensor`
→ `204`. → `404` if the point has no sensor.

---

## Time series

A series belongs to a monitoring point; there is no separate series resource.

### `POST /api/monitoring-points/:id/readings`

```json
{
  "readings": [
    { "timestamp": "2026-01-01T00:00:00Z", "value": 20.512 },
    { "timestamp": "2026-01-01T00:01:00Z", "value": 20.634 }
  ]
}
```

→ `201 { "received": 2, "inserted": 2 }`

- `timestamp`: ISO 8601 **with a time zone**. A local-looking string such as
  `2026-01-01T00:00:00` is rejected — without an offset the instant is ambiguous.
- `value`: any finite number.
- 1 to **5 000** readings per request (`MAX_READINGS_PER_BATCH`) — a full batch is
  roughly 264 KB. The ingest path therefore accepts a body of up to **1 MB**, while
  every other route keeps the Express default; a larger body answers `413`. The cap
  is set by the latency budget: 5 000 readings take ~250 ms, inside the 350 ms
  requirement ([Performance](./14-performance.md#ingest)).
- **Duplicate `(point, timestamp)` pairs are skipped, not rejected.** `received`
  versus `inserted` is how a caller detects it, which makes a re-delivered batch safe
  without turning a retry into an error. The UI reports the difference instead of
  showing a silent success.

### `GET /api/monitoring-points/:id/readings`

| Query | Notes |
|-------|-------|
| `from` | optional, inclusive, ISO 8601 with time zone |
| `to` | optional, inclusive |

→ `200 [{ "timestamp": "…", "value": 20.512 }]`, ordered by timestamp.

Omitting both bounds returns the whole series. `from` later than `to` is a
`400 VALIDATION_ERROR`.

### `GET /api/monitoring-points/:id/readings/metrics`

Same `from`/`to` query. → `200`

```json
{
  "count": 2,
  "min": 20.512,
  "max": 20.634,
  "avg": 20.573,
  "firstTimestamp": "2026-01-01T00:00:00.000Z",
  "lastTimestamp": "2026-01-01T00:01:00.000Z"
}
```

Computed in a single SQL aggregate — not by fetching the series and reducing it in
Node. On an empty range, `count` is `0` and every other field is `null`.

### `GET /api/readings/count`
→ `200 { "count": 1234 }` — every reading the caller has stored, across all points.

### `DELETE /api/monitoring-points/:id/readings`

Same `from`/`to` query. → `200 { "deleted": 42 }`

With no range, the point's whole series is deleted. The UI states which of the two is
about to happen before asking for confirmation.

---

## Conventions summary

| Convention | Rationale |
|------------|-----------|
| Ownership scoped per query, missing → `404` | Authorization cannot be forgotten, and existence does not leak |
| `createdById` always from the JWT | A client cannot create rows on another user's behalf |
| `PUT` for the sensor, `PATCH` for partial updates | Replacement versus partial modification |
| Both range bounds inclusive | One rule to remember; stated in the schema's own comment |
| `204` with no body for deletions | Nothing meaningful to return |
| Rule violation `422`, state conflict `409` | A refusal the payload caused versus one the current state caused |
