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
