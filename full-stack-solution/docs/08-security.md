# Security

## Authentication

**JWT, HS256, returned in the response body.**

| Aspect | Choice | Implementation |
|--------|--------|----------------|
| Algorithm | HS256, pinned on **both** sign and verify | `TokenService` passes `algorithms: ["HS256"]` to `verify` |
| Subject | The user id, in `sub` | `sign({}, secret, { subject: userId })` |
| Lifetime | `JWT_EXPIRES_IN`, default `1h` | |
| Secret | `JWT_SECRET`, **minimum 32 characters, validated at startup** | `config/env.ts` |
| Transport | `Authorization: Bearer <token>` | `auth.middleware.ts` |

Pinning the algorithm on verification matters: without it, a library that honours the
token's own `alg` header can be talked into accepting `none` or into verifying an
RS256 token against the HMAC secret. The payload carries no claims beyond `sub`, so
nothing the client can edit is ever trusted.

The process refuses to boot with a missing or weak secret — `loadEnv()` parses
`process.env` through a Zod schema and throws with the offending fields named. A
misconfiguration fails at startup, not at the first login.

## Passwords

- **bcrypt, cost 10** (`bcryptjs`), hashed by the seed, stored in `User.password`.
- Never returned by any endpoint, never logged.
- **Login does the same work for an unknown email as for a wrong password:**

```ts
const user = await this.repository.findCredentialsByEmail(email);
const passwordMatches = await compare(password, user?.password ?? DUMMY_HASH);
if (!user || !passwordMatches) throw new UnauthorizedError("Invalid email or password");
```

The dummy hash is compared when the user does not exist, so the response time does
not reveal whether an address is registered, and the message is identical either way.
That closes the user-enumeration channel that a naive early `return` leaves open.

## Authorization

**Ownership is part of every query, not a middleware.**

Two rules make this hard to get wrong:

1. `createdById` is always taken from the verified token, **never from the request
   body**. A client cannot create rows on another user's behalf.
2. Every read and every mutation is scoped by the user id in SQL (`findOwned`,
   `machineBelongsToUser`, `pointBelongsToUser`). There is no "load, then check"
   sequence that a new endpoint could skip.

### Why another user's resource answers `404`, not `403`

`403` means "it exists, but not for you" — which confirms the id. `404` for both the
non-existent and the forbidden case keeps an attacker from enumerating ids. The cost
is a slightly less precise error for a legitimate user hitting a stale link, which is
the right trade.

## Input validation

- **Every** payload and query string is parsed by a Zod schema from `libs/shared`
  before it reaches a service. Unparsed input never travels further than the
  controller.
- Parsing is **whitelisting**: unknown fields are dropped rather than passed through
  to Prisma, so a crafted body cannot set a column the endpoint never meant to
  expose.
- Values are constrained, not just typed — lengths are bounded, enums are closed
  sets, `pageSize` is capped at 50, batches at 5 000 readings.
- `sortBy` and `order` come from closed enums, so the ordering clause is never
  assembled from user text. That is what keeps the dynamic `ORDER BY` out of
  injection range.
- All database access goes through Prisma's parameterized queries.

## Transport and browser surface

| Concern | Position |
|---------|----------|
| CORS | **None configured, because none is needed.** The browser calls `/api` on its own origin; the dev server proxies it, and production serves both behind one origin. No permissive `Access-Control-Allow-Origin` exists to get wrong. |
| `X-Powered-By` | Disabled (`app.disable("x-powered-by")`) |
| Body size | Default limit globally; raised to 256 KB only on the readings ingest route |
| Error detail | `500` returns `"Unexpected error"`; the cause is logged server-side only, so stack traces and SQL never reach a client |

## Known trade-offs

These are decisions, not oversights. Each would be revisited for production.

### Token storage is `localStorage`

The API returns the JWT in the body and sets no cookie, so the SPA must store it
somewhere. `localStorage` survives a reload — which is the requirement — but is
readable by any script on the origin, so an XSS becomes a token theft.

Mitigations in place: a short default lifetime (1 h), no sensitive claims in the
payload, and a single module (`features/auth/token-storage.ts`) that touches storage,
with every accessor guarded.

The production answer is a short-lived access token in memory plus a refresh token in
an `HttpOnly; Secure; SameSite` cookie with CSRF protection. That is a larger auth
surface than the brief asks for, so it is explicitly out of scope
([Scope](./03-scope.md)).

### Logout is stateless

The server keeps no revocation list; logout drops the token client-side, and the
token stays technically valid until it expires. A blacklist would need shared server
state (Redis or a table) consulted on every request — real cost, little gain at a
one-hour lifetime. Documented rather than silently accepted.

### Not implemented

| Missing | Why it is acceptable here | What production needs |
|---------|---------------------------|-----------------------|
| Rate limiting on login | Single-user local app | `express-rate-limit` per IP and per account, with backoff |
| HTTPS / HSTS | Served over `localhost` | TLS termination at the proxy, HSTS, secure cookies |
| Security headers (CSP, `X-Frame-Options`) | No third-party content, no untrusted embedding | `helmet` with a CSP tight enough to make XSS harder to exploit |
| Audit log | No multi-user accountability requirement | Append-only log of writes with actor and timestamp |
| Secret rotation | Single secret from `.env` | A secret manager, with overlapping validity during rotation |

## Secrets handling

- `.env` is git-ignored; only `.env.example` is committed, with empty values and a
  comment per variable.
- No credential, hash or token is logged anywhere.
- Secrets are validated at startup, so a blank `JWT_SECRET` cannot reach production
  as a working default — there is no fallback value in the code.
- **`loadEnv` in the Vite config reads the whole `.env`, but only `VITE_`-prefixed
  variables are exposed to the browser bundle.** This was verified by building and
  grepping `dist/apps/web` for each secret's value: no match (the one apparent hit was
  a substring of Redux Toolkit's `nanoid` alphabet, not a leak). The bundle contains
  only relative paths such as `/api/auth/login`.

## Checklist for a new endpoint

1. Mount it behind `authenticate` unless it is deliberately public.
2. Parse the body **and** the query with a schema from `libs/shared`.
3. Scope every query by the user id from the token; answer `404` on a miss.
4. Take `createdById` from the token, never from the payload.
5. Throw an `AppError` subclass; never format an error response by hand.
6. Add a test for the unauthorized case and for the other-user case, not only the
   happy path.
