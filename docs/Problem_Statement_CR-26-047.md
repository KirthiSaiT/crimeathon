# Problem Statement – CR-26-047 (Tier 1) · Approach: DEFENSE

**Team:** ______  **Date:** 19 Nov 2026

## 1. What I believe happened
One outside actor, working from 198.18.7.0/24, used two leaked credentials: a TallyBridge LedgerOne key (`key-tb-07`) and a customer's BlueVault key (`bvk-7f3a`, pasted into ticket TKT-48213). It read vendor and payment data in August, then worked from TallyBridge's own build host `tb-build-02` (10.20.4.77). On 3 Sep at 01:44Z it changed the bank account of vendor V-0412 through the API, hidden inside the legitimate contact-detail sync that started on 1 Sep. The change was made five days before the 8 Sep payment run and carried no approval reference.

## 2. Evidence
- Leak: E13 (25 Jun, key pasted), E11 finding 2, E10 s5.1.
- HelpDeskr abuse: E02 (11–12 Aug, secret-keyword searches, TKT-48213 read, 10 export-and-delete cycles); E06 (14 export jobs in Aug vs 4 in Jul).
- Finance data read: E01 (12 Aug, vendor exports of 9,840 and 9,835 records from 198.18.7.41/.58).
- Files read: E05 (14–15 Aug, `bvk-7f3a` reading `/finance/bank-instructions/*` from 198.18.7.23/.24/.77); E04 (key has no IP restriction).
- Inside the vendor: E15 (10.20.4.77 = `tb-build-02`), E01 (17–19 Aug), E02 (18 Aug searches for "iban", "swift"), E20-B (16 Aug re-provisioning).
- Impact: E18 req-5f61b0de8 + E19 chg-8b9888c39b (V-0412 ****4417 to ****9083, API, no approval_ref).
- Vendor story contradicted: E16 vs E01, E05, E15, E04.

## 3. What I am unsure about
- Where the key was stolen. I infer TallyBridge, but the `tb-build-02` label is vendor-supplied (E15). Vendor logs would settle it.
- Whether V-0412 is in the 8 Sep run, and whether ****9083 belongs to the attacker. A bank call-back would settle it.
- The BlueVault clock offset (E05) and 87 blank source IPs. Residential 198.18.x addresses do not identify a person.

## 4. Other explanations considered
- *Legitimate 3.6.0 sync:* contact fields only (E20-C); bank-details PATCH came from a non-sync host (.77, not .11–.16), outside normal behaviour for that key.
- *Finance clean-up:* Finance bulk changes use IMPORT with a BULK ref (E19, 31 Jul) and UI; none use the API.
- *Former employee Rohan Menon:* one kiosk login (E03), zero API or file activity. Real gap, not on this trail.
- *Insider or Aditi's failed logins:* no linking events. Not ruled out, not supported.
- *Vendor's "metadata only" account (E16):* rejected, contradicted by E01 and E05.

## 5. The problem I chose
Trusted non-human credentials can change vendor bank details with no approval and nothing connects the signals across systems. I chose this over the governance backlog (E11) because it is the money at risk, it is time-critical, and it can be tested on the supplied logs.

## 6. The obvious approach, and why not
Obvious: rotate keys, add IP allowlists, and write per-system anomaly rules (volume spikes, odd user agents, geo-IP). Not taken because the decisive step used the *right* key, the *right* user agent and a private-link address, inside the normal sync window. Per-system rules see an ordinary sync call. Allowlists alone do not remove the ticket-leaked key.

**My idea:** score each integration write against that integration's own learned profile (source host, endpoint, field, time window, approval reference), then join it to signals from other systems (credential seen in a ticket, off-profile source on the same key elsewhere). Hold bank-detail changes without a valid approval reference before the payment run.

## 7. What would change my mind
Vendor logs showing 10.20.4.77 is a sanctioned sync node; an approval record for V-0412; or evidence that V-0412's new account belongs to the real vendor.

## 8. Approach
**Defense (locked).** I will report accuracy and false-alarm rate on the supplied data, including Finance's legitimate bulk changes and the daily sync.

## Evaluation notes (limits)
A profile built on one summer of data will miss an attacker who copies the sync pattern exactly and uses a sync node. It will also flag a real new integration until it is enrolled.
