# CR-26-047 – All candidate problem statements and issues
Built from the case file plus E01–E20 (all 20 now read). IDs cite the evidence. "Confirmed" = seen in a record. "Inferred" = my reading.

## A. Issues present (what is wrong, regardless of approach)

### A1. The incident (confirmed)
Leaked keys -> HelpDeskr abuse (E02) -> LedgerOne vendor/payment exports (E01) -> BlueVault bank-instruction files (E05) -> pivot via vendor host tb-build-02 (E15, E01, E02) -> API bank-detail change on V-0412 on 3 Sep, no approval ref (E18, E19). Five days before the 8 Sep run.

### A2. Control and governance failures
| # | Issue | Evidence |
|---|-------|----------|
| 1 | Keys pasted into tickets as routine practice | E13, E11 f2, E10 s5.1, E09 R-025 (Review overdue since Mar 2026) |
| 2 | Partner BlueVault key never rotated, read:all-folders, no IP limit | E04, E09 R-029 (due Sep 2025, not done), E05 |
| 3 | TallyBridge keys: all-modules write / admin, no IP limit, no expiry, never reviewed since 12 Jun 2024 | E04, E10 s2.1-2.3 |
| 4 | No alert on bulk export or export deletion | E10 s4.1, E11 f6, E06 (billing noticed it, security did not) |
| 5 | Vendor onboarded on self-reported answers; SOC 2 excluded corporate IT, source control and the credential vault; no pen-test summary requested; annual review never done | E07, E08, E11 f7 |
| 6 | TallyBridge risk R-031 rated Low (6), "Accepted" in 2024, review overdue since Jun 2025 | E09 |
| 7 | Contract: no audit right, liability pushed to H&F for unrestricted keys (5.3, 14.3), subprocessors changeable without notice (11.4) | E08 |
| 8 | Incident notices sent to billing mailbox only; vendor says "closed" while logs show finance and file access, vendor-side host involved, key still unrestricted | E12, E16, E01, E05, E15, E04 |
| 9 | Vendor public claims vs reality: "release pipeline isolated from production" vs build host reaching H&F systems; forum posts 14 and 17 Aug describe the same activity | E20-A/E, E15 |
| 10 | Bank-detail changes without approval ref (3 earlier UI changes by Finance staff plus V-0412 via API) | E19 |
| 11 | Dual-approval on payment runs (R-015) does not cover vendor-master changes | E09, case file App. B |
| 12 | Departed staff: Rohan Menon logged in on kiosk 13 Aug, password only, MFA not enrolled; roster shows 8 people with termination dates but status "active" | E03, E14, E11 f3, E09 R-018 (overdue Apr 2026) |
| 13 | Unused but active keys: key-tb-03 (last used Jan 2025), key-app-12 Payments Console (Mar 2025) | E04, E11 f5 |
| 14 | Service account svc-reporting not in the roster; 312 failed logins from a stuck script | E03, E13 3 Jul |
| 15 | Audit findings 2,4,6 (High) past due, follow-up review status unrecorded | E11, E10 s7.1 (deadline 1 Jan 2026 missed) |
| 16 | No CISO, no SIEM, no laptop logs; LedgerOne 90-day retention; BlueVault clock unsynchronised and some IPs blank; SSO device ID blank before 20 Jun | Case file s3, E03, E05 |
| 17 | Legal exposure: customer notification clocks, two renewals in Q4, procurement asking for evidence | Case file s5, App. C |

### A3. Traps and ordinary events (do not flag)
- 198.18.7.0/24 is shared residential space: staff legitimately appear from .58 (13 Jul) and .24 (5 Aug) in E03. IP alone does not attribute (E20-G).
- ~70 successful staff logins from 198.18.7.* and widespread 198.18.x bad-password noise are ordinary remote access.
- Daily 01:30 sync, 429 rate limits on key-tb-07 (17, all from sync nodes), Tuesday exports (E02), Farah's 22 Jul export-delete and 31 Jul BULK-0731 import (E13, E19).
- Rohan's login, svc-reporting failures, slow dashboard (no supporting data).
- Aditi's three failed logins on 15 Aug 16:20-16:24Z came from 198.18.7.77 (E03), the same address read BlueVault finance files (E05). Consistent with the same actor, but not proof (shared IP, BlueVault clock offset).

## B. Candidate problem statements

### Defense
| ID | Problem | Core evidence | Idea / deliverable |
|----|---------|---------------|--------------------|
| D1 | **Cross-system credential-misuse detection ending in a vendor bank change** (recommended) | E01, E02, E04, E05, E15, E18, E19 | Per-integration behaviour profile + approval check + hold on bank changes before payment runs |
| D2 | Secrets in tickets are never detected or rotated | E13, E02, E05, E09 R-025/R-029 | Secret scanner on ticket text that maps hits to key IDs in the register and opens a rotation task |
| D3 | Vendor-master changes lack enforced approval | E19, E18 | Change-gate: approval-ref validation, call-back list, pre-run diff report |
| D4 | Vendor claims are never tested against our own logs | E16, E12, E07, E20 vs E01, E05, E15 | Claim-vs-log verifier that tests each statement in a vendor notice |
| D5 | Non-human credentials are unmanaged | E04, E10, E11 f4/f5 | Automated policy-compliance score per key (scope, IP, expiry, last use, last review) |
| D6 | Export abuse is invisible to security (the bill noticed it) | E02, E06, E01 | Export create/download/delete cycle detector plus billing-signal link |
| D7 | Offboarding and identity records disagree | E14, E03, E11 f3 | HR/SSO reconciler with MFA-gap flag |
| D8 | Timelines cannot be reconstructed across mismatched clocks and names | E01 UTC, E02 IST, E05 epoch, E15 labels | Clock-normalising, entity-resolving timeline builder |
| D9 | Risk register under-rates and ignores overdue reviews | E09, E11 | Evidence-driven re-scoring (R-031 Low vs what logs show) with review-overdue alerts |
| D10 | Notification readiness | Case file s5, E08 7.2 | Customer-notification evidence pack and decision clock |

### Offense (must stay on supplied data or a simulation)
| ID | Weakness exploited | Footprint to report | Evidence |
|----|--------------------|---------------------|----------|
| O1 | Secrets in tickets: harvest keys by searching HelpDeskr with an admin integration | ticket.search keyword bursts, TKT read, export create/download/delete | E02 |
| O2 | Over-privileged LedgerOne key: recon, bulk export, bank-detail PATCH | /v2/me, /schema recon, exports, PATCH bank-details, E19 row with blank approval | E01, E18, E19 |
| O3 | Unrestricted partner BlueVault key: read finance bank-instruction files | list /finance, repeated reads of xlsx files | E05 |
| O4 | Vendor-side build host on the private link | 10.20.4.77 flows, off-hours key use | E15 |
| O5 | Sync-window masquerade: hide the change in the daily contact-sync, copy UA and node | Same fields as legit sync; what survives is the missing approval ref | E18, E19, E20-C |
| O6 | Log retention and clock gaps: act where evidence expires or is unreliable | 90-day purge, BlueVault blank IPs | E01, E05 |
| O7 | Stale-account use (departed staff, no MFA) | kiosk login, password-only | E03, E14 |
| O8 | Trust in vendor notices: impersonation or delayed disclosure; lookalike domain tallybridge-support.example registered 19 Aug 2026 (my extraction of the E20-F table was garbled, check the PDF) | email headers, domain age | E12, E16, E20-F |

## C. Strength ranking (my view)
1. D1 (Defense) / O2+O5 (Offense): strongest evidence, joins 6+ items, time-critical.
2. D3, D2, D6: strong, narrower.
3. D4, D5, D9: good governance angles; weaker as "working model".
4. D7, D8, D10: supporting.
Avoid as a main problem: O7/D7 alone (distractor), anything that just restates the logs.

## D. Not yet checked
- PDFs were read as extracted text; E20-F's table layout was garbled.
- E05 clock offset unknown; no raw-byte verification of the xlsx beyond text.
- Whether V-0412 is on the 8 Sep run: not in the data.
