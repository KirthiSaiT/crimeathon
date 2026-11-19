# CR-26-047 – Evidence findings (verified against E01–E20)

All times UTC unless marked. E02 is IST (UTC+5:30); E05 is epoch seconds on an unsynchronised clock (offset unknown).
Facts = seen in a record. Inferences are labelled.

## What the evidence supports
One actor (addresses in 198.18.7.0/24, a residential reseller range) used TWO leaked credentials, then moved to a host inside
TallyBridge's own network, and finally changed a vendor's bank account on 3 Sep, five days before the 8 Sep payment run.

| # | When | What | Evidence |
|---|------|------|----------|
| 0 | 25 Jun | Support lead has customer paste a BlueVault key (bvk-7f3a) into ticket TKT-48213. "How we've always done it." | E13 11:31, E11 finding 2, E10 s5.1 |
| 1 | 9 Aug 03:12–03:44 | Recon on LedgerOne with key-tb-07 from 198.18.7.41, UA "TallyBridge-Sync/3.4.1" (version retired 10 Jul) | E01, E20-C |
| 2 | 11 Aug 23:12 IST – 12 Aug 00:33 IST | tb-sync-svc (HelpDeskr, "admin" scope) from 198.18.7.41/.58: 16 searches for secrets ("password", "bvk-", "private key"...), reads TKT-48213, 10 export create/download/delete cycles | E02, E13 12 Aug, E06 (13 jobs by 24 Aug, 14 in Aug vs 4 in Jul) |
| 3 | 12 Aug 03:41–04:02 | Same key-tb-07, same IPs: two full vendor exports (9,840 and 9,835 records), 330-row payment searches, one export deleted. Finance data WAS accessed | E01 |
| 4 | 14 Aug 21:06 – 15 Aug 22:04 | bvk-7f3a used from 198.18.7.23/.24/.77 (blank IP on some rows): lists /finance, repeatedly reads vendor-bank-details-2026.xlsx, payment-run-template.xlsx, bank statements. Normal use of this key is 172.16.9.40 and /customer-docs only | E05, E04 (bvk-7f3a: read:all-folders, no IP restriction, no expiry) |
| 5 | 16 Aug 18:00–21:00 | TallyBridge "re-provisions" build host tb-build-02, "no customer impact" | E20-B |
| 6 | 17–19 Aug (~12:10Z) | Host 10.20.4.77 = tb-build-02 (label per E15) uses key-tb-07 and tb-sync-svc: ~15 payment searches then bank-details dumps (640/210/190), a payments export on 18 Aug then deleted, HelpDeskr searches "bank", "iban", "swift", "payment instruction", "vendor change" | E15, E01, E02 |
| 7 | 21 Aug | TallyBridge emails accounts@ only: "precaution", no action needed | E12, E13 21 Aug |
| 8 | 28 Aug | TallyBridge says: ticket metadata only, no finance/files, nothing on private link, rotated 24 Aug, "closed". Each claim is contradicted by items 3, 4, 6 | E16 vs E01/E05/E15 |
| 9 | 1 Sep | TallyBridge release 3.6.0 starts contact-detail sync (email/phone only), producing ~100 legitimate PATCH .../contact calls on key-tb-07 at 01:30–01:45 daily from 10.20.4.11–.16 | E20-C, E19, E18 |
| 10 | 3 Sep 01:41–01:44 | From 10.20.4.77 (not a sync node) in the sync window: GET V-0412, GET its bank-details, GET payments/scheduled, then PATCH .../V-0412/bank-details. Coastal Packaging Ltd ****4417 -> ****9083, API channel, NO approval_ref. It is the only bank-detail change ever made via the API | E18 req-5f61b0de8, E19 chg-8b9888c39b |
| 11 | 6 Sep 01:36 | 10.20.4.77 checks payments/scheduled again | E18 |

Key still in use after the "24 Aug rotation": E04 (2 Sep) shows key-tb-07 created 2024-06-12, last_review 2024-06-12, no IP restriction, no expiry, scope "read:write all-modules".

## Why it was not caught (governance)
- E11 (Sep 2025): findings 2, 4, 6 (pasted secrets, non-expiring/unrestricted keys, no bulk-export alerting) were Open with target dates that have all passed. Follow-up status unrecorded.
- E10 s2.1/2.2/2.3/4.1/5.1 would each have blocked or flagged steps 0-4; s7.1 deadline 1 Jan 2026 missed.
- E07: vendor accepted on self-reported answers; SOC 2 excluded the credential vault and corporate IT; annual review never done. E08: clause 5.3 and 14.3 push the restriction duty and liability onto H&F.
- E12/E16: notices went to the billing mailbox; E20 shows 3 clues the vendor's story is incomplete (forum posts 14 and 17 Aug, new lookalike domains).

## Set aside / ordinary
- Rohan Menon kiosk login 13 Aug (E03): password only, from 172.16.8.44, no API or BlueVault activity. A real offboarding gap (E11 finding 3, E14 dates) but no link to the money trail.
- svc-reporting 312 bad_password (E03) = the stuck script Prakash mentioned 3 Jul (E13).
- Farah Dsouza's 31 Jul IMPORT of 12 bank changes (BULK-0731, with approval ref) and her 22 Jul export-and-delete: announced in E13, consistent.
- s.iyer's weekly Tuesday export: matches E02 (one per Tuesday).
- key-tb-03 (E17 indicator, "low"): zero use in E01/E18. Not part of the trail.
- Three older UI bank changes with no approval_ref (V-0298 9 Jun, V-0162 20 Jul, V-0128 4 Aug) are by Finance staff on the office network. A control gap, but a different pattern.
- Aditi's failed sign-ins 15 Aug from an unknown IP were stopped by MFA. Not confirmed as related.

## Open questions
- Where did the 12-14 Aug actor get key-tb-07 and tb-sync-svc? Inference: from TallyBridge (build/credential vault), not from H&F. Needs vendor logs.
- Who is behind 10.20.4.77? The label comes from the vendor (unverified, E15).
- Whether V-0412 is in the 8 Sep run (E18 shows scheduled payments but no vendor breakdown). **Hold that payment until the account is verified by call-back.**
- BlueVault clock offset (E05), blank source IPs on ~87 bvk-7f3a rows.
- 198.18.x is shared residential space; IPs alone do not identify a person.
