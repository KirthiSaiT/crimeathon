# Key Guard: the best defensive solution (CR-26-047, team H4CK_077)

## 1. One line
Give every machine key a short life, a narrow job and a known place. Learn its habits, cut it off the moment it steps out of line, and put a second person and a phone call in front of any bank change.

## 2. What happened
| Date (UTC) | Step | Evidence |
|---|---|---|
| 9 Aug | Finance key `key-tb-07` used from a new home-internet address, 198.18.7.41 | E01 27064-27075 |
| 11 Aug | Help-desk key `tb-sync-svc` searches tickets for secrets, exports tickets, deletes the exports | E02 19776-19822 |
| 14 Aug | Storage key `bvk-7f3a` reads 38 finance files | E05 6483-6547 |
| 17 Aug | The vendor's build computer 10.20.4.77 uses the vendor link and the finance key | E15 8173-8450, E01 30454-31531 |
| 3 Sep | The finance key changes a supplier bank account (V-0412), no approval | E18 1088, E19 313 |
| 6 Sep | The finance key is still in use | E18 2263 |

Who did it is **unknown**. The address range 198.18.7.x is shared and names nobody.

## 3. The lesson that shapes the design
We replayed the controls one at a time against the 237 attacker events.

| Control, alone | Events blocked | Stops the bank change? |
|---|---|---|
| Address limit that includes the vendor link (what policy E10 2.1 asks for) | 46% | **No**, the build computer sits inside the allowed range |
| Exact address limit per key | 99.2% | Yes, but brittle: a new sync computer breaks the real service |
| Rotate a key found in a ticket within 7 days | 18.6% | No, two keys were held by the vendor and never in a ticket |
| Keys expire after 90 days | cannot be simulated | Cannot tell |
| Dual approval on payment runs | 0% | No, it covers the run, not changes to vendor records |
| Alert, then revoke the key within 1 day | 51.5% | Yes |
| Bank gate and call-back hold | stops the payout | Yes |

**No single control is enough, and the written policy alone would have failed.** So the best solution is layers, where each one covers what the one before it misses.

## 4. The design: seven layers

### Layer 1. Short-lived keys (key expiry and rotation)
- Sensitive keys (finance, bank details) are issued by a vault for hours or days. Others expire in 30 to 90 days.
- Replacing a key is automatic, so nobody pastes a secret into a ticket.
- Why: a stolen key then dies on its own. The leaked keys had no expiry. Honest note: the logs cannot prove expiry alone would have stopped this, so it is a supporting layer.

### Layer 2. Known place (address limit that learns)
- Each key is tied to its own computers, not to the whole vendor range.
- Key Guard **learns** the limit from behaviour and first uses it to alert, then enforces it, so a legitimate new sync computer raises an alert instead of breaking the service.
- Why: an exact limit blocks 99.2% in the simulation, a loose one only 46%.

### Layer 3. Narrow job (least privilege)
- Split read/write on all modules into separate rights. A **bank-details** right that no sync key holds by default.
- Storage keys see only the folders they use. `bvk-7f3a` reads every folder today.
- Why: stolen keys then cannot read or change what they never needed.

### Layer 4. Roles and sessions (people)
| Role | Can do |
|---|---|
| Viewer | See alerts, keys, timeline |
| Analyst | Upload logs, run the detector, quarantine a key |
| Approver | Release a held bank change |
| Vendor | No finance rights |
- Human sessions expire after inactivity. A fresh sign-in check is needed before a bank-detail change.
- Failed-login bursts lock the account. The 15 Aug burst on `a.kapoor` is a review item.
- Roles are enforced in the database (row-level security), not only on the page.
- Machine keys have no session, so layers 1 to 3 do that job for them.

### Layer 5. Watch (the detector)
1. Read every log and put all times on one clock (HelpDeskr is India time, BlueVault is epoch seconds on an unsynchronised clock).
2. Learn each key's usual computers and actions from the first half of the data, then **freeze** it.
3. Flag a new computer, an action the key never does, secret searches, export-then-delete, a folder never read, bank-detail reads, failed-login bursts.
4. Set aside ordinary activity and say why (3.6.0 nightly sync, announced maintenance, staff exports, a BULK import).

### Layer 6. Cut off (automatic containment)
- A critical alert puts the key into **read-only quarantine**. The nightly sync keeps working, writes stop.
- Why automatic: suspending at the first alert prevents 98.3% of events, after 1 hour 70.5%, after 1 day 51.5%, after 14 days 2%.

### Layer 7. Guard the money (the last line)
- A bank-account change needs a valid, unique, in-sequence approval reference, **two different people**, and a call-back to the number already on file.
- Anything else goes on a hold list before the next payment run.
- Why: it does not depend on spotting the attacker. The gate holds V-0412 (E19 line 313) and V-0233 (reference APR-1182 out of sequence, E19 line 243). The run was 4.9 days after the change.

## 5. How the layers meet the attack
| Attack step | What stops or reveals it |
|---|---|
| 9 Aug key used from 198.18.7.41 | Layer 2 refuses it, Layer 5 alerts, Layer 6 quarantines (first alert 24.9 days before the bank change) |
| 11 Aug secret hunt in tickets | Layer 5 alerts, ticket scanner revokes at once |
| 14 Aug storage key reads 38 finance files | Layer 3 denies the folders, Layer 5 alerts |
| 17 Aug vendor build computer joins | Layer 2 exact limit, Layer 5 alerts |
| 3 Sep bank account changed | Layer 3 withholds the right, Layer 7 holds it |
| 6 Sep key still works | Layer 1 expiry and Layer 6 quarantine |

## 6. Novelty
1. Each key is treated like a person with its own frozen habit profile.
2. The baseline is frozen **before** the incident, so the attacker cannot teach it to ignore them (111 caught instead of 237 if learned from all data).
3. One clock across LedgerOne, HelpDeskr, BlueVault and the vendor link.
4. The address limit **learns** from behaviour, so it is exact without breaking the service.
5. The final control sits at the money.
6. The defence is replayed, not just described, and shows the company's own policy would have failed.
7. Vendor statements become tests: six of eight claims are false, one unproven, one true.
8. It lists what it chose not to flag, and shows its own misses (60).

## 7. Evidence for the numbers
| Test | Caught | False alarms | Missed |
|---|---|---|---|
| Supplied logs | 237 | 0 | 0 |
| Vendor-link computers renumbered | 237 | 0 | 0 |
| Two clocks shifted two hours | 237 | 0 | 0 |
| Attacker on a real sync computer | 177 | 0 | 60 |
| Baseline learned from all data | 111 | 0 | 126 |

## 8. Rollout
| When | Do |
|---|---|
| Day 1 | Rotate the leaked keys and the vendor link. Turn on the bank-gate hold and call-back |
| Week 1 | Exact per-key addresses (alert first), split the rights, add the bank-details right |
| Week 2 | Feed all logs to Key Guard, freeze baselines |
| Week 3 | Automatic read-only quarantine, two-person rule on vendor records |
| Month 2 | Vault-issued short-lived keys, ticket secret scanning, session expiry and database roles |

## 9. What is built and what is designed
| Layer | Status |
|---|---|
| 5 Watch: detector, claim checker, key scoring, timeline, scorecard, simulator | **Built and tested** (32 tests) |
| 4 Roles and sessions | **Built**: five roles, permissions in the database, two-person rule, audit trail, 15-minute idle sign-out (`docs/RBAC.md`) |
| 1 Short-lived keys | **Built in a simulation**: keys that rotate on a timer an administrator sets, with a grace window (`docs/KEY_VAULT.md`). Real keys at the vendor: requests only |
| 2 Address limit | **Built in a simulation**: ranges per key, monitor then enforce, suggested from use. The case keys get a tightest-block advice computed from the logs |
| 3 Narrow job | **Built**: advice per case key from what it did, and a split action in the vault that makes one narrow key per job |
| 6 Cut off | **Built in a simulation**: a critical event quarantines or revokes the key automatically. Case keys get a quarantine request |
| 7 Guard the money | **Built**: a key never changes a bank account (the change is held), API changes always held, weak approval plus a changed contact held, two-person release, a payment-run view |
| Not built | Vault-issued keys for the real systems, a verified call-back number (the evidence has none), MFA before a bank change, the optional AI layer |

## 10. Limits
- Attacker labels are our own attribution, so a clean score shows consistency, not proof.
- An attacker on a real sync computer is still caught on API and ticket actions, but 60 bare network flows look normal.
- The simulation assumes a revoked key locks the attacker out, and each control is tested alone.
- Document facts (maintenance window, release 3.6.0, vendor claims) are configured in `context.json`.
- Nothing names a person.

## 11. The 90-second pitch
"A software key was left where it shouldn't be. For four weeks it was used to read finance data, and on 3 September it changed a supplier's bank account. Nothing watched the keys.

We tested each normal control one at a time. The company's own policy would not have stopped it, because the attacker later used the vendor's own computer. So we layered the defence: short-lived keys, an address limit that learns, narrow rights, roles and sessions for people, a detector that knows each key's habits, automatic read-only quarantine, and a hold with a call-back on any bank change.

Our first alert fires 24.9 days before the bank change. Suspending the key at that alert stops 98.3% of the attacker's events, and the bank gate stops the payment even if we miss everything else. We found no false alarms on the supplied logs, and we show our 60 misses. Who did it, the logs do not say."
