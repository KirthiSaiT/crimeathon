# Warden

**Behavioral key defense and a bank-change gate.** CrimeAthon'26, case CR-26-047 (Harbor & Finch Freight), team H4CK_077, approach: **Defense**.

> A valid machine key was used to read finance data and change a supplier's bank account, and no control connected the signals across systems or stopped the change before the payment run.

Warden learns what each key normally does, flags the moment it steps outside that pattern, makes a bank-account change impossible without a call-back and two different people, limits what a stolen key can do, and tests the vendor's own statements against the company's logs. It runs on the supplied case evidence. All data is fictional.

## Results at a glance

Measured on the real case evidence: 9 files, 10.8 MB, **109,061 events**.

| What | Result |
|---|---|
| Attack events detected | **237 of 237** (100%) |
| False alarms | **0 in 41,616** ordinary events |
| What a person has to read | 109,061 events become 240 flagged events and **23 alert groups** (5 critical, 15 high, 3 medium) |
| Suspicious bank changes held before payment | **2** (V-0412 with no approval reference, E19 line 313; V-0233 with an out-of-sequence reference, E19 line 243) |
| Vendor statements tested against the logs | 8: **6 contradicted**, 1 unproven, 1 true, each with cited log lines |
| First alert on the real timeline | 9 August, **about 25 days** before the 3 September bank change |
| Whole evidence analysed | about **1 second** (production build) |
| 8 times the evidence (86 MB) | analysed in **9 to 11 seconds** |
| Slowest page | **0.31 seconds** |
| Tests | **24** browser tests, **119** live-database checks, **74** unit tests, all passing |

### Accuracy on altered copies of the evidence

The same rules, run on copies of the logs that were changed on purpose. "Left alone" is ordinary activity the detector correctly ignored.

| Test | Detected | False alarms | Missed | Left alone |
|---|---|---|---|---|
| Supplied logs | 237 | 0 | 0 | 41,616 |
| Every vendor-link address renumbered | 237 | 0 | 0 | 41,616 |
| Two systems' clocks shifted two hours | 237 | 0 | 0 | 41,616 |
| Attacker on a real sync computer | 177 | 0 | 60 | 41,616 |
| Baseline learned from all data instead of frozen | 111 | 0 | 126 | 41,616 |

The attacker labels are taken from the case facts (the address ranges), so the table shows how consistently the rules agree with that reading of the logs.

### Why layered controls, not one

A replay of the real attack through each control on its own (`npm run simulate`, or the Simulation page):

| Control | Attack events blocked | Stops the bank change? |
|---|---|---|
| Address limit that includes the vendor link | 109 (46%) | No |
| Rotate a key found in a ticket within 7 days | 44 (19%) | No |
| Narrow each key to the actions it used | 173 (73%) | Yes |
| Exact address limit per key | 235 (99%) | Yes |
| Bank gate and call-back hold | the change itself | Yes |
| **All layers together** | **237 (100%)** | **Yes** |

The bank change in the case used a valid key from an allowed private-link address, which is why a broad address allowlist alone lets it through. Revoking at the first alert prevents 233 of 237 attack events (98%); after one day, 51%; after 30 days, none.

## How Warden defends

| Layer | What it does |
|---|---|
| **Behavior detector** | Learns each key's usual computers and actions from the first half of the logs, then **freezes** that baseline so the attacker's own traffic cannot become "normal". Flags a new computer, an action the key never performs, secret searches, export-then-delete cycles, bulk reads and failed logins. Sets aside ordinary activity (nightly sync, announced maintenance, staff exports). |
| **Bank-change gate** | Checks every supplier bank change for an approval reference that is real, unique and in sequence. Holds a change made through the API, one with a made-up or misused reference, one with no approval, and one made soon after the supplier's contact details changed. A held change is released only after a call-back, an analyst's request and a **different** approver's release. A key can ask for a change but never makes one. |
| **Key vault and gateway** | Keys are stored only as hashes, rotate on a timer with a grace window, and carry per-key scope and address limits (off, monitor or enforce). A call outside the rules is refused and the key is cut off automatically (quarantined read-only, or revoked). Every call is judged **ALLOWED**, **SUSPICIOUS** or **BLOCKED** with a 0 to 100 risk score and plain reasons. |
| **Trusted source address** | The database believes a source address only from the web gateway, which proves itself with a secret. A claimed private address is ignored, and a private address arriving from the public internet is blocked as forged. |
| **Secret scanner** | Every support ticket and comment is scanned for keys, tokens, private keys, passwords, JWTs and credentials in links before it is saved. A hit is refused, an administrator is alerted, and a pasted live vault key is replaced at once. |
| **Access control** | Sign-in is required. Five roles (viewer, analyst, approver, administrator, vendor) are enforced by the database with row-level security, not just by the screens. Every request, release, rejection and role change is written to an audit log. Idle sessions end after 15 minutes. |
| **Vendor claims** | Each statement in a vendor notice becomes a test over the logs and returns true, false or unproven, with the evidence lines that decide it. |

## Run it

You need Node.js 20 or newer.

```powershell
npm install --legacy-peer-deps
npm run dev
```

Open http://localhost:3000. The app starts **empty**: nothing is preloaded. Sign in, open **Upload logs**, choose files from the `evidence/` folder (or any logs with the same columns), and every page fills from what you uploaded. To make the server read the supplied evidence by itself, set `LOAD_SUPPLIED_EVIDENCE=true`.

### Set up the database (Supabase)

1. Create a Supabase project and put its URL and publishable key in `.env.local` (see `.env.example`). Never put the secret key in the app.
2. Apply the files in `supabase/migrations/` in order (`20261119000000` to `20261120000008`) with the Supabase CLI or the SQL editor.
3. For the gateway, make a secret, put it in `.env.local` as `GATEWAY_SECRET`, and register its hash once:
   ```sql
   select private.register_gateway_hash('<sha256 hex of the secret>');
   ```
4. For a demo that needs no email, turn off **Confirm email** under Authentication, Email in the Supabase dashboard. The first account created becomes the administrator and assigns roles on the **Access** page.

### Environment variables

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The database |
| `GATEWAY_SECRET` | Lets the web route supply a trusted source address to the database |
| `TRUSTED_PROXY_HOPS` | How many proxies in front of the app append to `X-Forwarded-For` (default 1 in production, 0 otherwise) |
| `NEXT_PUBLIC_REQUIRE_SIGN_IN`, `REQUIRE_SIGN_IN` | Sign-in is required by default. Set both to `false` to switch it off (the full browser test suite does) |
| `LOAD_SUPPLIED_EVIDENCE`, `EVIDENCE_DIR`, `CASE_PACK` | Make the server read the supplied evidence and case facts itself |

### What to upload

A file is recognised by **what is inside it**, not its name, so a renamed or re-exported file still loads.

| File | What it gives the app |
|---|---|
| A log (LedgerOne, HelpDeskr, sign-ins, BlueVault, the private link, the vendor change log) | Alerts, bank holds, the timeline, what each key normally does |
| The connected software register (`.json` with an `integrations` list) | Every key scored against policy, with narrow-scope advice |
| A **case-facts** file (`case-pack/CR-26-047.json`) | What logs cannot say: announced maintenance, the vendor's claims, the attacker address ranges, the payment-run days. With it: the scorecard, claim verdicts and the attack replay |

Each run replaces the last. Results stay in the browser tab, and **Clear and start again** empties them.

## The application

| Page | Purpose | Who acts |
|---|---|---|
| Overview | Summary: counts, hold queue, incident timeline | Everyone reads |
| Alerts | Every flagged group with the rule, what normal looks like and the evidence lines | Analysts record a decision |
| Keys | Every key scored against policy, ranked for rotation | Analysts request an action, approvers close it |
| Key vault | Create keys, set rotation and limits, try a key, attack replay, activity log | Administrators manage; analysts and approvers can quarantine |
| Bank gate | Every bank change checked, held changes, release | Analysts request, a different approver releases |
| Payment run | What the next run will pay and what is blocked | Same two-person release |
| Vendor claims | Each vendor statement tested against the logs | Everyone reads |
| Timeline | All systems on one time-ordered list with evidence | Everyone reads |
| Scorecard | Detections, false alarms and misses, with altered copies | Everyone reads |
| Simulation | The attack replayed through the defense; the Selenium test simulator | Everyone reads |
| Upload logs | Run the detector on files | Everyone who can view |
| Support tickets | A simulated help desk behind the secret scanner | Everyone raises; administrators override |
| Activity | Saved runs, the audit log, secret-block alerts | Analysts save; staff read |
| Access | Roles and the two-person rule | Administrators |

### Roles

| Role | Can do |
|---|---|
| Viewer | Read the case, raise tickets |
| Analyst | Save runs, review alerts, request key actions and hold releases, quarantine a key, read the audit log |
| Approver | Release a held bank change after a call-back, close key-action requests, quarantine a key, read the audit log |
| Administrator | Assign roles, set the two-person rule, manage keys, review secret alerts, override a block. Cannot move money |
| Vendor | A supplier's account. Sees none of the case data |

Details: `docs/RBAC.md`.

## The gateway

The simulated systems answer over HTTP, the way a real client would reach an API gateway:

```
POST /api/sim/ledgerone
Authorization: Bearer wk_ledgerone_...
{ "action": "vendors.bank.write", "params": { "vendor_id": "V-0412", "last4": "9083" } }
```

Every answer carries the verdict:

```json
{ "status": 202, "ok": true, "decision": "BLOCKED", "policy": "BANK-CHANGE-NEEDS-PEOPLE",
  "risk": 100, "reasons": ["held: a key cannot change a bank account; it waits for a call-back and a second person"],
  "trusted_source": true }
```

| Decision | Meaning |
|---|---|
| `ALLOWED` | Matches what the key normally does, risk under 30 |
| `SUSPICIOUS` | Allowed, but scored 30 or more: a new address (+35), a new action (+25), a burst of 20 calls in a minute (+30), or no trusted address on an address-limited key (+40). At 60 or more Warden recommends quarantining and rotating the key |
| `BLOCKED` | Refused or held. Names the policy that was broken (`ADDRESS-LIMIT`, `KEY-SCOPE`, `ADDRESS-FORGED`, `BANK-CHANGE-NEEDS-PEOPLE`, `KEY-INVALID`) with a risk of 100 |

Supplier bank accounts live in the simulated finance system, and a rejected or held change never alters them. See `docs/KEY_VAULT.md` and `docs/TICKET_SCANNER.md`.

## How the detector works

```
CSV logs ──► loaders ──► one event table (UTC) ──► frozen baseline ──► detect ──► alert groups
                                                                           │
  E19 change log ──► bank gate (approval check) ───────────────────────────┤
  E04 key register ──► key policy scoring ─────────────────────────────────┤
  vendor notices ──► claim tests over the logs ────────────────────────────┴──► app, CLI, tests
```

| Module (`src/engine`) | Job |
|---|---|
| `loaders.ts`, `csv.ts` | Recognise each log by its columns, convert every clock to UTC (HelpDeskr is India time, BlueVault is epoch seconds), keep file and line for every row |
| `baseline.ts` | Learn each actor's usual computers and actions from the first half of the time span, then freeze |
| `detect.ts`, `groups.ts` | Apply the rules and turn events into alert groups with the rule, the normal pattern and the evidence |
| `bank.ts`, `payment.ts` | The bank-change gate and the payment-run split of what is payable and what is blocked |
| `keys.ts` | Score each key against company policy: address limit, expiry, scope, review date, dormancy |
| `claims.ts` | Turn each vendor statement into a test over the logs |
| `evaluate.ts`, `simulate.ts` | Score the detector on altered copies, and replay the attack through single controls |
| `num.ts`, `cidr.ts` | Safe maths for very large inputs; address-range checks |

## Testing and evidence

| Suite | Command | Covers | Result |
|---|---|---|---|
| Unit (Vitest) | `npm test` | Engine on the real logs, altered copies, uploads, bank rules, payment run, address trust | **74** passing |
| Browser (Selenium) | `npm run e2e`, or **Run the Selenium tests** on the Simulation page | Uploads, alerts, keys, bank gate, payment run, sign-in gates, dark mode, phone width, all pages, API, load times, stress | **24** passing, plus 4 sign-in gate tests |
| Module tests | `npm run test:modules` | Roles, activity, key vault, address trust, risk score, tickets and the secret scanner, against the live database | **53** passing |
| Bank gate | `npm run test:bankgate` | Request and release between two real accounts | **21** passing |
| Vendor | `node tests/vendor/run.mjs` | The vendor role and the vendor claims, with evidence lines re-checked from the raw files | **45** passing |
| Metrics | `python tools\warden_metrics.py --email you@example.com` | Measures the evidence files and the real response time, then derives throughput, latency, scaling and a projection | Prints to the terminal and saves a report |

The browser suite runs against a server with sign-in switched off (`NEXT_PUBLIC_REQUIRE_SIGN_IN=false` and `REQUIRE_SIGN_IN=false`); with sign-in on it runs the gate tests. Its report, with screenshots, is in `docs/selenium/`. The database suites sign in as throwaway accounts through the real login, so every check passes through the real row-level security and database functions.

### Performance (production build, one laptop)

| Measure | Result |
|---|---|
| Whole evidence analysed on the server | about 1.0 s median |
| Whole upload through the browser | 1.6 s |
| Slowest page ready | 0.31 s |
| 2x, 4x, 8x the evidence (86 MB) | 2.1 s, 4.5 s, 9 to 11 s, growing close to linearly |

## Command reference

| Command | What it does |
|---|---|
| `npm run dev` | The web app |
| `npm run build`, `npm start` | Production build and server |
| `npm run analyze` | The detector on the command line with the case facts. `-- <folder>` for another folder, `-- --json` for the full result |
| `npm run simulate` | Replay the attack through the defense and test single controls |
| `npm test` | Unit tests |
| `npm run e2e`, `npm run e2e:report` | Browser suite and its HTML report |
| `npm run test:modules`, `npm run test:bankgate`, `npm run test:live` | Live-database suites (they write to the database, so run them against a test project) |
| `npm run typecheck`, `npm run lint` | TypeScript and lint checks |

## Scope and connecting real systems

Everything here runs on the fictional case data. LedgerOne, HelpDeskr and BlueVault in the Key vault are simulations built inside the database, with made-up suppliers, tickets and files, so that each defense can be shown working end to end. Rotation and suspension of real vendor keys are recorded as requests; Warden does not change a key in another company's system.

Warden sits **beside** the systems it protects, so a compromise of one of them cannot switch the defense off, and it can follow an attack that crosses all three. Connecting it to live systems needs two interfaces, both already defined here:

1. **Logs in.** Today by upload; the detector accepts any log with the same columns.
2. **A gateway check out.** The request contract above: a key request is checked against the key's policy and answered with a verdict before it is carried out.

## Repository layout

```
src/engine/        the detector, bank gate, claims, simulation
src/app/           the Next.js pages and API routes (/api/analysis, /api/sim, /api/e2e)
src/components/    shared interface components and the sign-in gate
src/lib/           Supabase clients, address trust (net.ts), shared types
supabase/          database migrations (tables, row-level security, key vault, scanner, gateway)
case-pack/         the case facts file
evidence/          the 20 supplied files, untouched
tests/             unit, browser, live-database and vendor suites
tools/             warden_metrics.py
docs/              design notes, the Selenium report, the one-page brief and slide
scripts/           command-line analysis and simulation
```

## Documents

`docs/Solution_Defense.md` (the defense in detail), `docs/KEY_VAULT.md`, `docs/RBAC.md`, `docs/TICKET_SCANNER.md`, `docs/Best_Solution.md`, `docs/findings_CR-26-047.md`, `docs/brief/` (one-page executive brief), `docs/slides/` (feasibility and evidence slide), `docs/selenium/` (browser test report).

Built with Next.js, TypeScript, Tailwind, shadcn/ui and Supabase.
