# Role-based access control

Access in Warden is decided by the database, not by the page. Each role is a row set in `role_permissions`, every row-level-security policy asks for a **permission** (`private.has_permission('...')`), and the pages only mirror what the database already allows.

## Roles and permissions

| Permission | Viewer | Analyst | Approver | Admin | Vendor |
|---|---|---|---|---|---|
| Read the case data (`view_case`) | yes | yes | yes | yes | no |
| Save a detector run (`save_run`) | | yes | | | |
| Record a decision on an alert (`review_alert`) | | yes | | | |
| Request a key action (`request_key_action`) | | yes | | | |
| Close a key action request (`resolve_key_action`) | | | yes | | |
| Ask for a held bank change to be released (`request_release`) | | yes | | | |
| Release a held bank change (`release_hold`) | | | yes | | |
| Read the audit log (`view_audit`) | | yes | yes | yes | |
| Assign roles (`manage_roles`) | | | | yes | |
| Change the two-person rule (`manage_settings`) | | | | yes | |

## Separation of duties

- **The person who asks is not the person who approves.** An analyst requests a release; an approver releases it. With the two-person rule on (the default), the database refuses a release that has no request from someone else.
- **The administrator manages access, not money.** An admin cannot release a hold. An approver cannot assign roles.
- **Nobody changes their own role.** A trigger refuses it, and column-level privileges let a signed-in user update only `profiles.role`.
- **A vendor account sees nothing.** It can sign in, but it has no `view_case`, so the tables return no rows and the analysis API answers 403.

## Where each rule is enforced

| Rule | Enforced by |
|---|---|
| Who can read or write each table | RLS policies calling `private.has_permission` (`supabase/migrations/20261120000002_rbac.sql`) |
| Release needs a request from someone else | the `approvers release holds` insert policy |
| No self-promotion | `private.audit_role_change` trigger |
| Audit trail of releases, requests, reviews, key actions, role and setting changes | triggers writing `audit_log` |
| Vendor cannot read the case data through the API | `authorizeCase()` in `src/lib/supabase/server.ts`, called by `/api/analysis` |
| Idle sign-out after 15 minutes | `RoleProvider` (client). This is a convenience, not a security boundary: the database still checks every request. |

## Bootstrapping

The first account ever created becomes the administrator; everyone after is a viewer. The administrator assigns roles on the **Access** page.

## Signed-out visitors

By default a visitor who is not signed in can read the case data and nothing else, so the app can be demonstrated without an account. Set `REQUIRE_SIGN_IN=true` to require sign-in for the analysis API too.

## Not covered

- Failed-login lockout and password rules are Supabase Auth settings (rate limits, minimum length), not code in this app.
- Inactivity timeouts enforced by the server are a paid Supabase feature; the 15-minute idle sign-out here runs in the browser.
- A Supabase project administrator can bypass all of this with the service role. Keep that key out of the app and rotate any that has been shared.
