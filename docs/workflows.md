# Role Application and Verification Workflows

Status: **proposed, awaiting review**. Implements PRD §4 and §5. Each RPC runs in one transaction: it checks the caller, validates the transition, makes the change, writes the audit row, and enqueues notifications.

## Role applications

| Step | Actor | Operation | Effect |
| --- | --- | --- | --- |
| Apply | Signed-in user | `submit_role_application(role, details)` | Validated per role (BD-17). Creates `pending`. Grants nothing. Notifies Super Admin |
| Withdraw | Applicant | `withdraw_role_application(id)` | `pending -> withdrawn` |
| Reject | Super Admin | `reject_role_application(id, reason)` | Reason is required. Notifies applicant |
| Approve | Super Admin | `approve_role_application(id, options)` | See below. Notifies applicant |
| Suspend / restore / revoke | Super Admin | `set_role_status(user_role, status, reason)` | Account and other roles are untouched; history kept |

**Effects of approval, by role:**

| Role | In the same transaction |
| --- | --- |
| Seller | Activate role. Create the `sellers` row as `unverified` from the application. Create a referral code if the programme is on |
| Seller Staff | Activate role only. **No seller access** until a membership exists |
| Admin | Activate role. Apply the permission list given by the Super Admin (may be empty, which grants nothing) |
| Marketer | Activate role. Create the referral code; the URL is derived from it |

**Seller Staff has two independent gates**, which can complete in either order. Access needs both:

```
Super Admin approves application  --> user_roles: seller_staff active  --+
                                                                         +--> access
Seller invites -> user accepts -> seller assigns permissions  -----------+
   (seller_staff_memberships active + seller_staff_permissions)
```

The application's "seller they intend to work with" (§4.3) is informational only and gives no access.

**Manual marketer creation (§3.8):** a Super Admin-only server operation creates or finds the account, activates the role and creates the code, without an application row. The audit row records this.

## Manual seller verification

| Step | Actor | Operation | Effect |
| --- | --- | --- | --- |
| Normal attempt | Seller | Provider flow | Result from a signed provider callback. Success sets `provider_verified` |
| Request | Seller | `request_manual_verification(note)` | Available once normal verification failed or is unavailable. Status `pending`. The note is written text only for now |
| Review | Super Admin | `admin_list_seller_verification`, `admin_verification_history` | Seller details, the note and previous decisions |
| Approve | Super Admin | `decide_manual_verification(id, approve)` | Status `manually_verified`; reviewer and timestamp recorded |
| Reject | Super Admin | `decide_manual_verification(id, reject, reason)` | Reason is required. Status `rejected` |
| Verify directly / suspend / restore / revoke | Super Admin | `set_verification_status(seller, action, reason)` | Reason required. Suspending or revoking brings back the label and the allowance. Restoring returns the status it had before |

Rules:

- The check for this is `has_active_role('super_admin')`, not a grantable permission, so no Admin can be given it.
- `provider_verified` and `manually_verified` remain distinct everywhere, including history.
- Verification changes only verification. Seller suspension and publishing restrictions are checked separately in `publish_product`, so a verified but suspended seller stays blocked (§5.5).
- Super Admin can verify a seller who has not asked, giving a reason (BD-16). An open request must be approved or rejected instead, so it is never left open.
- When the provider feature is off or absent, "unavailable" is true, so manual verification is the available route. This means the platform can launch before a provider is chosen.

## Unverified publishing

The check and the write happen together inside `publish_product`:

1. `SELECT ... FOR UPDATE` on the seller row. Concurrent publishes for that seller run one at a time.
2. Run the eligibility rules in [domain-model.md](domain-model.md).
3. If there is no ledger row for this product, insert one.
4. Set `status = 'published'` and `first_published_at` if empty.
5. Write the audit row, recording the actor and on-behalf seller if applicable, and enqueue cache invalidation.

| Situation | Result |
| --- | --- |
| Draft saved | No ledger row, nothing counted |
| First publish, under the allowance | Ledger row, one slot used |
| Edit of a published product | Doesn't go through the ledger; nothing counted (Q-03) |
| Unpublish, then republish | Ledger row exists, nothing counted |
| Delete a published product | Soft-delete; the ledger row stays, and the slot stays used |
| Delete and create again | New product, so it uses a new slot; blocked if none are left |
| Allowance lowered below current count | Existing listings stay; new publications are blocked |
| Verified seller later loses verification | All earlier ledger rows count; existing listings stay and get the label |
| Admin publishes on behalf | Counts for the seller; owner and actor are both recorded |
| Super Admin override | Allows the publication; the ledger row is still written |
