# Scope

## In scope — delivered

### Authentication
- Login with a fixed user created by the database seed; JWT returned in the body.
- Logout (stateless: the client discards the token).
- Every route except `/login` is behind a guard; a token found in storage is
  validated against the API before the private area renders.

### Machines
- Create with an arbitrary name and a type from `["Pump", "Fan"]`.
- Edit name and type; delete, cascading to the points, sensors and readings below.

### Monitoring points and sensors
- Create points on a machine, rename and delete them.
- Install, replace and remove a sensor; the sensor id is typed by the user and is
  globally unique; the model is one of `["TcAg", "TcAs", "HF+"]`.
- `TcAg` and `TcAs` are refused on `Pump` machines, on installation and on a later
  type change.
- Paginated list, 5 rows per page, showing machine name, machine type, monitoring
  point name and sensor model, orderable by any of those four columns in both
  directions. Paging and ordering happen in SQL.

### Time series
- Store raw readings in batches (up to 5 000 per request); duplicate timestamps are
  skipped and reported.
- Read a full series, or a range; both bounds inclusive and optional.
- Metrics (count, min, max, average, first and last timestamp), computed in SQL.
- Count every reading the user has stored.
- Delete a series, or just a range of it.
- Line chart of the series, with the metrics as tiles beside it.

### Cross-cutting
- Responsive layout from phone to desktop.
- Reusable component library and a shared schema/rule library.
- Unit and component tests on both sides; see [Testing Strategy](./09-testing-strategy.md).
- Nx monorepo (a challenge bonus).

## Out of scope — and why

| Not built | Reasoning |
|-----------|-----------|
| **User registration, password reset, roles** | The brief asks for login with a *fixed* user. Adding account management would expand the auth surface — and its security burden — with nothing in the requirements to justify it. |
| **Token refresh / revocation list** | Logout is stateless by decision; a logged-out token stays valid until it expires. A blacklist needs shared server state (Redis or a table) and buys little at a one-hour lifetime. Recorded as a trade-off in [Security](./08-security.md). |
| **Real device ingestion (MQTT, gateways)** | No requirement mentions a transport. The HTTP batch endpoint is the contract; a gateway would sit in front of it. The UI sends a JSON batch, which mirrors that contract rather than pretending a human types readings. |
| **Alerting, thresholds, failure prediction** | Prediction is listed as a *bonus*. It would need a modelling decision (window, method, confidence) that cannot be defended without domain data, so the effort went into the required items instead. |
| **Cypress end-to-end tests** | A bonus. The flows are covered by component tests plus a verified manual end-to-end pass; a browser runner is the honest next step, not a substitute for either. |
| **Cloud deployment, load balancer, load tests** | Bonuses that test infrastructure, not the application design the brief is grading. |
| **Partitioning / retention for `Reading`** | Correct at this volume would be premature: the composite primary key already gives the range scans their ordering. Revisit with measurements, per the project's own principle against speculative optimization. |
| **Dark theme** | No requirement. It would double the styling surface to maintain. |
| **i18n** | Single-locale product; the UI is in English, consistent with the code. |

## Boundaries worth stating explicitly

- **"At least two monitoring points per machine" is a UI warning, not an API
  constraint.** The API never blocks it. Rationale in
  [Assumptions](./12-assumptions.md).
- **A "time series" is not an entity.** It is the set of readings of one monitoring
  point, reached through that point. There is no `/series` resource.
- **Ownership is enforced per query, and a resource owned by someone else answers
  `404`, not `403`,** so existence does not leak.
- **One user, one dataset.** There is no sharing, no team and no transfer of
  ownership between users.
