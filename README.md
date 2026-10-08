# ApparelFlow ERP: Cutting Verification & Sewing Queue Gate

Full-stack implementation of the **Cutting Operations & Gatekeeper Verification Terminal**
for the Webtezza (Pvt) Ltd Software Engineering Intern practical challenge.

No batch can reach the Sewing Queue unless a Cutting Verifier has counted every component
and signed it off. The rule is enforced **on the server**, not just in the UI.

## Live demo

- **App:** https://apparelflow-erp-theta.vercel.app/
- **API:** https://apparelflow-erp.onrender.com  *(health check: `/api/health`)*

> The API runs on Render's free tier. If it has been idle, the **first request can take
> 30-60 seconds** to wake up. Please wait and retry once.

## Demo credentials

Password for all accounts: `Demo@1234`

| Role | Name | Email | Can do | Cannot do |
|---|---|---|---|---|
| Cutting Supervisor | Nimal Perera | supervisor@apparelflow.demo | Create orders, submit, resubmit rejected orders | Verify batches, see the Sewing Queue |
| Cutting Verifier | Kasun Fernando | verifier@apparelflow.demo | Count parts, save counts, approve, reject | Create orders, edit recipes, see the Sewing Queue |
| Sewing Supervisor | Dilini Jayasinghe | sewing@apparelflow.demo | View verified batches, read verifier notes, start sewing | See pending, rejected or in-progress orders |

The login page has a **demo credential panel** (one-click sign in), and the header has a
**role switcher**. The switcher performs a real login, so the server still sees a genuine
token for the chosen role.

## Suggested 5-minute evaluation path

1. **Contrast:** click into every input, dropdown and textarea. Text is dark on white.
2. **RBAC:** as Verifier there is no "New order" button. As Sewing Supervisor only verified batches are visible.
3. **Hard stop:** as Verifier, enter a shortage. The row turns red, **Approve Batch is disabled**, and a direct API call is rejected with 422.
4. **Handoff:** enter matching counts, add an optional audit note, approve. Switch to Sewing: the batch shows with verifier name, timestamp, wastage %, piece counts and the note.
5. **Persistence:** refresh the browser. Orders, counts, statuses and audit data remain.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 19 + Vite (JavaScript), React Router |
| Backend | Node.js + Express 5 |
| Database | PostgreSQL (Supabase, used as hosted Postgres only) |
| Auth | JWT (`jsonwebtoken`) + bcrypt (`bcryptjs`) |
| Validation | Zod |
| Tests | Vitest + Supertest |
| Hosting | Vercel (client), Render (API) |

## Architecture

```
React (Vercel) --HTTPS + Bearer JWT--> Express API (Render) --SQL--> PostgreSQL (Supabase)
```

```
server/
  src/
    routes/       HTTP endpoints: auth, recipes, orders, verification, sewing
    middleware/   authenticate (401), requireRole (403), validate (Zod, 422)
    domain/       pure business rules: traffic light, hard stop, wastage formula
    db/           connection pool, SQL migrations, migrate and seed scripts
  tests/          Vitest unit + API integration tests
client/
  src/
    pages/        Login, Orders, Verify, Sewing
    components/   Layout (role switcher), RequireRole, OrderForm, VerifyCard
    api.js        fetch helper that attaches the token
    AuthContext   current-user state
```

## State machine

```
CUTTING_IN_PROGRESS --submit--> PENDING_VERIFICATION --approve--> VERIFIED --start--> SEWING_STARTED
                                        |
                                        +--reject (reason required)--> REJECTED --resubmit--> PENDING_VERIFICATION
```

- Every transition is either a guarded `UPDATE ... WHERE status IN (<allowed states>)` or
  runs inside a transaction that locks the order row with `SELECT ... FOR UPDATE`.
  Concurrent or illegal requests get **409 Conflict**.
- A resubmitted (previously rejected) order has its counts cleared and must be recounted.

## Business rules

- **Multiplier engine:** expected pieces = target garments x pieces per garment, computed
  in SQL when the order is created (e.g. 50 blouses x 2 cuffs = 100 cuffs).
- **Traffic lights:** `GREEN` actual = expected, `YELLOW` actual > expected (batch may proceed),
  `RED` actual < expected (approval blocked). The UI shows a live preview; the server
  computes the stored status itself.
- **Hard stop:** approval is refused (422) if any component is RED **or uncounted**.
  The server recomputes this from the raw `expected_qty` / `actual_qty` numbers inside the
  approval transaction, and does not trust the stored status flag.
- **Fabric wastage %** = `(actual fabric - expected fabric) / expected fabric x 100`, where
  expected fabric = `std_fabric_yards x target_qty`. Computed and stored by the backend.
- **Verifier audit note:** optional note (max 500 chars) on approval, stored in the audit
  row and shown to the Sewing Supervisor.

## Security model (server-enforced)

| Rule | Enforcement | Result |
|---|---|---|
| Not logged in / bad or expired token | `authenticate` middleware | **401** |
| Wrong role (e.g. supervisor calls approve) | `requireRole`, applied once per router | **403** |
| Approve with any RED or uncounted component | `approvalBlocker()` inside a locked transaction | **422** |
| Reject without a reason | Zod validation, plus a DB `CHECK` constraint | **422** |
| Sewing queue isolation | `WHERE status = 'VERIFIED'` hard-coded in SQL; query params are never read | Unapproved orders never returned |
| Identity from the client | JWT holds only the user id; role and verifier id are loaded server-side; `.strict()` schemas reject extra fields such as `verifier_id` | **422** |
| Illegal state change (e.g. start sewing on an unverified order) | Status condition in the `UPDATE ... WHERE` | **409** |
| Audit trail tampering | `verification_logs` is append-only (DB trigger blocks UPDATE and DELETE) | Immutable |
| Bad input (negative, decimal, text, empty) | Client checks for instant feedback, Zod on the server, SQL `CHECK` constraints | **422** |

Disabled buttons and hidden pages are conveniences only. Every rule above is also
enforced by the API.

## API reference

| Method and path | Role | Purpose |
|---|---|---|
| `POST /api/auth/login` | public | Email + password, returns JWT and user |
| `GET /api/auth/me` | any logged-in | Current user |
| `GET /api/recipes` | supervisor, verifier | Recipes with components |
| `POST /api/orders` | supervisor | Create order; server derives expected counts |
| `GET /api/orders` | supervisor | The supervisor's own orders, with last rejection reason |
| `POST /api/orders/:id/submit` | supervisor | Submit or resubmit for verification |
| `GET /api/verification/queue` | verifier | Orders pending verification, with saved counts |
| `PUT /api/verification/orders/:id/counts` | verifier | Save counts; server computes GREEN/YELLOW/RED |
| `POST /api/verification/orders/:id/approve` | verifier | Hard stop, then VERIFIED; optional `note` |
| `POST /api/verification/orders/:id/reject` | verifier | Mandatory `note`, returns order to supervisor |
| `GET /api/sewing/queue` | sewing supervisor | VERIFIED orders only, with audit data |
| `GET /api/sewing/started` | sewing supervisor | Orders already released to assembly |
| `POST /api/sewing/orders/:id/start` | sewing supervisor | VERIFIED to SEWING_STARTED |
| `GET /api/health`, `/api/health/db` | public | Liveness and database check |

## Database schema

Migrations are in `server/src/db/migrations` and run in order with `npm run migrate`.

```
users 1---* cutting_orders *---1 recipes 1---* recipe_components
cutting_orders 1---* verification_items *---1 recipe_components
cutting_orders 1---* verification_logs *---1 users (verifier)
```

| Table | Key columns | Notes |
|---|---|---|
| `users` | id, email (unique), password_hash, role, full_name, created_at | `role` limited by a CHECK to the 3 factory roles |
| `recipes` | id, recipe_code (unique), name, category, std_fabric_yards, wastage_cap | Seeded: REC-BL01 Casual Blouse, REC-CT02 Crop Top |
| `recipe_components` | id, recipe_id, component_name, pieces_per_garment, image_url | Cut parts (Bill of Materials); cascades on recipe delete |
| `cutting_orders` | id, order_no (unique), recipe_id, target_qty, fabric_roll_id, actual_fabric_yds, status, created_by, timestamps, sewing_started_by/at | `status` limited by a CHECK to the 5 states; order numbers come from a sequence (`CUT-1001`...) |
| `verification_items` | id, order_id, component_id, expected_qty, actual_qty, status | One row per component per order; `actual_qty` NULL means not counted yet; unique on (order_id, component_id) |
| `verification_logs` | id, order_id, verifier_id, decision, rejection_note, wastage_pct, timestamp, item_snapshot (JSONB), audit_note | Append-only. `item_snapshot` permanently records every component's expected, actual, variance and status at decision time |

Additions beyond the minimum schema: `SEWING_STARTED` status, `sewing_started_by/at`,
`item_snapshot`, `audit_note`, and the `schema_migrations` bookkeeping table.

## Run locally

Requirements: Node 20+, and a PostgreSQL database (a free Supabase project works; use the
**Session pooler** connection string).

```bash
# API
cd server
npm install
cp .env.example .env      # fill in DATABASE_URL, JWT_SECRET, CORS_ORIGIN
npm run migrate
npm run seed
npm run dev               # http://localhost:4000

# Client (new terminal)
cd client
npm install
npm run dev               # http://localhost:5173 (proxies /api to :4000)
```

### Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | server | Postgres connection string |
| `JWT_SECRET` | server | Secret used to sign tokens |
| `CORS_ORIGIN` | server | Allowed browser origin(s), comma-separated, no trailing slash |
| `VITE_API_URL` | client (build time) | API base URL in production; empty in dev (Vite proxy is used) |

## Tests

The suite uses a **separate database** so it never touches demo data. Tests refuse to run
without `server/.env.test`.

1. Create a second, **empty** Postgres database (for example another Supabase project).
2. Copy the example file and fill in the test database values:

```bash
cd server
cp .env.test.example .env.test
```

3. Build the test database and run the suite:

```bash
npm run migrate:test      # should print "applied" for every migration
npm run seed:test
npm test
```

If `migrate:test` prints `skip` for every file, `.env.test` is pointing at a database that
already has the schema. Check that it is not your real database before running tests.

**What is covered (23 tests):**

| Required test | Verified by |
|---|---|
| 1. All-GREEN order can be approved by a verifier | Approves, status becomes VERIFIED, verifier id comes from the JWT; YELLOW also allowed |
| 2. RED component blocks approval | 422, order stays pending; also uncounted components and smuggled `verifier_id` |
| 3. Reject without a note is refused | Missing and blank notes return 422; a real note succeeds |
| 4. Non-verifier roles get 403 | Supervisor and sewing roles get 403; no token gets 401 |
| 5. Unapproved orders never reach the Sewing Queue | In-progress, pending and rejected orders are absent; `?status=` tampering changes nothing; starting sewing on an unverified order returns 409 |
| Extra | Optional verifier note reaches the Sewing Queue; over-long note rejected; pure unit tests for traffic light, hard stop and wastage formula |

## Deployment

- **API on Render:** root directory `server`, build `npm install`, start `npm start`.
  Set `DATABASE_URL`, `JWT_SECRET` and `CORS_ORIGIN` (the exact Vercel URL).
- **Client on Vercel:** root directory `client`, set `VITE_API_URL` to the Render URL
  **before** building. `client/vercel.json` rewrites all routes to `index.html` so deep links
  such as `/verify` survive a refresh.

## Known trade-offs

- The JWT is stored in `localStorage` for simplicity across two domains. An httpOnly cookie
  would be safer against XSS but needs more cross-domain configuration.
- Login has no rate limiting or lockout.
- Demo credentials are intentionally public for evaluation and would never be used in production.
- `npm run seed` is meant for a fresh database; it replaces recipe components, which fails
  once orders reference them (the foreign key protects the data).
- Passwords are hashed with bcrypt, but there is no password-change or user-management screen.

## AI usage

See [AI_OPTIMIZATION_REPORT.md](./AI_OPTIMIZATION_REPORT.md).