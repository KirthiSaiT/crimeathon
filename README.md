# Warden

Case CR-26-047 (Harbor & Finch Freight), team H4CK_077, **Defense**.

Warden reads the company's logs, learns what is normal for every machine key, flags the moments a key steps outside its pattern, checks every supplier bank change for an approval reference, and tests the vendor's claims against the company's own logs. It runs only on the supplied evidence. Everything is fictional and synthetic.

> A leaked machine key can read finance data and change supplier bank details, and no control connects the signals across systems or stops the change before the payment run.

## Run it

You need Node.js 20 or newer.

```powershell
npm install --legacy-peer-deps
npm run dev
```

Open http://localhost:3000. **The app starts empty.** Nothing is preloaded: open **Upload logs**, choose logs from the `evidence/` folder (or any logs with the same columns), and every page fills from what you uploaded and nothing else. To make the server read the supplied evidence by itself instead, set `LOAD_SUPPLIED_EVIDENCE=true` (see `.env.example`).

| Command | What it does |
|---|---|
| `npm run dev` | The web app, empty until you upload logs |
| `npm run analyze` | The same detector on the command line, with the case facts in `case-pack/`. `npm run analyze -- <folder>` for another folder, `-- --json` for the full result. Call `npx tsx scripts/analyze.ts` with no `--case` to see what the logs say with no case facts |
| `npm test` | 38 tests on the supplied logs, altered copies, uploads, the simulation, the bank rules and the empty start |
| `npm run simulate` | Replay the attack through the defense: when each layer fires, how fast the response must be, which single controls would have stopped the bank change. See `docs/Solution_Defense.md` |
| `npm run typecheck` | TypeScript check |

### What to upload

A file is recognised by **what is inside it**, not by its name, so a renamed or re-exported file still loads.

| File | What it gives the app |
|---|---|
| A log (LedgerOne, HelpDeskr, sign-ins, BlueVault, the private link, the vendor change log) | Alerts, bank holds, the timeline, what each key normally does |
| The connected software register (`.json` with an `integrations` list) | Every key scored against policy, with narrow-scope advice once logs are loaded too |
| A **case-facts** file (`.json`, see `case-pack/CR-26-047.json`) | The things logs cannot say: announced maintenance, a release that added an action, the vendor's claims, the attacker address ranges, the payment-run days |

Without case facts the detector knows only what the logs say. It then flags the 3.6.0 contact sync and the announced maintenance traffic, because nothing tells it they are ordinary. It shows no vendor claims, and it cannot score its own accuracy, because that needs the attacker address ranges. With the `case-pack` file added it reproduces the full result (23 alert groups, 237 of 237 attacker events caught, 8 vendor claims tested). The logs alone are enough for the bank gate: the two suspicious bank changes are held either way.

Each run replaces the last one. Results are kept in the browser tab, so a reload keeps them and **Clear and start again** (on the Upload page) empties them. Nothing is stored on the server.

## How it works

```
CSV logs ──► loaders ──► one event table (UTC, one shape) ──► baseline (frozen) ──► detect ──► alert groups
                                                                                     │
  E19 change log ──► bank gate (approval reference check) ─────────────────────────────┤
  E04 key register ──► key policy scoring (E10) ──────────────────────────────────────┤
  vendor notices ──► claim tests over the logs ───────────────────────────────────────┴──► app, CLI, tests
```

| Module (`src/engine`) | Job |
|---|---|
| `loaders.ts`, `csv.ts` | Recognise each log by its columns, convert every clock to UTC (HelpDeskr is India time; BlueVault is epoch seconds with an optional offset), keep file and line for every row |
| `baseline.ts` | Learn each software actor's usual computers and actions from the first half of the time span. The baseline is **frozen** so the attacker's own traffic cannot teach it to ignore the attack |
| `detect.ts` | Flag a new computer, an action the key never performs, secret searches, export-then-delete cycles, a key reading a folder it never reads, bursts of failed logins; set aside ordinary events (the 3.6.0 contact sync, announced maintenance, staff exports) |
| `groups.ts` | Turn events into alert groups, each with the rule, what normal looks like, and the evidence file and lines |
| `bank.ts` | The bank-change gate: approval reference present, unique and in sequence; a hold list for call-back before the next run |
| `keys.ts` | Score each key against the company policy: address limit, expiry, scope, review date, dormancy |
| `claims.ts` | Turn each statement in a vendor notice into a test over the logs |
| `evaluate.ts` | Run the same rules on altered copies of the logs and count correct detections, false alarms and misses |
| `simulate.ts` | Replay the attack through the defense and test single controls one at a time (address limits, rotation, revoke delay, bank gate) |
| `context.json` | Facts that come from documents, not logs: the announced maintenance window, the release that enrolled a new action, vendor claims to test |

## Results on the supplied logs

109,061 events from 8 files, analysed in about 2 seconds.

| Test | Caught | False alarms | Missed | Left alone |
|---|---|---|---|---|
| Supplied logs | 237 | 0 | 0 | 41,616 |
| Vendor-link computers renumbered | 237 | 0 | 0 | 41,616 |
| Two clocks shifted two hours | 237 | 0 | 0 | 41,616 |
| Attacker on a real sync computer | 177 | 0 | 60 | 41,616 |
| Same, baseline learned from all data | 111 | 0 | 126 | 41,616 |

The detector also holds the two suspicious bank changes (V-0412, no approval, E19 line 313; V-0233, out-of-sequence reference APR-1182, E19 line 243), and it sets aside four kinds of ordinary activity rather than flagging them.

## Limits, stated plainly

- **The labels are our own attribution.** "Attacker" means events from 198.18.7.x and 10.20.4.77, plus reads of finance folders by the storage key with a blank address. A clean score shows the rules agree with that reading, not that they will generalise.
- **An attacker who uses a real sync computer** is still caught on API and ticket actions, but the bare network flows from that computer look normal. The scorecard shows the 60 misses.
- **The baseline must be frozen.** Learned from all data, it degrades sharply (last row above).
- **Shared home-internet addresses** (198.18.0.0/16) identify nobody, so the detector does not flag on an address range.
- **Document facts are configured, not read.** `context.json` carries the maintenance window, the 3.6.0 enrolment and the claims, because they come from PDFs.
- **Rotation, expiry and access scope are recommended, not carried out.** Warden scores and ranks; it does not change a key.
- **Who did it is unknown.** Nothing in the evidence names a person.

## Supabase

`supabase/migrations/20261119000000_init.sql` is applied to the `crimethon` project. It creates:

| Table | Holds |
|---|---|
| `profiles` | each user's role: viewer, analyst or approver (new sign-ups start as viewer) |
| `analysis_runs` | a saved detector run: the result snapshot, its stats and files |
| `alert_reviews` | an analyst's decision on one alert group |
| `hold_releases` | a bank change released from hold (approver only, needs a call-back, never edited) |
| `key_actions` | requests to suspend, quarantine, rotate or set an expiry on a key |
| `audit_log` | who did what, written by triggers |

Row-level security enforces the roles in the database. It was tested on throwaway users in a rolled-back transaction: a viewer cannot save a run, an analyst cannot release a hold or promote themselves, an approver can release a hold once and only with a call-back, releases cannot be edited or deleted, and a signed-out visitor sees nothing. The Supabase security advisor reports no findings.

**What the app does with it.** Sign in at `/login` (email and password). Signed out, every page is readable and the write actions say why they are off. Signed in:

- an **analyst** can ask for a held bank change to be released, and a different **approver** releases it after a call-back (`hold_requests`, `hold_releases`);
- an analyst can also record a decision on an alert, request a key action (rotate, quarantine, suspend) and save a run, on the Activity page;
- the **Activity** page lists saved runs and, for staff, the audit log.

Access is role-based (viewer, analyst, approver, administrator, vendor) with permissions stored in the database and a two-person rule on releasing a held bank change: see `docs/RBAC.md`. The first account created becomes the administrator and assigns roles on the **Access** page. If email confirmation is on (the Supabase default), a new account must click the link in its email before it can sign in.

Key suspension and rotation of the *real* keys are **requests recorded in the database**; Warden does not change a key in the vendor's systems. The **Key vault** page is a simulation of short-lived keys: three made-up systems (LedgerOne, HelpDeskr, BlueVault) whose keys rotate on a timer an administrator sets, with a grace window, read-only quarantine and an activity log. The vault also enforces address limits, cuts a key off automatically on a critical event, splits a broad key into narrow ones, holds any bank change a key asks for, and has a one-click attack replay. See `docs/KEY_VAULT.md`. The **Support tickets** page is a simulated help desk that refuses any ticket or comment containing a secret, alerts an administrator and rotates a pasted vault key at once: see `docs/TICKET_SCANNER.md`.

## Evidence and documents

- `evidence/`: the 20 supplied files, untouched.
- `docs/`: the Tier 1 problem statement (PDF), the Tier 2 concept deck (PPTX), and the analysis notes.
- `research/scripts/`: the exploratory scripts used to read the logs before the engine existed.

## Design

The interface borrows its look from a public workspace product: a warm neutral palette, one blue accent, a sidebar, page-style layouts and database-style tables with soft tags. It is a design reference only and does not use that product's name, logo or assets. The tokens were read from the reference site's published styles (see `.hallmark/brand-spec.md`).

Built with Next.js, shadcn/ui, Tailwind and TypeScript.
