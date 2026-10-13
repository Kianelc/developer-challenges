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

A resource owned by another user answers `404`, not `403`
([D8](./11-decisions.md#d8--ownership-answers-404-not-403)).

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

→ `401 UNAUTHORIZED` — `"Invalid email or password"`, with identical wording and
timing for an unknown email and a wrong password
([Security](./08-security.md#passwords)).

### `GET /api/auth/me`
→ `200 { "id": "…", "email": "…" }`

Used by the SPA on boot to validate a token found in storage before rendering the
private area.

### `POST /api/auth/logout`
→ `204`

Stateless: the client discards the token, which stays technically valid until it
expires ([D10](./11-decisions.md#d10--stateless-logout)).

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

`PUT`, not `POST`, because the operation is idempotent replacement
([BR-3](./07-business-rules.md#br-3--a-monitoring-point-holds-at-most-one-sensor-installing-replaces)).

- `id`: typed by the user, trimmed, 2–50 characters, **globally unique**.
- `model`: `"TcAg"`, `"TcAs"` or `"HF+"`.
- → `422 BUSINESS_RULE_VIOLATION` for `TcAg`/`TcAs` on a `Pump`, validated before any
  write ([BR-1](./07-business-rules.md#br-1--tcag-and-tcas-cannot-be-installed-on-a-pump)).
- → `409 CONFLICT` if that sensor id is already in use
  ([BR-4](./07-business-rules.md#br-4--a-sensor-id-is-globally-unique-and-chosen-by-the-user)).

### `DELETE /api/monitoring-points/:id/sensor`
→ `204`. → `404` if the point has no sensor.

---

## Time series

A series belongs to a monitoring point; there is no separate series resource.

### `POST /api/monitoring-points/:id/readings`

```json
{
  "readings": [
    { "timestamp": "2026-01-01T00:00:00Z", "value": 45.2,  "metric": "temperature" },
    { "timestamp": "2026-01-01T00:00:00Z", "value": 2.51,  "metric": "vibrationVelocityRms" },
    { "timestamp": "2026-01-01T00:01:00Z", "value": 45.4,  "metric": "temperature" }
  ]
}
```

→ `201 { "received": 3, "inserted": 3 }`

- `timestamp`: ISO 8601 **with a time zone**. A local-looking string such as
  `2026-01-01T00:00:00` is rejected — without an offset the instant is ambiguous.
- `value`: any finite number, in the unit of its `metric`.
- `metric`: **required**, one of `"temperature"`, `"vibrationVelocityRms"`,
  `"vibrationAccelerationRms"`. The unit is never sent — it is derived from the
  metric ([BR-13](./07-business-rules.md#br-13--every-reading-declares-its-physical-quantity-and-the-unit-is-derived)).
- A batch **may mix quantities**, and two quantities may share a timestamp — as in
  the example above, where a sensor sampled temperature and vibration together.
- 1 to `MAX_READINGS_PER_BATCH` readings per request — **4 000**, a measured figure
  ([BR-7](./07-business-rules.md#br-7--batch-size-is-capped-at-4-000-readings)). The
  ingest path accepts a body of up to 1 MB; a larger one answers `413`.
- **Duplicate `(point, metric, timestamp)` triples are skipped, not rejected**, and
  `received` versus `inserted` is how a caller detects it
  ([BR-6](./07-business-rules.md#br-6--duplicate-readings-are-skipped-and-the-skip-is-reported)).

### `GET /api/monitoring-points/:id/readings`

| Query | Notes |
|-------|-------|
| `from` | optional, inclusive, ISO 8601 with time zone |
| `to` | optional, inclusive |
| `metric` | optional; omitted, **every** quantity is returned |

→ `200`, ordered by timestamp:

```json
[
  { "timestamp": "2026-01-01T00:00:00.000Z", "value": 45.2, "metric": "temperature" },
  { "timestamp": "2026-01-01T00:00:00.000Z", "value": 2.51, "metric": "vibrationVelocityRms" }
]
```

Omitting every filter returns the whole series. `from` later than `to` is a
`400 VALIDATION_ERROR`. The client groups by `metric` to draw one chart per quantity.

### `GET /api/monitoring-points/:id/readings/metrics`

| Query | Notes |
|-------|-------|
| `metric` | **required** |
| `from`, `to` | optional, inclusive |

→ `200`

```json
{
  "metric": "temperature",
  "count": 2,
  "min": 45.2,
  "max": 45.4,
  "avg": 45.3,
  "firstTimestamp": "2026-01-01T00:00:00.000Z",
  "lastTimestamp": "2026-01-01T00:01:00.000Z"
}
```

**`metric` is required here, unlike every other range query**
([BR-15](./07-business-rules.md#br-15--an-aggregate-covers-exactly-one-quantity));
omitting it is a `400 VALIDATION_ERROR` naming the field. The response echoes the
quantity back, so a caller can label the figures without tracking its own request.

Computed in a single SQL aggregate, not by fetching the series and reducing it in
Node. On an empty range, `count` is `0` and every other field is `null`, with
`metric` still set.

### `GET /api/readings/count`
→ `200 { "count": 1234 }` — every reading the caller has stored, across all points.

### `DELETE /api/monitoring-points/:id/readings`

Same optional `from`/`to`/`metric` query. → `200 { "deleted": 42 }`

With no filter, every reading of the point is deleted, whatever its quantity. The UI
states which of the two is about to happen before asking for confirmation.

---

## Conventions summary

| Convention | Where it is justified |
|------------|-----------------------|
| Ownership scoped per query, missing → `404` | [D8](./11-decisions.md#d8--ownership-answers-404-not-403) |
| `createdById` always from the JWT | [BR-10](./07-business-rules.md#br-10--every-row-belongs-to-its-creator-and-another-users-row-does-not-exist) |
| `PUT` for the sensor, `PATCH` for partial updates | Replacement versus partial modification |
| Both range bounds inclusive | [BR-9](./07-business-rules.md#br-9--range-bounds-are-inclusive-on-both-ends) |
| `metric` optional for reading and deleting, required for aggregating | [BR-15](./07-business-rules.md#br-15--an-aggregate-covers-exactly-one-quantity) |
| The unit is never transmitted | [BR-13](./07-business-rules.md#br-13--every-reading-declares-its-physical-quantity-and-the-unit-is-derived) |
| `204` with no body for deletions | Nothing meaningful to return |
| Rule violation `422`, state conflict `409` | A refusal the payload caused versus one the current state caused |
