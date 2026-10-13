# Decisions

Each entry records what was chosen, what was rejected, and the reasoning. They are
the decisions a reviewer is most likely to question.

---

## D1 — Vite over Next.js

**Context.** The brief requires Material UI **5** and allows Next.js *or* Vite. The
project's own notes originally said Next.js.

**Constraint found.** MUI 5 declares `react@^17 || ^18` as its peer dependency; React
19 breaks its components. The Next.js App Router requires React 19 from version 15
onward. The only Next.js version that pairs with React 18 **and** the App Router is
14.2, already end-of-life, and its bundled types clash with the workspace's
TypeScript 6.

**Decision.** Vite 8 + React 18.3 + MUI 5.18, with React Router 6.

**Rejected.** Next.js 14.2 — a dead-end version chosen only to satisfy a word in a
document; dropping MUI 5 — not allowed, it is a hard requirement.

**Consequences.** No SSR, which nothing here needs: every screen is behind
authentication and shows user-specific data. The `/api` proxy moved from Next
rewrites to the Vite dev server, same effect. The documents that assumed Next.js were
updated rather than left to rot.

---

## D2 — Redux Toolkit, not hand-rolled Redux

**Decision.** `createSlice` + `createAsyncThunk` + `configureStore`.

**Rejected.** Classic action constants, switch reducers and `redux-thunk` wired by
hand — more code for the same behavior, and it would make Immer's safe "mutation"
style unavailable.

**Consequences.** The store's `preloadedState` factory makes every test an isolated
store, which is what let the slice tests assert on real state transitions instead of
on dispatched action objects.

---

## D3 — Thunks over Redux Saga

**Context.** The brief accepts either.

**Decision.** `createAsyncThunk`.

**Reasoning.** Sagas pay off for long-lived, cancellable or orchestrated flows:
polling, debounced search, racing, cancelling an in-flight request on navigation,
retry chains. This application has none. Every effect is "call one endpoint, store
the result or the error".

**Rejected.** Redux Saga — would add generators, a middleware runtime and a second
mental model, and would make a reviewer ask what it is buying.

**Consequences.** Mutation thunks that must refresh a list dispatch the fetch thunk
themselves, which keeps the components free of orchestration. If a flow ever needs
cancellation, `createAsyncThunk`'s `signal` covers the common case before Saga
becomes the answer.

---

## D4 — The sensor id is the primary key

**Decision.** `Sensor.id` is the user-typed string, as the PK; `monitoringPointId` is
`@unique`.

**Rejected.** A generated UUID plus a unique index on the typed code — an extra
column and an extra index for no query, and two notions of identity for one thing.

**Consequences.** Global uniqueness is a database guarantee, so there is no
read-then-write race; a collision arrives as a constraint error mapped to `409`.
Renaming a sensor id is not an update but a replace, which matches the physical act
of swapping a device.

---

## D5 — `Reading`'s primary key is `(monitoringPointId, timestamp)`

**Decision.** A composite primary key; no surrogate id. Delivered as a migration
(`20261009192959_reading_composite_key`) over the initial schema.

**Reasoning.** It makes "one sample per point per instant" a database invariant, which
is what makes batch re-delivery safe (D6). The index it creates is exactly the access
pattern — one point's readings, in time order, optionally bounded — so range reads
and the metrics aggregate need no extra index and no sort step.

**Rejected.** `id` + a unique index on the pair — a wider row and a second index, with
nothing addressing a single reading to justify them.

**Consequences.** There is no endpoint to update one reading, and none is wanted:
corrections re-send the batch.

---

## D6 — Duplicate readings are skipped and reported

**Decision.** Insert ignoring conflicts, answer `{ received, inserted }`.

**Rejected.** Rejecting the whole batch on any duplicate — one overlapping sample
would discard thousands of good readings; skipping silently — the caller could not
tell "stored" from "already present", so data loss would look exactly like success.

**Consequences.** The UI reports the difference ("2 of 3 readings stored, duplicate
timestamps skipped") rather than claiming full success.

---

## D7 — Pagination and sorting on the server

**Decision.** `page`, `pageSize`, `sortBy`, `order` as query parameters; SQL does the
work; the response echoes the page it served.

**Rejected.** Fetching the inventory and sorting in the browser — it would ship the
whole dataset to render five rows, and would not survive growth.

**Consequences.** The list query lives in the slice, and after any mutation the list
is **refetched rather than patched**, because a local insert could place a row on the
wrong page. `sortBy`/`order` come from closed enums, which keeps the dynamic
`ORDER BY` out of injection range; `id` is the tie-breaker so page boundaries are
stable.

---

## D8 — Ownership answers `404`, not `403`

**Decision.** A resource owned by another user is indistinguishable from one that does
not exist.

**Rejected.** `403 Forbidden` — more precise, but it confirms that an id exists and
makes enumeration possible.

**Consequences.** A legitimate user following a stale link sees "not found" rather
than "not yours". Accepted.

---

## D9 — Business rules live in `libs/shared`

**Decision.** Zod schemas, domain types and rule predicates in one library imported by
both applications.

**Rejected.** Duplicating validation on each side — the classic drift, where the form
accepts what the API refuses; or validating only server-side — every mistake would
cost a round trip and the form could not explain *why* an option is unavailable.

**Consequences.** The Pump rule is checked in the browser *and* on the server without
existing twice: both call `isSensorModelAllowed`. A rule change breaks the compile of
whichever side drifted.

---

## D10 — Stateless logout

**Decision.** No revocation list; the client discards the token.

**Rejected.** A blacklist in Redis or a table — shared server state consulted on
every request, for little gain at a one-hour token lifetime.

**Consequences.** A logged-out token stays valid until expiry. Documented in
[Security](./08-security.md) rather than left implicit.

---

## D11 — Native CSS grid instead of MUI 5's `Grid`

**Context.** The metric and counter cards looked shifted against the page header.

**Cause.** MUI 5's `Grid` implements `spacing` with a negative margin on the container
(`margin-left: -16px; width: calc(100% + 16px)`) compensated by `padding-left: 16px`
on every item, the first included. Cell contents do line up, but the container box
hangs outside its siblings and bleeds into the padding of whatever contains it.

**Decision.** A reusable `ResponsiveGrid` built on `display: grid` + `gap`, with the
column count passed per breakpoint.

**Rejected.** Keeping `Grid` and patching the margins — fighting the component's own
model; `Grid2` — still unstable in MUI 5; `auto-fit`/`minmax` columns — tried first,
and rejected because deriving the count from the available width put five of the six
metric cards on the first row. How many cells belong in a row is a layout decision.

**Consequences.** No negative offsets anywhere; the cards align by construction. A
test asserts the absence of the negative margin and of `auto-fit`, so the problem
cannot return unnoticed.

---

## D12 — Vitest for the frontend, Jest for the backend

**Decision.** Vitest + Testing Library in `apps/web`; Jest + Supertest in `apps/api`
and `libs/shared`.

**Reasoning.** Vitest shares Vite's transform pipeline, so the app's aliases and
`import.meta.env` work with no second build configuration; Jest with `ts-jest` would
need its own, and `import.meta` is awkward under it. The backend has no Vite pipeline
to share, and Jest was already in place.

**Rejected.** One runner for everything — would mean fighting a toolchain on one side
for uniformity's sake.

**Consequences.** Two runners in one repo, each hidden behind the same `nx test`
target. Under parallel runs the Vitest workers first timed out on the `forks` pool, so
it runs on `threads` with an on-disk transform cache.

---

## D13 — The readings editor takes a JSON batch

**Decision.** A validated JSON payload (with a sample generator), not a
one-reading-at-a-time form.

**Reasoning.** The real producer is a sensor gateway. A batch payload mirrors the
actual contract; a single-reading form would model a user who does not exist.

**Consequences.** `parseReadingsPayload` validates with the shared schema before any
request and reports the first issues by path, so an invalid batch never reaches the
network. It accepts both a bare array and the `{ readings }` envelope.
