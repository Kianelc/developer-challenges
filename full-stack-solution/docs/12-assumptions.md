# Assumptions

The brief asks explicitly for ambiguities to be resolved and the resolutions
documented. Each entry states the ambiguity, the reading chosen, and what would
change under the other reading.

---

## A1 — "Log in using a fixed email and password"

**Ambiguous.** Fixed *where* — hard-coded in the source, or a single seeded account?

**Assumed.** A single user row created by the database seed from `SEED_USER_EMAIL`
and `SEED_USER_PASSWORD`, with a bcrypt hash. No registration endpoint.

**Why.** Credentials in source are unacceptable even in an exercise, and a real
password hash lets the login path be the real login path — the same code a
multi-user system would run. The "fixed" part is honoured by there being exactly one
account and no way to create another.

**If read the other way.** A hard-coded comparison would remove the `User` table, the
hashing and the seed — and the `createdById` ownership model with them.

---

## A2 — Sensor id uniqueness: per point, per machine, or global?

**Ambiguous.** "The sensor should have a unique ID" does not say the scope.

**Assumed.** **Globally** unique, and therefore the primary key.

**Why.** A sensor is a physical device with a label on it. The same device cannot be
in two places, so its id identifies it across the whole system. Per-point uniqueness
would allow the same physical sensor to appear installed twice.

**If read the other way.** A generated surrogate key plus a composite unique index,
and a duplicate label would become legal — which would make the inventory lie about
the hardware.

---

## A3 — "Create at least two monitoring points"

**Ambiguous.** A validation rule, or a usage expectation?

**Assumed.** A usage expectation: the API accepts a machine with zero or one point,
and the UI warns about machines below two.

**Why.** Enforcing it server-side is self-defeating — points are created one request
at a time, so the first point of any machine would be rejected. Written as a user
story ("I want to create at least two…"), not as a constraint.

**If read the other way.** Creation would have to accept an array of points atomically
and refuse fewer than two, and deleting the second point of a machine would have to
be blocked. Neither is hinted at anywhere in the brief.

---

## A4 — What happens when a machine's type changes under an installed sensor?

**Ambiguous.** The brief forbids `TcAg`/`TcAs` on a `Pump` but says nothing about
editing a `Fan` into a `Pump` while such a sensor is installed.

**Assumed.** Refuse the type change with `409 CONFLICT`, naming the models in the way.

**Why.** The alternatives are worse: silently deleting the user's sensors destroys
data to satisfy a validation; leaving them installed breaks the invariant the rule
exists to protect. Refusing keeps the user in control — remove the sensors, then
change the type.

**If read the other way.** Cascade-removing the offending sensors would need a very
loud confirmation, and would still lose the readings' provenance.

---

## A5 — What is a "time series" as a resource?

**Ambiguous.** "Retrieve the number of time-series I've stored" could mean a count of
series or a count of readings.

**Assumed.** A series is the set of readings of one monitoring point — not a stored
entity. `GET /readings/count` returns the number of **readings** the user has stored,
across all points.

**Why.** Nothing in the brief describes creating, naming or deleting a series as an
object; readings are always written against a monitoring point. Counting readings is
also the number that actually tells a user how much data they hold.

**If read the other way.** The count would equal "monitoring points that have at least
one reading", which the UI can already derive, and a `Series` entity would need an
identity and a lifecycle that no requirement describes.

---

## A6 — Which metrics?

**Ambiguous.** "Retrieve metrics about the time-series data" names none.

**Assumed.** `count`, `min`, `max`, `avg`, `firstTimestamp`, `lastTimestamp`, over the
same optional inclusive range as the other reading endpoints.

**Why.** They are the aggregate set that answers "is this series healthy and is it
current?" without committing to a domain-specific analysis (RMS, FFT, kurtosis) that
could not be defended without real vibration data. All six come from a single SQL
aggregate.

---

## A7 — Must deletion be "all or by range"?

**Ambiguous.** "Delete time-series data I've sent to the server" does not say the
granularity.

**Assumed.** Both: `DELETE` with no range removes the point's whole series, with a
range removes that slice, and the response reports how many rows went.

**Why.** A correction usually concerns a window (a sensor that was miscalibrated
yesterday), while a reset concerns everything. Supporting only the first would make a
reset a loop; only the second would make a correction impossible.

---

## A8 — Reading timestamps: client-supplied or server-assigned?

**Assumed.** Client-supplied, and required to carry a time zone.

**Why.** A reading is sampled in the field and may be delivered much later, so the
instant belongs to the sample, not to the request. Requiring an offset is what keeps
the instant unambiguous — see [BR-8](./07-business-rules.md#br-8--reading-timestamps-must-carry-a-time-zone).

---

## A9 — Are monitoring point names unique?

**Assumed.** No. Two machines may each have a "Bearing", and one machine may have two
points sharing a name.

**Why.** No uniqueness is stated, the id identifies the point, and in the field the
same label genuinely recurs across assets. The UI always shows the machine name
beside the point name, so rows stay distinguishable.

---

## A10 — How are readings produced in the UI?

**Assumed.** A JSON batch editor with a sample generator, not a single-reading form.

**Why.** The producer is a gateway, not a person; the batch endpoint is the real
contract. A sample generator keeps the flow demonstrable without inventing a device.
See [D13](./11-decisions.md#d13--the-readings-editor-takes-a-json-batch).

---

## A11 — What does the 350 ms latency requirement cover?

**Assumed.** Server-side handling of a single API request against a realistic local
dataset, measured client-to-server — not the browser's full page load, and not a
batch at the extreme of the 5 000-reading cap under contention.

**Why.** The brief says "the latency between client and the server side", which is the
request/response round trip. What was actually measured, and how, is in
[Performance](./14-performance.md).

---

## A12 — Which screens should exist?

**Assumed.** An overview with counters, plus one screen per domain area (machines,
monitoring points, time series), and a login screen.

**Why.** The user stories group naturally into those areas, and the paginated list is
explicitly its own screen. The overview exists because the "at least two monitoring
points" warning (A3) and the stored-readings count need somewhere to live that is not
buried in a list.
