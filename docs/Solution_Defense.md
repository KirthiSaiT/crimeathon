# Key Guard: the defensive solution (CR-26-047, team H4CK_077)

## 1. The problem in one line

A stolen machine key (a password that software uses) could read finance data and change a supplier's bank account, and nothing connected the signals across systems or stopped the change before the payment run.

## 2. What happened (from the evidence)

| Date (UTC) | Step | Evidence |
|---|---|---|
| 9 Aug | Finance key `key-tb-07` first used from a new home-internet address, 198.18.7.41 | E01 27064-27075 |
| 11 Aug | Help-desk key `tb-sync-svc` searches tickets for secrets, exports tickets, deletes the exports | E02 19776-19822 |
| 14 Aug | Storage key `bvk-7f3a` reads 38 finance files | E05 6483-6547 |
| 17 Aug | The vendor's build computer 10.20.4.77 starts using the vendor link and the finance key | E15 8173-8450, E01 30454-31531 |
| 3 Sep | The finance key changes a supplier bank account (V-0412) with no approval | E18 1088, E19 313 |
| 6 Sep | The finance key is still in use | E18 2263 |

Who did it is **unknown**. The address 198.18.7.x is a shared pool and names nobody.

## 3. The solution: four layers

| Layer | Question it answers | Module | Built |
|---|---|---|---|
| Prevent | Is every key limited and expiring? | Key policy scorer | Scores and ranks. Does not change a key |
| Detect | Is a key acting out of character? | Loaders, baseline, detector | Yes |
| Contain | Can the money still move? | Bank gate, hold list | Yes (holds). Key suspension is simulated |
| Prove | Is what the vendor says true? | Claim checker, timeline, scorecard | Yes |

### How the detector works (plain words)
1. **Read** every log and put all times on one clock (UTC). HelpDeskr writes India time. BlueVault writes epoch seconds on a clock that was never synchronised.
2. **Learn** what each key normally does (its usual computers and actions) from the first half of the data, then **freeze** it.
3. **Flag** a key that: comes from a new computer; does something it never does; searches tickets for secrets; exports then deletes; reads a folder it never reads; reads supplier bank details; has a burst of failed logins.
4. **Set aside** ordinary activity and say why: the nightly contact sync after release 3.6.0, announced maintenance, staff exports, a bulk import with a BULK reference.
5. **Gate the bank**: a bank-account change needs a unique approval reference in sequence. Otherwise it goes on a hold list for a call-back before the next payment run.

## 4. Simulation (run it: `npm run simulate`, or open **Simulation** in the app)

The simulator replays the 237 attacker events in time order against the frozen baseline. It answers three questions.

**When would the defense have fired?** The first alert comes on 9 Aug 03:12, 24.9 days before the bank change. The secret hunt, the finance-file reads and the vendor build computer each fire 16 to 22 days before it. The bank gate fires on the change itself and leaves 4.9 days before the 8 Sep payment run.

**How fast must the response be?** Alert, then a person revokes the key after the delay shown.

| Revoke after | Attacker events prevented | Bank change |
|---|---|---|
| At the first alert | 233 of 237 (98.3%) | stopped |
| 1 hour | 167 (70.5%) | stopped |
| 1 day | 122 (51.5%) | stopped |
| 7 days | 61 (25.7%) | stopped |
| 30 days | 0 | **not stopped** |

Per key, with suspension at the first alert: finance key 80 of 81 events refused, help-desk key 51 of 52, storage key 43 of 44, vendor-link host 59 of 60. A one-day delay lets most of the help-desk and storage activity through, because the attacker works in short bursts.

**Which single controls would have stopped the bank change?** Each tested alone.

| Control | Attacker events blocked | Stops the bank change? |
|---|---|---|
| Address limit that includes the vendor link (what policy E10 section 2.1 asks for) | 109 (46%) | **No**: the build computer is inside the allowed range |
| Exact address limit per key | 235 (99.2%) | Yes, but brittle: a new sync computer breaks the real service |
| Rotate a key found in a ticket within 7 days | 44 (18.6%) | No: the two vendor-held keys were never in a ticket |
| Keys expire after 90 days | cannot be simulated | Cannot tell: depends on when the keys were taken |
| Dual approval on payment runs | 0 | No: it covers the run, not vendor-record changes |
| Detector alert, then revoke within 1 day | 122 (51.5%) | Yes |
| Bank gate and call-back hold | 0 (stops the payout, not the access) | Yes |

**What this tells us.** The company's own written policy, applied perfectly, would not have stopped the bank change. A per-key limit learned from behaviour would have, and Key Guard learns it automatically and uses it to alert instead of breaking the service. Reading alerts the next day is not enough. Fast suspension changes the outcome, and the bank gate is the last line.

### Accuracy tests (`npm run analyze`, 109,061 events)

| Test | Caught | False alarms | Missed |
|---|---|---|---|
| Supplied logs | 237 | 0 | 0 |
| Vendor-link computers renumbered | 237 | 0 | 0 |
| Two clocks shifted two hours | 237 | 0 | 0 |
| Attacker on a real sync computer | 177 | 0 | 60 |
| Baseline learned from all data | 111 | 0 | 126 |

## 5. The novelty

Anomaly detection on logs is not new. What is new here is the combination, each part aimed at a gap in this case:

1. **The key is treated as a person.** Each machine key gets its own frozen profile (computers, actions, folders). The case shows keys with no address limit or expiry, so the key's behaviour is the only signal left.
2. **The baseline is frozen before the incident.** A baseline learned from all data teaches itself to ignore the attacker (111 caught instead of 237, shown in the scorecard).
3. **One clock across systems.** The attack crosses LedgerOne, HelpDeskr, BlueVault and the vendor link, each with its own time format. Joined on one clock, the 9 Aug to 3 Sep chain appears as one story.
4. **The control sits at the money.** The bank gate does not depend on spotting the attacker. It stops the one change that turns a data leak into a loss.
5. **Vendor statements become tests.** "Closed on 12 Aug" is checked against the logs. Of eight claims, six are false, one is unproven and one is true.
6. **An ordinary-activity ledger.** The tool lists what it chose not to flag and why, so an analyst can disagree.
7. **The defense is replayed, not just described.** A counterfactual simulator tests each control alone and shows that the policy as written (an address limit that includes the vendor link) would not have stopped the change, while a learned per-key limit would.
8. **Honest evaluation.** It is tested on altered copies (renumbered computers, shifted clocks, attacker on a real sync computer) and shows its 60 misses.

## 6. How to implement it in the company

| Step | Action | Owner | Time |
|---|---|---|---|
| 1 | Rotate the three leaked keys and `vendor-link`; give each an expiry and an address limit | Platform team | Day 1 |
| 2 | Turn on the bank gate: no payment to a changed account without a call-back and an approval reference | Finance | Day 1 |
| 3 | Feed LedgerOne, HelpDeskr, BlueVault, sign-in and vendor-link logs to Key Guard nightly | Security | Week 1 |
| 4 | Freeze a baseline per key; review the ordinary list monthly | Security | Week 2 |
| 5 | Wire suspend-or-quarantine to critical alerts; start with read-only mode so the nightly sync keeps working | Platform team | Week 3 |
| 6 | Keep secrets out of tickets; scan ticket text for key patterns | Support | Month 2 |

## 7. Limits (say these out loud)

- The attacker labels are our own attribution. A clean score shows the rules agree with that reading, not that they generalise.
- An attacker on a real sync computer is still caught on API and ticket actions, but 60 bare network flows look normal.
- Suspension is **simulated**. The app scores and recommends. It does not change a key or a payment.
- Document facts (maintenance window, release 3.6.0, vendor claims) are configured in `context.json`, not read from PDFs.
- Supabase is designed (`supabase/migrations/`) but not connected.
- The simulation assumes a revoked key locks the attacker out and cannot be re-issued with the same secret, and that the alarm event itself is let through. Each control is tested alone.
- Nothing names a person.
