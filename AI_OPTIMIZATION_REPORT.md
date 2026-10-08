# AI Optimization Report

## 1. Tools & Prompting

**Tool used: Claude (Anthropic)**, as a step-by-step tutor
and code assistant. I did not use any other AI tool.

I chose the tech stack myself from what I already knew (React, Node/Express, PostgreSQL,
Render and Vercel). I asked Claude to compare options, and I decided against Next.js and
TypeScript because I did not know them well enough to build the RBAC and the hard stop
correctly in 4 days.

| Task | How AI was used |
|---|---|
| Architecture and phasing | Claude proposed a 7-phase plan (setup, schema, auth/RBAC, supervisor flow, verifier + hard stop, sewing queue, tests/deploy/docs). I worked one phase at a time. |
| Schema design | Claude drafted the SQL migrations (CHECK constraints, foreign keys, append-only audit trigger). I ran them and inspected the tables in Supabase. |
| Backend | Claude drafted the Express routes, JWT middleware and Zod schemas. |
| Frontend | Claude drafted the React pages, the form validation and the CSS theme. |
| Tests | Claude drafted the Vitest/Supertest suite for the five required rules. |
| Deployment and docs | Claude gave step-by-step Render/Vercel instructions and a README draft. |

**My working method:** I never moved to the next phase until I had run the code myself and
confirmed each phase's checks. For the backend I used Postman (about 40+ requests across
auth, orders, verification and sewing), and I tested every endpoint before building its UI.
For the frontend I walked through each role in the browser. I asked Claude to explain
anything I did not understand.

## 2. Flawed / Broken AI Code

These are real defects in what Claude gave me. I found them by running and testing the code, and by asking Claude to audit the finished project against the assessment PDF and then confirming each one myself.

1. **A requirement was missed: verifier audit notes.** Section 5 of the brief says the Sewing Supervisor "reviews verifier audit notes". Claude built a rejection note only, so approved batches reached sewing with no note. Claude flagged the gap when I asked it to audit the finished project against the PDF, and I treated it as a bug and had it fixed. The fix was a DB migration (`004_audit_note.sql`), an optional `note` on approve, the field returned by the sewing query, and a UI field.

2. **Verifier counts were lost on refresh.** The first Verifier UI only saved counts when Approve or Reject was clicked. The brief requires counts to persist across reloads, so a verifier who typed counts and refreshed lost them. The same audit found this, and I confirmed it by testing. I fixed it with a **Save counts** button that calls the existing counts endpoint, with a status message that clears when a number is edited.

3. **Test scripts ran against my real database.** The `migrate:test` and `seed:test` scripts 
use whatever database is in `.env.test`, and mine first pointed at my real one. I noticed because 
the migrations printed `skip` instead of `applied`, and the seed failed with a foreign-key error. 
The seed runs in a transaction, so it rolled back and nothing was lost. I then created a separate 
test database, and the README now warns that `skip` on a fresh database means the wrong target.

4. **Zod 3 syntax in a Zod 4 project.** The rejection-note schema used `required_error`, which is 
Zod 3 syntax. My project uses Zod 4, which ignores it. The rule still returned 422, but a missing 
note gave a generic message instead of my custom one. I found it when I had Claude audit the finished 
project against the brief, confirmed it with a search and a Postman request, and fixed it by changing 
it to `error: "..."`.


**What AI got right that I checked:** the first CSS I was given explicitly overrode the
Vite starter styles and set dark text on white for every input state, which is the
white-on-white defect the brief warns about. I still tested every input, dropdown and
textarea myself. I also kept the form numeric inputs as `type="text"` with a regex, because
`type="number"` accepts odd characters and hides invalid input.

## 3. Human Refactoring

- **Tested before trusting.** Every endpoint was exercised in Postman, including the illegal
  cases (wrong role, negative/decimal/string quantities, extra body fields, skipping states,
  repeated requests), before any UI was written for it.
- **Proved the tests can fail.** I deliberately removed the shortage check in
  `approvalBlocker`, confirmed Test 2 failed, then restored it.
- **Separated test and production data.** I created a second database so tests cannot add
  immutable audit rows to the demo database.
- **Tightened CORS** from allow-all to an explicit, configurable origin list for production.
- **Closed gaps I found by re-reading the brief:** the audit note (item 1), the Save counts
  button (item 2).
- **Own design choices.** I chose the role names and demo users, tuned the theme, and added
  my own favicon.

## 4. Defensive Architecture

**Layered defence.** Each layer is independent, so a bug in one cannot silently break the rule:
UI validation (convenience) -> Zod schemas on the server -> business rules in code ->
SQL constraints and triggers.

- **Authentication vs authorization.** `authenticate` returns 401 for a missing or invalid
  token; `requireRole` returns 403 for the wrong role. Each router applies its guard once
  with `router.use(...)`, so a new endpoint cannot be added unprotected.
- **Identity never from the client.** The JWT carries only the user id. The role is read
  from the database on every request. Verifier id, supervisor id and timestamps come from
  the server; request schemas use `.strict()` so extra fields like `verifier_id` return 422.
- **Hard stop.** Approval runs in a transaction that locks the order row
  (`SELECT ... FOR UPDATE`), reloads the raw counts and recomputes shortages itself
  (`approvalBlocker`). It does not trust the stored GREEN/YELLOW/RED flag, and any RED or
  uncounted component returns 422 with nothing written.
- **State machine.** Transitions are guarded `UPDATE ... WHERE status IN (...)` statements
  or run under the row lock, so concurrent clicks, double submits and illegal jumps return
  409. Skipping verification is impossible: starting sewing only matches `status = 'VERIFIED'`.
- **Query isolation.** `GET /api/sewing/queue` hard-codes `WHERE status = 'VERIFIED'` and
  reads no request parameters. Tampering with `?status=...` changes nothing, and a test
  proves it. Orders with no approval log are never returned.
- **Immutable audit trail.** `verification_logs` is append-only, enforced by a database
  trigger that blocks UPDATE and DELETE. Each row stores a JSONB snapshot of every
  component's expected, actual and variance at decision time, so later edits or recounts
  cannot rewrite history. A CHECK constraint also requires a non-blank note on rejection.
- **Input guards.** Negative numbers, decimals, strings, empty payloads and over-long notes
  are rejected in the UI, by Zod and by SQL CHECK constraints.
- **Automated tests.** 23 Vitest/Supertest tests cover the five
  required rules, plus input guards, the smuggled `verifier_id`, `?status=` tampering and
  the audit-note feature, all against a separate test database.

## Known limitations (candid)

- The JWT is in `localStorage` (XSS risk); an httpOnly cookie would be safer.
- No login rate limiting.
- Most of the code was drafted by AI. My contribution is the decisions, the testing, the
  debugging and the requirement audit, not hand-written code.