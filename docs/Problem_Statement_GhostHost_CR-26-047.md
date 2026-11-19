# Problem Statement – CR-26-047 (Tier 1) · Approach: DEFENSE

**Team:** ______  **Date:** 19 Nov 2026

## 1. What I believe happened
One outside actor, working from 198.18.7.0/24, used two leaked non-human credentials (`key-tb-07` for LedgerOne, `tb-sync-svc` for HelpDeskr) plus a customer's BlueVault key pasted into TKT-48213. The actor then acted from 10.20.4.77, a host on TallyBridge's private link that is not one of the six sync nodes. On 3 Sep at 01:44Z it changed vendor V-0412's bank account through the API, five days before the 8 Sep payment run, with no approval reference.

## 2. Key findings and evidence
- Leak: E13 (25 Jun), E11 finding 2, E10 s5.1. Use of the pasted key: E05 (14–15 Aug, from 198.18.7.x; its normal source is 172.16.9.40).
- Secret hunting: E02 (11–12 Aug, 16 searches for "password", "bvk-", "private key"; TKT-48213 read; 10 export create/download/delete cycles). E06: 14 export jobs in Aug vs 4 in Jul.
- Finance data read: E01 (9 and 12 Aug, vendor exports of 9,840 and 9,835 records).
- **Unregistered host on the trusted link:** E15 shows 10.20.4.77 ("tb-build-02", label supplied by the vendor) active on 6 days against 97 for each sync node (.11–.16). E01 17–19 Aug: ~55 payment searches and bank-details dumps. E02 18 Aug: searches for "iban", "swift". E20-B: vendor "re-provisioning" on 16 Aug.
- Impact: E18 (3 Sep 01:41–01:44: GET vendor, GET bank-details, GET scheduled payments, PATCH bank-details from .77) and E19 chg-8b9888c39b (V-0412 ****4417 to ****9083, API, blank approval_ref). E04: `key-tb-07` has no IP limit, no expiry, read/write all modules.
- Vendor story contradicted: E16 says "nothing on the private link", "no finance or file access", "rotated 24 Aug", "closed". E15, E01, E05 and E04 each contradict one of these.

## 3. What I am unsure about
- Where the keys were stolen. I infer TallyBridge, but the host label is the vendor's own. Vendor logs would settle it.
- Whether 10.20.4.77 sent 10 flows to the LedgerOne sandbox on 9 Jul as an early foothold or as harmless 3.6.0 testing. A vendor change record would settle it.
- Whether V-0412 is in the 8 Sep run and whether ****9083 belongs to the attacker. A bank call-back would settle it.
- BlueVault clock offset (E05, unsynchronised) and 87 blank source IPs. 198.18.x is shared residential space, so addresses do not identify a person.

## 4. Other explanations considered
- *Legitimate 3.6.0 contact sync (E20-C):* ruled out for the bank change. The sync only touches contact fields from .11–.16; the PATCH came from .77 on a bank-details endpoint.
- *Finance clean-up:* ruled out. Finance bulk changes use IMPORT with a BULK ref (E19, 31 Jul) or the UI; none use the API.
- *Former employee Rohan Menon (E03, E14):* one kiosk login, no API or file activity. A real offboarding gap, not on this trail.
- *Insider (Aditi's failed sign-ins 15 Aug, E03):* same address as E05 reads, but shared IP space. Not supported, not ruled out.
- *Vendor's "metadata only" account (E16):* rejected, contradicted by E01, E05, E15.

## 5. The problem I chose
**A host nobody registered acted through the trusted vendor link, and every control trusted the link.** The private link, the right key and the right user agent made one bank-detail change look like routine sync traffic. I chose it over the stolen-key and governance angles because it is time-critical, is testable on the supplied logs, and tests the vendor's "nothing on the private link" claim with H&F's own records.

## 6. The obvious approach, and why not
Obvious: rotate keys, add IP allowlists, write per-system anomaly rules (volume, geo-IP, odd user agent). Not taken because the decisive call used the right key and a private-link address inside the sync window. An allowlist that includes 10.20.4.0/24 passes it, and per-system rules see one ordinary-looking call.

**My idea:** learn each key's established hosts, endpoint family and hours from a frozen baseline, then flag a host that is on the link but not established, an endpoint outside the family, and any bank-detail write without an approval reference. Hold those vendor changes before the payment run. Test the vendor's claims against the same logs. On the supplied data, a prototype caught all 203 labelled events with no false alarms, still held after renumbering hosts or shifting clocks by 2 hours, and missed 70 network flows when the actor rode a real sync node (API events were still caught).

## 7. What would change my mind
Vendor proof that 10.20.4.77 is a sanctioned node; an approval record for V-0412; a call-back showing ****9083 is the real vendor's account; or vendor logs showing the keys were taken from H&F, not TallyBridge.

## 8. Approach
**Defense (locked).** I will report correct detections, false alarms and misses on the supplied data and on varied copies, including Finance's legitimate bulk changes and the daily sync.

*Limits:* my attacker labels are my own attribution from IPs, so the clean prototype result shows consistency, not proof it generalises. A new legitimate node or a release change will raise false alarms until it is enrolled.
