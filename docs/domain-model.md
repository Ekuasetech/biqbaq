# Domain Model

Status: **proposed, awaiting review**. This describes concepts and their rules; tables are in [database-design.md](database-design.md).

## Core relationships

```
User (one account)
 |- has many RoleAssignments (active / suspended / revoked)
 |    '- has many PermissionGrants (explicit, per assignment)
 |- has many RoleApplications (pending / approved / rejected / withdrawn)
 |- owns one Seller (Q-08)
 |- has many StaffMemberships -> Seller (with seller-specific permissions)
 |- has at most one ReferralAttribution as the person referred
 '- has Favourites, Reviews, Conversations

Seller
 |- has verification status, with VerificationRequests and history
 |- has Products, VehicleListings, StaffMemberships, PaymentAccount
 '- has a ReferralCode

Product -> ProductImages, PublicationLedger entry, Reviews, Favourites
VehicleListing -> CargoOpportunity, images
Conversation -> Buyer + Seller, optional Product or VehicleListing -> Messages
Order -> Product(s), Seller, Buyer -> PaymentTransactions
```

## Key distinctions

| These are separate | Because |
| --- | --- |
| **Application vs assignment** | Applying never grants anything (§3.1). Only an approved application creates an assignment |
| **Seller role vs seller verification** | Approval lets you act as a seller; verification is identity (§4.3) |
| **Platform role vs staff membership** | Seller Staff needs both (§3.6). The role alone reaches no seller's data |
| **Role vs seller suspension** | A suspended shop stops selling while the user keeps their roles. Suspending or removing the Seller role also suspends the shop automatically (Q-31) |
| **Product owner vs actor** | On-behalf actions keep both (§3.4) |
| **Marketer vs seller referrals** | Reported separately (§14.5), and both use one attribution rule |

## Roles

| Role | How it becomes active | Permissions come from |
| --- | --- | --- |
| Buyer | Automatically at registration (not in the §4.1 application list) | Role defaults |
| Seller | Application + Super Admin approval | Role defaults, scoped to their own seller |
| Seller Staff | Seller invites, person accepts, seller approves (Q-32) | Membership permissions only |
| Marketer | Application + approval, or manual creation by Super Admin | Role defaults, own statistics only |
| Admin | Application or nomination + approval | **None by default**: explicit grants only |
| Co-admin | See Q-01 | **None by default**: explicit grants only |
| Super Admin | Controlled bootstrap (Q-02), never by application | All permissions |

Visitors have no account and can use public reads and the anonymous contact form.

## State machines

Each transition below is the only allowed one, enforced in the database function that performs it.

**Role application** (§4.4)
```
pending -> approved | rejected | withdrawn
```
All three outcomes are final. Reapplying creates a new record (BD-18).

**Role assignment** (§4.6)
```
active <-> suspended
active | suspended -> revoked
```

**Seller verification** (§5.5)
```
unverified | rejected | expired -> pending -> provider_verified | manually_verified | rejected
provider_verified | manually_verified -> suspended | expired
suspended -> the previous verified status, or rejected
```
`expired` is used only if a provider or policy has an expiry.

**Product** (§7.1)
```
draft -> published (through publish_product only)
published <-> unpublished
published | unpublished -> archived
any except draft -> suspended (moderators only)
suspended -> unpublished (moderators only)
```
No admin approval is needed before publishing (BD-10).

**Blog post** (§11.3)
```
draft -> pending_review -> approved -> published -> archived
pending_review -> rejected | changes_requested
changes_requested -> pending_review
```
Admin posts skip review. A seller's significant edit to a published post creates a revision for review while the approved version stays live (BD-15).

**Payment account** (§13.3): `disabled`, `onboarding_incomplete`, `verification_pending`, `restricted`, `enabled`, `suspended`. `enabled` is set only from a provider's confirmation.

**Background job:** `queued -> running -> succeeded | failed -> queued (retry) | dead`.

## Publication eligibility

`publish_product` allows publication only if **all** of these are true:

1. The caller is the seller's owner, or an admin with `products.publish_on_behalf`. Staff with `products.publish` may too, and are recorded as the actor, with the seller as owner.
2. Global seller publishing is on, and the seller's own publishing is not suspended.
3. Publishing for the seller's class (verified or unverified) is on.
4. The product is complete: it has a name, description and category. A price of $0 is allowed (Q-23).
5. If the seller is verified: allowed.
6. If unverified: the product already has a ledger entry, **or** the seller's ledger count is below the configured allowance, **or** a Super Admin override applies.

The first successful publication writes one ledger row per product. The ledger is never deleted, which is what makes the allowance cumulative: republishing an old product costs nothing, and a re-created product is a new product that costs a new slot.
