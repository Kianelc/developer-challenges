# Performance

The brief sets one hard number: *"The latency between client and the server side
should be below 350 ms for all requests."* This document states what was measured,
how, and what is **not** covered by it.

## Method

| | |
|---|---|
| Measured | `curl`'s `time_total` — connect, send, server handling, full response received |
| Samples | 20 per read endpoint, 8 per ingest batch size |
| Reported | min / median / p95 / max, in milliseconds |
| Client | Same machine as the server; `localhost`, so network transit is ~0 |
| Dataset | One machine, monitoring points with sensors, and **5 000 readings** on the point under test |
| Machine | 12 logical CPUs, 7 GB RAM, Linux 6.8, PostgreSQL 16 in Docker, Node 22 |
| Load | Sequential requests on an otherwise idle machine |

What this means, stated plainly: these are **server-side handling times under no
concurrency, with the database on the same host**. They answer "is the handler
efficient?", not "what does a user in another region see under load". See
[Not covered](#not-covered).

## Read endpoints

Dataset: 5 000 readings on the monitoring point under test.

| Endpoint | min | median | p95 | max |
|---|---|---|---|---|
| `GET /api/health` | 1 | 1 | 1 | 1 |
| `POST /api/auth/login` | 58 | 59 | 62 | 68 |
| `GET /api/auth/me` | 2 | 3 | 3 | 3 |
| `GET /api/machines` | 2 | 2 | 3 | 8 |
| `GET /api/monitoring-points` (page 1, size 5) | 3 | 4 | 7 | 14 |
| `GET /api/monitoring-points` (`sortBy=sensorModel&order=desc`) | 3 | 5 | 8 | 8 |
| `GET /api/readings/count` | 3 | 4 | 5 | 5 |
| `GET …/readings/metrics` (over 5 000 rows) | 4 | 4 | 6 | 6 |
| `GET …/readings` (all 5 000 rows) | 16 | 17 | 20 | 28 |
| `GET …/readings?from=&to=` (~60 rows) | 3 | 3 | 5 | 8 |

**Every endpoint is at least an order of magnitude inside the 350 ms budget.**

Two results worth reading closely:

- **Login is the slowest read, at ~59 ms, and that is intentional.** bcrypt at cost 10
  is deliberately expensive; the login path also runs a dummy compare when the email
  is unknown, so the cost is paid either way (see
  [Security](./08-security.md#passwords)). Cheapening it would weaken the hash.
- **Metrics over 5 000 rows costs 4 ms, while fetching those same rows costs 17 ms.**
  That gap is the point of computing aggregates in SQL rather than fetching the series
  and reducing it in Node: the work scales with the result, not with the data.

## Ingest

Fresh monitoring point per batch size, so every row is a real insert rather than a
skipped duplicate.

| Request | min | median | p95 | max |
|---|---|---|---|---|
| `POST …/readings`, 100 readings | 9 | 11 | 14 | 17 |
| `POST …/readings`, 500 readings | 28 | 31 | 34 | 36 |
| `POST …/readings`, 1 000 readings | 51 | 55 | 61 | 65 |
| `POST …/readings`, **5 000 readings** (the cap, ~264 KB) | 246 | 250 | **254** | 256 |

Cost is linear in batch size at roughly **50 ms per 1 000 readings**, so the
documented maximum lands at ~250 ms — inside the budget, with about 100 ms of
headroom. That is what sets the cap: **5 000 is the largest batch that keeps a single
request under 350 ms on this hardware**, which is the justification behind
[BR-7](./07-business-rules.md#br-7--batch-size-is-capped-at-5-000-readings).

One caveat, observed: the **first** request after the server rebuilds takes ~476 ms —
cold start, before the JIT warms up. It is excluded from the table above because it
measures process startup, not request handling, but it is worth knowing that the very
first ingest after a deploy can exceed the budget.

## What these measurements found

Taking the measurement is what exposed three real defects, all now fixed and covered
by tests:

1. **The advertised 5 000-reading cap was unreachable.** A full batch is ~264 KB, and
   the effective body limit was **100 KB** — about 1 900 readings. Verified by probing:
   100 714 bytes → `201`, 132 514 bytes → `500`.
2. **The cause was middleware ordering.** The ingest path had its own
   `express.json({ limit })`, but the default `express.json()` was registered *first*,
   and body-parser skips a request whose body was already consumed — so the larger
   limit was dead code. The sized parser is now registered before the default one.
3. **An oversized body answered `500 INTERNAL_ERROR`.** body-parser's
   `entity.too.large` fell through to the generic branch, reporting a client mistake as
   a server fault. It now maps to **`413 PAYLOAD_TOO_LARGE`**.

After the fix, a 5 000-reading batch returns `{"received":5000,"inserted":5000}`, and a
body past 1 MB returns `413`. The limit is now 1 MB, sized from the schema's own cap
(5 000 × ~65 bytes ≈ 320 KB compact, with room for a formatted payload).

## Why the endpoints are fast

| Choice | Effect |
|--------|--------|
| `Reading`'s primary key is `(monitoringPointId, timestamp)` | Range reads and aggregates walk one index in order — no extra index, no sort step ([D5](./11-decisions.md#d5--readings-primary-key-is-monitoringpointid-timestamp)) |
| Metrics computed with one SQL aggregate | 4 ms over 5 000 rows instead of transferring them |
| Pagination and ordering in SQL | A page costs the same whatever the inventory size ([D7](./11-decisions.md#d7--pagination-and-sorting-on-the-server)) |
| `pageSize` capped at 50 | No client can ask for an unbounded page |
| Batch insert in one statement with `skipDuplicates` | 5 000 rows in one round trip, and a re-send costs no more than a first send |
| `monitoringPointId` indexed on `MonitoringPoint` | The list's join does not scan |

## Frontend

Not part of the 350 ms requirement, but measured during the build:

| | |
|---|---|
| Initial JS chunk | ~144 KB |
| Time-series page chunk (includes Recharts) | ~328 KB, loaded on demand |

Route components are lazily loaded, so the login screen does not download the
dashboard and the charting library arrives only with the page that draws charts.

## Not covered

| Not measured | Why it matters | What would be needed |
|---|---|---|
| **Concurrency** | These are sequential requests; contention changes queueing and connection-pool behavior | A load test (k6, autocannon) at a realistic concurrency, reporting p95/p99 |
| **Real network** | `localhost` transit is ~0; a remote client adds RTT and TLS | Measure from the deployment's actual region |
| **Large datasets** | 5 000 readings fit comfortably in cache; millions do not | Seed millions of rows and re-measure the range and aggregate queries |
| **Sustained ingest** | One batch at a time was measured, not a stream of them | A soak test, watching index bloat and autovacuum |
| **Cold start** | Observed once (~476 ms), not characterized | Measure first-request latency across repeated restarts |

A load test is in the [backlog](./10-implementation-plan.md#next). Until then, the
honest claim is the narrow one: **every endpoint, including a maximum-size ingest
batch, handles a single request well inside 350 ms on this hardware.**

## Reproducing

```bash
docker compose up -d
npx prisma migrate deploy && npx prisma db seed
npx nx serve api

# then, with a token from POST /api/auth/login:
curl -s -o /dev/null -w '%{time_total}\n' \
  -H "Authorization: Bearer $TOKEN" \
  'http://localhost:3000/api/monitoring-points?page=1&pageSize=5'
```

Measure the server directly on port 3000. Going through the dev-server proxy on 4200
adds the proxy hop, which is not what the requirement is about.
