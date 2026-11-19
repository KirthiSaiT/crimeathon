# Key vault: keys that replace themselves

A simulation of how short-lived keys work, built so the defence in `docs/Best_Solution.md` (layer 1, short-lived keys, and layer 6, quarantine) can be shown working instead of described.

Three made-up systems stand in for the ones in the case: **LedgerOne** (finance), **HelpDeskr** (tickets) and **BlueVault** (documents). They hold invented data inside the database. Nothing here touches a real system.

## What an administrator can do (Key vault page)
- **Create a key** for a system, choosing exactly which actions it may perform (least privilege) and how often it rotates, from 1 minute to 24 hours.
- **Set the timing** of an existing key: rotation time, grace window, and whether it rotates automatically or simply stops working when its time is up.
- **Rotate now**, **show the current secret** (each reveal is logged), or **revoke** a key for good.
- **Quarantine** a key (analysts and approvers can too): it keeps reading but every write is refused.

## How rotation works
1. A key has a secret, a rotation time (for example 5 minutes) and a grace window (for example 15 seconds).
2. A database job runs every 15 seconds and replaces the secret of every key whose time is up. A call to the API also checks first, so a key is never used past its time.
3. The previous secret keeps working for the grace window, so a legitimate client can pick up the new one without an outage. After that it is refused with "rotated out".
4. If automatic rotation is off, the key just expires and is refused.
5. Only a hash of each secret is stored in the table clients can read. The secret itself sits in a private table that the API does not expose and is shown to an administrator only on request.

## The simulated API
`POST /api/sim/{ledgerone|helpdeskr|bluevault}` with `Authorization: Bearer <secret>` and a body such as `{"action": "vendors.read", "params": {}}`.

| System | Actions |
|---|---|
| LedgerOne | `vendors.read`, `vendors.bank.read`, `vendors.bank.write` |
| HelpDeskr | `tickets.read`, `tickets.write` |
| BlueVault | `files.list`, `files.read` |

Answers: `200` accepted, `401` unknown key, rotated out, expired or revoked, `403` outside the key's scope or a write by a quarantined key. Every call, accepted or refused, is written to the activity log.

## What the demo shows
- A key stolen and used **after** its rotation is refused: the same failure the real attack avoided because the real keys never rotated.
- A key allowed to read cannot change a bank account, which is the least-privilege point.
- A quarantined key still reads but cannot write: the read-only containment from the solution.
- Every use, including refused ones, is logged, which is the kind of log the detector reads.

## Guarding the money, step by step

### 1. Address limit: only the right network can use a key
- Each key has a list of allowed ranges (for example `10.20.4.0/27`) and a mode: **off**, **monitor** (a call from elsewhere is allowed but flagged) or **enforce** (it is refused).
- **Suggest from use** reads the addresses a key has actually been used from and proposes them, so the range comes from behaviour.
- The address comes from the network. For the demo the Try-a-key console lets the caller declare it with an `X-Source-IP` header, so the limits can be shown working. That header is honoured only outside production, or when `ALLOW_DECLARED_SOURCE=true`; otherwise only the forwarded address counts. A declared address would defeat a limit in real use.

### 2. Cut off on a critical event
- A call from outside the allowed range (enforce), an action outside the key's permissions, a write by a quarantined key, and any attempt to change a bank account are **critical**.
- On a critical event the vault acts on the key as its owner chose: **quarantine** (read only, the default), **revoke**, or only record it. The cut-off is itself logged, with the reason.
- A quarantined key keeps reading, so the service carries on, but every write is refused.

### 3. Narrow, split jobs
- **Split** looks at what a key actually did and makes one key for the reads and one for each separate write, with the same timer and address range. A bank-account change is never included. The broad key is revoked afterwards if you choose.
- On the Keys page each key from the case logs shows what it was allowed, what it did, a narrow scope and the tightest address block around its computers, worked out from the logs. For the finance key that is four actions from six computers, `10.20.4.0/27`, which leaves the vendor build computer `10.20.4.77` outside, where the loose `10.20.4.0/24` range lets it in.

### 4. Guard the money
- In the simulated LedgerOne a key can **ask** to change a bank account but never makes the change. It is stored as a held request.
- The **Payment run** page shows what the next run (the 8th and 23rd) will pay and what is blocked until released, and lists the changes the vault is holding. One person requests the release and a different person approves it, with a call-back note.
- On the case data, a change made through the API is always held, even with an approval reference, and a weakly approved change is held when the supplier's phone or email changed in the 14 days before it. Where the contact changed first but the change is well approved, it is only tagged, so the supplied logs still hold exactly the two suspicious changes.

### 5. The attack replay
One click on the Key vault page runs the attack against two fresh keys and shows each defence firing:
1. The real sync computer reads vendors: accepted.
2. The same key, stolen, is used from a home-internet address: refused, and the key is cut off.
3. The real computer can still read: the quarantine keeps the service up.
4. A second key with the loose vendor range lets the build computer in: the lesson from the policy.
5. It tries to change a bank account: held, not applied, and the key is cut off.
6. It tries again: refused, quarantined.
The supplier's account is unchanged at the end, and the held change waits on the Payment run page.

### What the numbers say (from the case logs, each control alone)
| Control | Attacker events blocked | Stops the bank change |
|---|---|---|
| Address limit that includes the vendor link (the written policy) | 46% | No |
| Exact address limit per key | 99.2% | Yes |
| Tightest address block around each key's computers | 99.2% | Yes |
| Narrow each key to the actions it used | 73% | Yes |
| Detector alert, revoke within 1 day | 51.5% | Yes |
| All layers together (block, narrow actions, revoke in 1 day, bank gate) | 100% (237 of 237) | Yes |

## Who may do what
| Permission | Who |
|---|---|
| `manage_keys`: create, rotate, time, show secret, revoke | Administrator |
| `quarantine_key`: quarantine and release | Administrator, analyst, approver |
| Read the key list and activity (not secrets or hashes) | Anyone who can read the case |

All of this is enforced in the database: the functions check the permission themselves, and the secret columns cannot be read by the API.

## Limits, stated plainly
- This is a **simulation**. The "systems" are tables; no real software consumes these keys.
- Secrets are stored in plain text in a private table so an administrator can retrieve the current one. A real deployment would use a hardware-backed vault and deliver new secrets to the consumer directly.
- The simulated API is open to anyone holding a secret, as a real API is. Supabase's security checker reports that function (`sim_api`) as callable without signing in; that is intended, and it checks the secret before doing anything.
- The rotation timer has 15-second resolution, and the shortest rotation time is 1 minute.
- The vault's log is separate from the evidence logs. Feeding it to the detector is a next step.
- The "no verified call-back number" gap is real: the evidence holds no phone numbers, only that a phone or email changed. The rules use the change, not the number.
- A narrow scope is built from observed use, so a rare legitimate action could look unused. Use monitor mode first.
