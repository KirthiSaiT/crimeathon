# Ticket secret scanner

The leak in the case: a customer, asked to paste their config so support could check it, pasted it into ticket TKT-48213, and the config held the storage key `bvk-7f3a` (E13 messages 1 to 3; a comment is logged on that ticket at E02 line 6411, 21 minutes after it was created at line 6395). It stayed there for weeks. The scanner stops that at the moment of pasting.

## What it does
Every ticket and every **comment** (the leak was in a comment, not in the new ticket) goes through a scan inside the database before anything is saved:
1. **Scan.** Patterns for the secrets that matter: a storage key like `bvk-…`, the vault's own `wk_…` keys, private-key blocks, `password=` or `api_key=` style lines, bearer tokens, JWTs, cloud and service keys, and credentials inside a link. Ordinary text, IDs such as `key-tb-07`, hashes and the word "token" on its own are not blocked.
2. **Verify.** A pasted `wk_…` secret is hashed and compared with the live keys in the vault. A pattern only suggests a secret; a hash match proves it.
3. **Cut off.** A confirmed live vault key is **rotated at once**, and its old secret stops working immediately (there is no grace window for a leaked key).
4. **Refuse.** The ticket or comment is **not saved**. The person sees which kinds of secret were found, with a short redacted preview such as `bvk-7f…`, and is told to use the vault instead.
5. **Alert.** An alert is recorded for administrators: who, when, where, what it looked like, and which key was rotated. It appears on the Activity page and as a count beside Activity in the sidebar. The audit log records it too.
6. **Override.** An administrator may raise it anyway with a written reason, and then the secret is **masked** in what is stored (`[secret removed]`). The override is logged and alerts as well.

The secret itself is never written anywhere: not in the ticket, not in the alert, not in the audit log.

## Why it runs in the database
The page only asks; the database decides. A changed page or a direct call cannot skip the scan, and a viewer cannot override it.

## Who may do what
| Permission | Who |
|---|---|
| Raise tickets and comment | Viewer, analyst, approver, administrator (not vendor) |
| See and review secret alerts | Administrator |
| Raise a ticket anyway, with the secret masked | Administrator |

## What it tested (rolled-back, in the database)
A normal ticket saves. The case comment with `bvk-7f3a`, a `password=` line, a private-key header, a JWT and a connection string with credentials are all refused. A vault-shaped key that is not real is refused but nothing is rotated. A **real** vault key pasted into a comment is refused, the key is rotated, and its old secret answers 401 straight away. A viewer cannot override or see alerts, an override with a reason saves the comment masked, a too-short reason is still refused, and none of the saved text contains a secret.

## Limits, stated plainly
- A pattern check misses what it does not recognise: a secret that is split across lines, encoded, typed out in words, or sitting in a screenshot or attachment. It also has false positives and needs tuning.
- The secret was already typed into the person's browser. Refusing the ticket stops it being stored, but a leaked key should still be replaced; for vault keys that happens automatically, for other keys it does not.
- Only the vault can prove a pasted key is live. For the case's `bvk-` key the scanner recognises the shape only.
- Alerts are in the app only. Email or chat notification needs a mail service and is not built.
- Existing tickets are not scanned. The case's ticket had held its secret for weeks; a scan of old tickets is a separate step.
- The help desk here is a simulation with made-up tickets. The case's real HelpDeskr log (E02) holds no ticket text, so the scanner is shown on tickets raised in the app, not on the case data.
