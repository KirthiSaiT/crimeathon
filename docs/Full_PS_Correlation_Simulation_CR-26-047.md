# CR-26-047 – Correlation, simulation and all problem statements
Sources: case file + E01–E20 (all read). Facts = seen in a record. "Inferred" = my reading. Simulation = scripts/sim1-3.js run on the supplied logs.

## 1. Cross-evidence correlation (what links to what)
| # | Link | Evidence chain |
|---|------|----------------|
| C1 | Leaked secret -> later use | E13 (25 Jun, bvk-7f3a pasted in TKT-48213) -> E02 (11–12 Aug: 16 searches for "password", "bvk-", "private key"; TKT-48213 read) -> E05 (14–15 Aug: bvk-7f3a used from 198.18.7.23/.24/.77, normal source is 172.16.9.40). ~50 days from leak to use |
| C2 | Same actor across 3 systems | 198.18.7.41 / .58 appear in E01 (9 and 12 Aug), E02 (11–12 Aug). 198.18.7.77 appears in E05 and E03 (Aditi's failed logins 15 Aug). Shared residential range: consistent, not proof |
| C3 | Move into the vendor network | E15 (10.20.4.77 = tb-build-02, label vendor-supplied) + E01 (17–19 Aug: 52 payment searches in the attacker set, bank-details dumps) + E02 (18 Aug "iban", "swift") + E20-B (16 Aug "re-provisioning") |
| C4 | Impact | E18 (3 Sep 01:41–01:44: GET vendor, GET bank-details, GET payments/scheduled, PATCH bank-details) -> E19 chg-8b9888c39b (V-0412 ****4417 -> ****9083, API, no approval_ref) |
| C5 | Vendor story vs logs | E16 ("metadata only", "nothing on private link", "rotated 24 Aug", "closed") vs E01 (finance data), E05 (files), E15 (private link), E04 (key unchanged, unrestricted) |
| C6 | Why nothing fired | E10 s2/4/5, E11 findings 2/4/6 (open, past due), E09 R-025/R-029/R-031 (overdue or rated Low), E07/E08 (no audit right) |
| C7 | Cost signal that was ignored | E06: 14 export jobs in Aug vs 4 in Jul; billing noticed, security did not |
| C8 | Possible earlier precursor (new, unverified) | E15: 10.20.4.77 sent 10 flows to LedgerOne-sandbox on 9 Jul, 22:00–22:52Z (about 95 KB). Could be 3.6.0 testing (release 1 Sep) or an earlier foothold. Not decidable from the data |

## 2. Simulation results (defense side, run on the supplied data)
- LedgerOne integration keys: 29,537 rows (user logins excluded). key-tb-07 has 2,091 rows, 67 active days, 6 sync nodes (10.20.4.11–.16), endpoints: GET invoices / payments status / vendors, POST invoices.
- Naive per-key profile (new IP or new endpoint): flags 151 rows after 9 Aug. 70 of them are the legitimate 3.6.0 contact PATCH from sync nodes = false alarms. Lesson: a profile must be told about releases.
- Source-aware profile (sync node set + endpoint family, plus enrolled 3.6.0 contact PATCH): key-tb-07 rows 2,091; attacker-labelled 81 (198.18.7.x and 10.20.4.77); TP 81, FP 0, FN 0.
- Caveat: the attacker labels are my own attribution from IPs, so the perfect score shows the rule is consistent with that reading, not that it generalises. Unseen data will be harder.
- Decisive rule: a bank-details write from a non-sync source (only hit: 3 Sep 01:44:30Z from 10.20.4.77). Approval check alone also catches it: E19 has 4 bank changes with no approval_ref (3 UI by Finance staff, 1 API).
- Masquerade check: 5 attacker rows fall inside the 01:30–01:45 sync window and carry the sync user agent (TallyBridge-Sync/3.5.0 on those rows). Time window and UA alone would not separate them; source host and endpoint do.
- Per-key IP allowlist alone would not have caught step C1 (bvk-7f3a had no restriction) nor a call from a vendor node inside the allowlist (10.20.4.77 is on the private link).

## 3. Attack-path simulation (offense plan, on supplied data only)
| Step | Action | Weakness used | Visible footprint (defender sees) |
|------|--------|---------------|-----------------------------------|
| 0 | Search HelpDeskr for secrets with admin integration | Keys in tickets, tb-sync-svc admin scope | 16 ticket.search with secret keywords, TKT read (E02) |
| 1 | Recon LedgerOne with leaked key-tb-07 | No IP restriction, no expiry | /v2/me, /schema, limit=1 probes from a new IP (E01 9 Aug) |
| 2 | Bulk export vendors/payments, delete export | No bulk-export alert | export create/download/delete cycles (E01, E02), billing jump (E06) |
| 3 | Read bank-instruction files with partner key | BlueVault key never rotated, all folders | repeated reads of vendor-bank-details-2026.xlsx (E05) |
| 4 | Move to vendor build host inside the private link | Vendor controls, no audit right | flows from 10.20.4.77 (E15) |
| 5 | Pick target vendor, check scheduled payments | Read access to payments | GET payments/scheduled (E18) |
| 6 | Change bank details inside the sync window with sync UA | Vendor-master change needs no approval via API | PATCH bank-details, blank approval_ref (E19) |
| 7 | Re-check the payment run | - | GET payments/scheduled 6 Sep |
Best offense variation: use an actual sync node and stay inside the contact endpoint family — that defeats my source-aware rule. What still catches it: no approval_ref, and bank-details is not in the sync's endpoint family (E20-C says contact fields only).

## 4. Defense problem statements (ranked)
1. **D1 – Cross-system credential-misuse and bank-change detection** (recommended). Belief: leaked non-human keys were used across LedgerOne, HelpDeskr and BlueVault and ended in an unapproved bank change. Idea: per-integration behaviour profile + approval check + hold before the payment run. Test: sim above plus hold list.
2. **D2 – Secrets in tickets**: scan ticket text, map hits to key IDs in E04, open rotation task. Link C1 (50 days).
3. **D3 – Vendor-master change gate**: approval_ref validation, call-back list, pre-run diff of bank fields (E19: 4 bank changes without ref).
4. **D4 – Vendor claim verifier**: test each statement in E12/E16 against own logs (all 4 key claims fail).
5. **D5 – Non-human credential hygiene score** (scope, IP limit, expiry, last use, last review; E04: key-tb-07 and bvk-7f3a fail all five; key-tb-03 and key-app-12 are dormant).
6. **D6 – Export-abuse detector**: create/download/delete cycles + billing signal (E02, E06).
7. **D7 – Clock- and name-normalising timeline builder** (UTC vs IST vs epoch; key-tb-07 = tb-sync-svc = host labels).
8. **D8 – Offboarding reconciler** (E14 8 people with termination dates and active status; Rohan's kiosk login).
9. **D9 – Evidence-driven risk re-scoring** (R-031 Low vs logs; overdue reviews R-018/R-025/R-029).
10. **D10 – Notification-readiness pack** (customer notification clocks, E08 7.2).
11. **D11 – Third-party host provenance check** (new, C8): flag private-link hosts that appear without a register entry (10.20.4.77 on 9 Jul to sandbox, 17 Aug to production).
12. **D12 – Log-gap risk**: 90-day LedgerOne retention, BlueVault clock offset, blank IPs; the evidence expires.

## 5. Offense problem statements
1. **O1 – Harvest secrets from tickets**: use the admin integration to search HelpDeskr for keys (step 0).
2. **O2 – Over-privileged LedgerOne key to bank-detail change** (steps 1, 5, 6). Strongest.
3. **O3 – Unrestricted partner BlueVault key to bank-instruction files** (step 3).
4. **O4 – Vendor build host as a trusted pivot** (step 4).
5. **O5 – Sync-window masquerade** (step 6 variant): hide inside daily sync with the sync user agent.
6. **O6 – Evidence-expiry timing**: act where retention (90 days) and clock offsets hide the trail.
7. **O7 – Stale human accounts** (departed staff, password-only kiosk login): weak link to money.
8. **O8 – Trust in vendor notices / lookalike domains** (E12, E16, E20-F; table text was garbled, check the PDF).
9. **O9 – Export-and-delete to avoid retention** (E02, E01): exfiltrate then remove the artefact.
10. **O10 – Payment-run timing**: change bank detail inside the 5 days before the run (3 Sep vs 8 Sep).

## 6. Recommendation
- Pick **Defense D1** (chain, time-critical, testable). Offense alternative: **O2 + O5** as one story.
- Locked at submission, so choose now. D1's support points: D3, D2, D6 as sub-detectors.

## 7. Open points
- Whether V-0412 is on the 8 Sep run; whether ****9083 is the attacker's.
- Source of the key leak (vendor vs elsewhere).
- 9 Jul sandbox burst (C8): benign testing or early foothold.
- E05 clock offset; E20-F table text; the only case-file doc supplied is one Google Doc.
