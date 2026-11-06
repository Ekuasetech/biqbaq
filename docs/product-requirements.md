BIQBAQ
Product Requirements Document (PRD)
Project: Biqbaq Marketplace
Document version: 1.1
Status: Initial requirements baseline
Prepared for: Claude Code implementation
Primary markets: Canada and Nigeria
Applications: Web and Mobile

1. Project Overview
1.1 Product Description
Biqbaq is a digital marketplace designed to connect Nigerians in Canada and Nigeria.
The platform will allow sellers, emerging businesses and entrepreneurs to register, create product listings and reach customers in both countries.
It will also provide a vehicle shipping and shared cargo opportunity feature through which Nigerian car dealers in Canada can advertise vehicles they intend to ship to Nigeria. Other Nigerians can discover these opportunities, contact the dealers and arrange to include goods in the vehicles.
Biqbaq will provide:
* Public product marketplace.
* Seller registration and management dashboards.
* Seller staff management.
* Product and vehicle/cargo listings.
* Buyer-seller communication.
* Anonymous seller contact through email.
* Seller-specific public product API endpoints for independent seller websites.
* Blog publishing and moderation.
* Platform-wide advertising.
* Seller payment gateway integration.
* Marketer referral tracking.
* Administrative dashboards.
* Super Admin-controlled role applications and approvals.
* Manual seller identity verification.
* React Native mobile application.
* Immigration, employment, exchange-rate and weather information integrations.
1.2 Product Vision
To build a trusted marketplace that helps Nigerians discover products, connect with sellers, access useful opportunities and conduct business across Canada and Nigeria.
1.3 Product Objectives
1. Allow sellers to create accounts and publish products.
2. Give emerging sellers access to a marketplace.
3. Allow customers to discover and contact sellers.
4. Allow selected sellers to receive online payments directly through connected payment accounts.
5. Allow car dealers to publish vehicle shipping and shared cargo opportunities.
6. Give marketers a measurable referral programme.
7. Allow sellers to distribute their Biqbaq product listings through their independently managed websites.
8. Give Super Admin comprehensive control over platform functionality.
9. Provide a consistent experience across web and mobile.
10. Support English and French.
11. Allow users to apply for additional platform roles, subject to Super Admin approval.
12. Provide a manual seller verification process when normal identity verification cannot be completed.

2. Scope
2.1 Applications
Biqbaq will consist of two frontend applications sharing one backend.
Web application
* Framework: Next.js
* Language: TypeScript
* Routing: Next.js App Router
* UI: Tailwind CSS and shadcn/ui
* Authentication and database: Supabase
* Image management: Cloudinary
Mobile application
* Framework: React Native
* Recommended development environment: Expo
* Language: TypeScript
* Backend: The same Supabase project used by the web application.
Both applications must share the same business rules, authorization rules, database and platform configuration.
2.2 In Scope
1. Authentication and user management.
2. Role-based access control.
3. Role applications and approval.
4. Seller registration and dashboards.
5. Seller staff management.
6. Product catalogue and marketplace.
7. Vehicle shipping and shared cargo listings.
8. Buyer-seller messaging.
9. Anonymous seller contact through email.
10. Seller-specific public product API.
11. Blog publishing and moderation.
12. Platform-wide advertisement management.
13. Seller payment gateway management.
14. Marketer management and referral analytics.
15. Seller referral tracking.
16. Reviews and favourites.
17. Automated and manual identity verification.
18. Platform configuration.
19. Email and SMS notification management.
20. English and French localization.
21. Dark and light themes.
22. Cloudinary media management.
23. Canadian employment information.
24. Express Entry and immigration updates.
25. Exchange-rate information.
26. Weather information.
27. Background processing and scheduled tasks.
28. Audit logging and administrative reporting.
2.3 Explicitly Out of Scope
Designing, building, hosting or managing independent seller websites.
Biqbaq will only provide a seller-specific public API endpoint through which an independently developed seller website can retrieve that seller's published products.
When a visitor clicks a product displayed on an independent seller website, the visitor must be redirected to the corresponding canonical Biqbaq product detail page.
Do not build a seller website builder, seller website hosting system, seller website themes or website management dashboard.

3. User Roles and Permissions
3.1 General Role Management Principles
Biqbaq must support multiple roles for one user account.
A user must not need to create separate accounts to become a buyer, seller, marketer or another approved platform user.
Users may request additional roles through their account dashboard.
However, requesting a role does not grant that role.
All role applications covered by this requirement must be approved by Super Admin before the requested role becomes active.
The system must distinguish:
* Requested roles.
* Pending role applications.
* Approved active roles.
* Rejected applications.
* Suspended or revoked roles.
Role activation must be controlled by backend authorization logic.
The frontend must never grant permissions simply because a user has submitted an application.
3.2 Super Admin
Super Admin is the highest-authority platform role.
Responsibilities:
* Manage the entire platform.
* Create and manage administrators.
* Manage co-admin permissions.
* Manage sellers and buyers.
* Review and approve role applications.
* Manually approve seller identity verification.
* Approve or reject manual verification requests.
* Configure platform-wide settings.
* Enable and disable platform features.
* Enable and disable seller publishing.
* Configure unverified seller publishing limits.
* Manage identity verification providers.
* Manage payment gateway availability.
* Enable payment gateways for individual sellers.
* Manage advertisements.
* Publish and manage blogs.
* Approve or reject seller blog submissions.
* Create and approve marketers.
* View referral analytics.
* Manage email and SMS integrations.
* Configure image upload limits.
* View audit logs.
* Manage external integrations.
Super Admin privileges must be protected against modification or promotion by ordinary administrators.
3.3 Admin
Admin handles day-to-day platform operations.
Depending on assigned permissions, Admin may:
* Manage sellers.
* Review seller accounts.
* Suspend or restore seller publishing.
* Moderate listings.
* Manage user accounts.
* View platform reports.
* Manage vehicle listings.
* Perform delegated administrative activities.
Admin must not automatically receive every Super Admin permission.
Admin role activation requires Super Admin approval.
Super Admin must explicitly assign administrative permissions.
3.4 Co-admin
Co-admin receives permissions delegated by Admin, subject to platform authorization rules.
One specifically required capability is the ability to publish products on behalf of any seller when authorized.
Examples of permissions:
* products.create_on_behalf
* products.edit_on_behalf
* products.publish_on_behalf
* products.moderate
* sellers.manage
* users.manage
* vehicle_listings.moderate
Every action performed on behalf of a seller must be recorded in the audit log.
The system must preserve the distinction between the product owner and the person who performed the action.
3.5 Seller
Sellers can:
* Manage their accounts.
* Create and manage product listings.
* Upload product images.
* Manage product availability.
* View public listings.
* Communicate with customers.
* View customer conversations.
* Manage seller staff.
* Configure staff permissions.
* View referral statistics.
* Manage their contact email.
* Submit blog posts when seller blogging is enabled.
* View payment onboarding status.
* Manage their connected payment account through the supported provider workflow.
* Request manual identity verification if normal verification cannot be completed.
Seller role activation requires Super Admin approval.
3.6 Seller Staff
Seller Staff are associated with a specific seller and receive permissions from that seller.
A user may apply for Seller Staff status, but the application alone does not provide access to any seller's resources.
The following conditions are mandatory:
1. The user must have the required Super Admin role approval.
2. A seller must invite or authorize the staff member.
3. The seller must assign the staff member to their seller account.
4. The seller must grant the appropriate permissions.
Seller staff can receive permissions such as:
* Create products.
* Edit products.
* Delete products.
* Publish products.
* View customer conversations.
* Respond to customers.
* Manage orders.
* View analytics.
* Manage other staff, if authorized.
Staff must not access another seller's products, customers, messages or payment information.
3.7 Buyer / Customer
Buyers can:
* Browse products.
* Browse vehicle/cargo opportunities.
* View product details.
* Favourite products.
* Contact sellers.
* Participate in conversations when authenticated.
* Purchase products where online payments are enabled.
* Submit reviews where permitted.
* Share product links.
Visitors must also be able to browse public listings without registration.
3.8 Marketer
Marketers are platform-approved referral partners.
Marketer accounts must be manually created by Super Admin or approved by Super Admin following an application.
Marketers receive:
* A unique referral code.
* A unique referral URL.
* Access to their dedicated marketer dashboard.
* Referral signup analytics.
Marketers must not automatically receive seller or administrative permissions.
3.9 Multiple Roles Per User
The system must support a user having multiple active roles.
Example:
User: John
Active roles:
* Buyer.
* Seller.
* Marketer.
Pending applications:
* Admin.
Each role must have its own permissions and access boundaries.
A user may switch between their available role dashboards without creating separate accounts.
The application must check the user's active roles and permissions on the backend.

4. Role Applications and Approval Management
4.1 Objective
Visitors and registered users must be able to request additional platform roles.
Available role applications:
* Seller.
* Seller Staff.
* Admin.
* Marketer.
A visitor must register or authenticate before submitting a role application.
Super Admin must approve every role application before the requested role becomes active.
4.2 Role Application Workflow
1. User registers or logs into Biqbaq.
2. User opens the role application section in their account dashboard.
3. User selects the role they want to apply for.
4. Biqbaq displays the information required for that role.
5. User submits the application.
6. Application enters pending status.
7. Super Admin receives an administrative notification.
8. Super Admin reviews the application.
9. Super Admin approves or rejects the application.
10. Biqbaq notifies the applicant of the decision.
11. If approved, the role is added to the user's active roles.
12. The appropriate dashboard becomes available according to the user's permissions.
4.3 Application Requirements by Role
Seller application
Collect relevant seller information, including:
* Seller or business name.
* Contact information.
* Country.
* Business description.
* Seller category.
* Other information required by platform policy.
Approval does not automatically mean identity verification is complete.
Seller verification and seller role approval are separate processes.
Seller Staff application
Collect:
* Applicant information.
* Seller they intend to work with.
* Relevant invitation or authorization reference.
A seller must explicitly authorize the staff relationship and assign permissions.
Super Admin approval alone must not grant access to seller resources.
Admin application
Admin access must be tightly controlled.
Super Admin must:
* Review the application or nomination.
* Approve or reject it.
* Assign the specific administrative permissions.
* Activate the Admin role.
An approved Admin must not receive Super Admin privileges.
Marketer application
Collect relevant applicant information.
After approval:
* Activate the Marketer role.
* Generate a unique referral code.
* Generate a referral URL.
* Grant access to the marketer dashboard.
Super Admin may also create marketer accounts manually without requiring a public application.
4.4 Application Statuses
Role applications must support:
* pending
* approved
* rejected
* withdrawn
The system should record:
* Applicant ID.
* Requested role.
* Application information.
* Submission date.
* Reviewing Super Admin ID.
* Decision.
* Decision date.
* Rejection reason, where applicable.
* Application history.
4.5 Super Admin Role Application Dashboard
Provide a dedicated dashboard section:
Administration → Role Applications
Features:
* View pending applications.
* Filter by requested role.
* View applicant details.
* Review application history.
* Approve applications.
* Reject applications.
* Provide rejection reasons.
* View approved and rejected applications.
* Search applications.
All approval and rejection actions must be audited.
4.6 Role Suspension and Revocation
Super Admin must be able to suspend or revoke approved roles where justified.
When a role is suspended:
* The user must lose the permissions associated with that role.
* Historical data must remain intact.
* The user must retain other independently approved roles where appropriate.
* The action must be recorded in the audit log.
* The user should receive a notification where appropriate.
Revoking a role must not delete the user account.

5. Authentication and Identity Verification
5.1 Authentication
Use Supabase Auth.
Required functionality:
* User registration.
* Login and logout.
* Email verification.
* Password reset.
* Secure session management.
* Protected dashboard routes.
* Role-based access.
* Account suspension and deactivation.
Support web and mobile authentication.
5.2 Seller Identity Verification
The platform must support identity verification through a configured provider.
Super Admin must be able to:
* Enable or disable identity verification.
* Configure verification requirements.
* Select a supported verification provider.
* Review verification status.
* Approve or reject manual verification requests.
* Manually approve a seller who cannot complete the normal verification process.
* Suspend or revoke verification where justified.
A manual verification workflow must be available as an alternative to provider-based verification.
5.3 Manual Seller Verification
Super Admin must be able to manually approve the identity verification of any seller who cannot complete the normal verification process.
The seller must have an option to request manual verification when normal verification is unsuccessful or unavailable.
Workflow:
1. Seller attempts the normal verification process.
2. Seller cannot complete the process or encounters an eligible verification problem.
3. Seller submits a manual verification request.
4. The request appears in the Super Admin dashboard.
5. Super Admin reviews the seller's information and any submitted supporting evidence.
6. Super Admin approves or rejects the request.
7. The seller receives the decision notification.
8. If approved, the seller's verification status is updated.
5.4 Super Admin Manual Verification Controls
Super Admin must be able to:
* View pending manual verification requests.
* View seller information.
* Review supporting documents or evidence references.
* Approve verification manually.
* Reject verification.
* Provide a reason for rejection.
* View previous verification decisions.
* Revoke or suspend verification where justified.
* View the reviewer and decision timestamp.
5.5 Verification Statuses
Support appropriate statuses, including:
* unverified
* pending
* provider_verified
* manually_verified
* rejected
* suspended
* expired, if applicable.
Manual verification must be distinguishable from provider-based verification.
The system must record:
* Seller ID.
* Verification method.
* Reviewing Super Admin ID, where manually reviewed.
* Decision.
* Reason.
* Supporting evidence reference, where applicable.
* Decision timestamp.
Manual verification must not automatically bypass seller suspension, publishing restrictions or other platform controls.
Sensitive verification documents must be stored securely with restricted access.

6. Seller Publishing Rules
6.1 Unverified Sellers
An unverified seller may publish a maximum of two different products in total.
This is a cumulative publication allowance, not a maximum of two currently active listings.
Rules:
1. Draft products do not count.
2. A product counts when successfully published for the first time.
3. Editing an already-published product does not count again.
4. Deleting a published product does not restore the allowance.
5. Deleting and recreating a product must not bypass the restriction.
6. Super Admin can configure the maximum allowance.
7. The initial default must be two products.
8. Once exhausted, further publishing is blocked until the seller satisfies the applicable verification requirements or receives an authorized override.
The backend must enforce this rule transactionally.
6.2 Unverified Seller Label
Products belonging to unverified sellers must display:
Unverified Seller
6.3 Publishing Controls
Super Admin must be able to configure:
* Global seller publishing on/off.
* Unverified seller publishing on/off.
* Maximum unverified product publication count.
* Verified seller publishing on/off.
* Identity verification requirement.
* Admin approval requirement.
* Admin publishing on behalf of sellers.
Admin may manage seller publishing where authorized.
Disabling publishing must not delete existing product records.

7. Product Marketplace
7.1 Product Management
Sellers must be able to create products with:
* Product name.
* Product description.
* Category.
* Subcategory where applicable.
* Price.
* Currency.
* Product images.
* Availability.
* Product condition where applicable.
* Relevant attributes.
* Publication status.
* Creation and update timestamps.
Product statuses:
* Draft.
* Published.
* Unpublished.
* Archived.
* Suspended.
7.2 Product Detail Page
Every public product must have a canonical Biqbaq product detail page.
The page should contain:
* Product image gallery.
* Product name.
* Description.
* Price and currency.
* Availability.
* Seller name.
* Seller verification status.
* Seller information.
* Customer reviews and ratings.
* Favourite action.
* Contact Seller action.
* Social sharing.
* Related products.
Support sharing through WhatsApp, Facebook, copy link and native Web Share API where supported.
7.3 Reviews
Support product reviews and ratings.
Where possible, distinguish verified-purchase reviews from other feedback.
Super Admin must be able to enable or disable reviews.
7.4 Favourites
Authenticated buyers should be able to save and remove favourite products.
Super Admin must be able to enable or disable favourites.

8. Vehicle Shipping and Shared Cargo
The platform must support Nigerian car dealers in Canada who advertise vehicles they intend to ship to Nigeria.
Other Nigerians can discover these opportunities and contact dealers to arrange transportation of goods in those vehicles.
Listing information should support:
* Vehicle make.
* Vehicle model.
* Year.
* Vehicle images.
* Origin location.
* Destination.
* Estimated shipping/departure date.
* Available cargo capacity.
* Cargo restrictions.
* Dealer contact information.
* Listing status.
Users should be able to discover these listings and contact dealers.
Open decision: Whether dealers will also advertise vehicles for sale has not yet been confirmed.

9. Messaging and Seller Contact
9.1 Authenticated Buyer-Seller Messaging
Authenticated users must be able to communicate with sellers through Biqbaq.
Sellers must have a messaging inbox.
Features:
* Conversation list.
* Unread message counts.
* Message history.
* Send and receive messages.
* Listing context.
* Conversation status.
* Archive conversations.
* Notifications.
Use Supabase Realtime for live message delivery and PostgreSQL for durable message storage.
Only conversation participants should access conversations.
Administrative access to private messages must be restricted and audited.
9.2 Anonymous Contact Seller
Visitors must be able to send an email to sellers without creating a Biqbaq account.
Use Resend for this functionality.
Do not use FormSubmit.
A contact form should be available on public product detail pages.
Required fields:
* Visitor name.
* Visitor email.
* Subject.
* Message.
* Product reference, populated automatically.
When submitted:
1. Validate the form.
2. Identify the product and seller.
3. Confirm the seller's contact email is verified.
4. Send the enquiry through Resend.
5. Set the visitor's email as Reply-To.
6. Notify the visitor of success or failure.
Implement validation, message-length limits, rate limiting and spam protection.
Do not expose private seller email addresses in the frontend or public API.
9.3 Seller Contact Email Verification
Before a seller can publish products with the contact feature enabled, their contact email must be verified.
Workflow:
1. Seller enters their contact email.
2. Biqbaq sends a verification email using Resend.
3. Seller clicks a secure verification link.
4. Backend validates the token.
5. Contact email is marked verified.
6. Publishing with Contact Seller functionality becomes available.
Verification must be repeated when the contact email changes.
This is separate from Biqbaq login email verification.

10. Seller-Specific Public Product API
10.1 Objective
Sellers may have independently developed websites.
Biqbaq must provide a public API endpoint that allows each seller's external website to retrieve that seller's publicly published products.
Biqbaq must not build, design, host or manage these independent websites.
10.2 Endpoint
Recommended endpoint:
GET /api/v1/sellers/{sellerSlug}/products
Example:
https://biqbaq.com/api/v1/sellers/abc-store/products
10.3 API Response
Return public seller and product information:
* Product ID.
* Product name.
* Product slug.
* Description.
* Price.
* Currency.
* Product image URLs.
* Availability.
* Category.
* Canonical Biqbaq product URL.
10.4 API Behaviour
* Return only publicly published products.
* Exclude suspended or unpublished products.
* Exclude private seller information.
* Support pagination.
* Support appropriate filters and sorting.
* Apply rate limiting.
* Support caching.
* Invalidate or refresh cached data after product changes.
* Provide stable product IDs.
* Use API versioning.
The public read endpoint should not require a private seller API key.
10.5 Product Click-Through
Every product returned by the API must contain its canonical Biqbaq product URL.
Visitors clicking products displayed on independent seller websites must be redirected to the corresponding Biqbaq single-product page.

11. Blog Module
11.1 General Requirements
Biqbaq must have a public blog section.
Super Admin can:
* Create blog posts.
* Edit blog posts.
* Publish blog posts.
* Schedule publication.
* Archive posts.
* Manage categories and tags.
11.2 Seller Blogging
Super Admin must be able to enable or disable seller blog publishing.
Seller blogging should be disabled by default.
When enabled, sellers may create and submit posts for review.
11.3 Mandatory Approval
All seller-created blog posts must be approved by Super Admin before public publication.
Workflow:
draft → pending_review → approved → published
Additional statuses:
* Rejected.
* Changes requested.
* Archived.
Seller posts must never become publicly visible simply because they have been submitted.
Significant edits to published seller articles should require approval before the revised version is republished.
11.4 Blog Content
Support:
* Title.
* Slug.
* Excerpt.
* Body content.
* Cover image.
* Author.
* Categories.
* Tags.
* SEO title.
* SEO description.
* Publication date.
* Last updated date.
* Moderation status.

12. Advertisement Management
Super Admin must be able to create and manage advertisements displayed across the frontend.
Features:
* Create and edit advertisements.
* Upload advertisement images.
* Add destination URLs.
* Activate and deactivate.
* Schedule advertisements.
* Set start and end dates.
* Configure display priority.
* Select placements.
* Preview advertisements.
* Delete advertisements.
Support:
* Global banner.
* Header placement.
* Homepage placement.
* Product listing placement.
* Sidebar placement.
* Mobile-specific placement.
Advertisements marked for all pages must be eligible across the public frontend, subject to status and scheduling.
Implement appropriate frequency controls.

13. Payment Gateway Management
13.1 Objective
Super Admin must be able to enable online payments for individual sellers.
Once enabled and the seller completes provider onboarding, customers can pay for the seller's products.
The intended arrangement is that sellers receive payments through their connected payment-provider accounts.
13.2 Super Admin Controls
* Enable online payments for a specific seller.
* Disable payments for a specific seller.
* Select an eligible provider.
* View onboarding status.
* View connected-account status.
* View payment eligibility.
* Configure platform payment settings.
* View payment references and statuses.
13.3 Seller Payment Onboarding
A seller must complete provider onboarding.
Payment-enabled status must only be granted when the provider confirms eligibility to accept payments and receive payouts.
Support statuses:
* Payments disabled.
* Onboarding incomplete.
* Verification pending.
* Account restricted.
* Payment enabled.
* Payment suspended.
13.4 Payment Processing
Required:
* Secure checkout.
* Server-side payment initialization.
* Payment webhooks.
* Payment verification.
* Order creation.
* Transaction history.
* Refund handling.
* Chargeback handling.
* Idempotency protection.
* Seller-specific payment eligibility.
Store payment records in Supabase.
Never expose payment-provider secrets in web or mobile applications.
13.5 Provider Architecture
Implement a provider-independent payment module.
Stripe Connect, Paystack and Flutterwave may be evaluated, subject to country eligibility, provider terms, currencies and direct-settlement capabilities.
The commission model remains undecided. Support configurable commission rules without assuming a fixed percentage or fee.

14. Marketer Management and Referral Tracking
14.1 Marketer Account Creation
Only Super Admin can approve marketer participation.
Super Admin can:
* Create marketer accounts manually.
* Review marketer applications.
* Approve applications.
* Reject applications.
* Suspend marketers.
* Restore marketers.
* Deactivate marketers.
Marketer applications must also follow the centralized role application workflow.
14.2 Unique Referral Codes
Each approved marketer receives:
* Unique referral code.
* Unique referral URL.
Example:
https://biqbaq.com/register?ref=JOHN2026
14.3 Referral Attribution
When a visitor opens a referral URL, Biqbaq captures the referral code and preserves it through registration.
On successful registration, referral attribution is recorded.
Requirements:
* Attribute each signup only once.
* Prevent self-referrals.
* Prevent duplicate attribution.
* Store marketer ID.
* Store referred user ID.
* Store registration timestamp.
* Protect records against unauthorized modification.
* Count completed registrations, not just link clicks.
Referral attribution window and precedence remain to be defined.
14.4 Marketer Dashboard
Display:
* Total signups.
* Today's signups.
* This week's signups.
* This month's signups.
* Referral code.
* Referral URL.
* Copy link action.
* Signup history.
* Referral activity.
Marketers may only see their own statistics.
14.5 Seller Referral Programme
Sellers should also receive unique referral codes.
Seller referral reporting must be separate from marketer reporting.
Display:
* Total registrations attributed to the seller.
* Referral activity.
* Registration dates.
* Permitted referral status information.

15. Seller Staff Management
Sellers must be able to invite staff to assist with their accounts.
The seller should be able to:
* Invite staff.
* Authorize staff membership.
* Revoke staff access.
* Assign permissions.
* Modify permissions.
* View staff members.
A staff member must have both an approved platform role and an active seller-specific membership.
Permissions must be enforced by the backend.
Staff must not access another seller's information.

16. Platform Configuration
Super Admin must have a dedicated Platform Configuration dashboard.
Settings must be stored in the database, not hardcoded throughout the application.
16.1 Feature Toggles
Super Admin can enable or disable:
* Seller publishing.
* Unverified seller publishing.
* Seller blog publishing.
* Seller blog approval requirements.
* Product reviews.
* Product favourites.
* Referral programme.
* Email notifications.
* SMS notifications.
* Identity verification.
* Payment functionality.
* External integrations.
16.2 Publishing Configuration
Configurable:
* Maximum unverified seller publishing allowance.
* Seller publishing enabled/disabled.
* Verified seller publishing enabled/disabled.
* Admin approval requirements.
* Admin publishing permissions.
Initial unverified seller limit: two unique products published cumulatively.
16.3 Media Configuration
Super Admin can configure maximum permitted image upload size.
Initial default: 1 MB per image.
Apply to:
* Product images.
* Vehicle images.
* Blog images.
* Advertisement images.
* Seller logos.
* Profile images.
Enforce the limit on both frontend and backend.
Also configure allowed image formats, maximum dimensions and applicable image-count limits.
16.4 Configuration Audit History
Record:
* Administrator ID.
* Setting name.
* Previous value.
* New value.
* Timestamp.
* Relevant reason.
Only authorized administrators may modify settings.

17. Media Management
Use Cloudinary for image uploads and delivery.
Supabase should store image metadata rather than duplicate image files unnecessarily.
Metadata should include:
* Image ID.
* Related entity ID.
* Cloudinary public ID.
* Secure image URL.
* Alt text.
* Display order.
* Primary image indicator.
* Creation timestamp.
Upload workflow:
1. User selects image.
2. Frontend checks format and size.
3. Backend validates file.
4. Backend authorizes secure Cloudinary upload.
5. Cloudinary receives image.
6. Supabase stores metadata.
Use signed uploads and secure ownership validation.
Never expose Cloudinary API secrets in client applications.

18. Email and Notifications
18.1 Email Provider
Use Resend as the primary email provider.
Use it for:
* Account verification.
* Password resets.
* Seller contact email verification.
* Anonymous customer enquiries.
* Blog approval notifications.
* Seller notifications.
* Marketer notifications.
* Role application notifications.
* Manual verification notifications.
* Order notifications.
* Administrative notifications.
Do not use FormSubmit.
All email sending must go through a shared email service abstraction.
18.2 Email Configuration
Super Admin must be able to enable or disable email notifications.
Implement:
* Delivery failure handling.
* Retry policies.
* Logging.
* Rate limiting.
* Template management.
* Notification preferences where applicable.
18.3 SMS
Support SMS through a configurable provider.
Super Admin must be able to enable or disable SMS notifications.
The provider remains to be selected.

19. Localization and User Interface
19.1 Languages
Initial languages:
* English.
* French.
Use next-intl or an appropriate equivalent for the web application.
The mobile application must support the same languages.
Translate:
* Navigation.
* Buttons.
* Forms.
* Validation messages.
* Dashboard labels.
* Notifications.
* Email templates.
* Common platform content.
Seller-created product descriptions should not be automatically translated unless approved as a future feature.
19.2 Themes
Support:
* Light mode.
* Dark mode.
Users should be able to switch themes and retain their preferences.
19.3 Responsive Design
The web application must work across desktop, tablet and mobile browsers.
The React Native application must provide an appropriate native mobile experience.

20. External Integrations
20.1 Canadian Employment Information
Provide a feature for discovering Canadian employment opportunities.
Investigate appropriate permitted sources, including Canada Job Bank access and eligibility requirements.
The display approach remains undecided:
* Display jobs inside Biqbaq.
* Display summaries with links to original postings.
* Both.
20.2 Express Entry Updates
Provide an immigration information section focused on Canadian Express Entry.
Support:
* Draw dates.
* CRS cutoff scores.
* Invitations issued.
* Draw categories.
* Historical information.
* Official source links.
* Last-updated timestamps.
Use official IRCC information and approved public sources.
Do not assume an undocumented public API exists.
Present information as general information, not legal or immigration advice.
20.3 Exchange Rates
Provide relevant exchange-rate information.
Display currency pair, rate, source and last-updated date.
Explain that indicative rates are not necessarily bank or remittance rates.
20.4 Weather
Provide weather information using an appropriate source with acceptable usage terms.
20.5 Integration Principles
* Keep integrations modular.
* Support configuration.
* Log failures.
* Cache appropriate responses.
* Display source and update time.
* Avoid excessive API calls.
* Handle provider outages gracefully.
* Do not promise free services will remain free indefinitely.

21. Background Processing
Background processing is required for:
* Email delivery.
* Notifications.
* Scheduled advertisements.
* Scheduled blog publication.
* External data ingestion.
* Retryable integration calls.
* Cleanup tasks.
* Analytics aggregation.
Do not introduce Redis and BullMQ into the MVP by default.
Evaluate a PostgreSQL-backed queue or managed job-processing solution.
Supabase Queues/PGMQ may be evaluated, subject to maturity and production suitability.
A worker or consumer must actually process queued tasks.
Support retries, failure tracking, idempotency, job status and monitoring.
Keep the queue implementation replaceable.

22. Technical Architecture
22.1 Architectural Style
Use a Modular Monolith.
Do not introduce microservices for the initial release.
Business logic must live in clearly defined modules, not be scattered across UI components and route handlers.
22.2 Recommended Stack
Area	Technology
Web frontend	Next.js
Programming language	TypeScript
Mobile application	React Native
Mobile tooling	Expo
Database	Supabase PostgreSQL
Authentication	Supabase Auth
Realtime	Supabase Realtime
Media	Cloudinary
Styling	Tailwind CSS
UI components	shadcn/ui
Validation	Zod
Web localization	next-intl
Email	Resend
Payments	Provider-independent integration
Testing	Vitest and Playwright
AI development assistant	Claude Code
22.3 Repository Structure
biqbaq/
├── apps/
│   ├── web/
│   └── mobile/
├── packages/
│   ├── shared-types/
│   ├── validation/
│   ├── domain-contracts/
│   └── api-client/
├── supabase/
│   ├── migrations/
│   ├── functions/
│   ├── seed/
│   └── tests/
├── docs/
│   ├── product-requirements.md
│   ├── system-architecture.md
│   ├── domain-model.md
│   ├── database-design.md
│   ├── module-boundaries.md
│   ├── security-architecture.md
│   ├── api-specification.md
│   ├── implementation-roadmap.md
│   └── decisions/
├── CLAUDE.md
├── package.json
└── README.md
22.4 Suggested Domain Modules
modules/
├── identity/
├── role-management/
├── authorization/
├── seller-management/
├── staff-management/
├── product-catalog/
├── vehicle-marketplace/
├── cargo-management/
├── messaging/
├── seller-contact/
├── email-verification/
├── public-store-api/
├── blog/
├── advertising/
├── payment-management/
├── orders/
├── marketer-management/
├── referral-tracking/
├── reviews/
├── favourites/
├── notifications/
├── verification/
├── administration/
├── platform-configuration/
├── media-management/
├── integrations/
├── immigration-updates/
├── analytics/
├── background-jobs/
└── audit/
The role-management module must own role applications and approval workflows.
The verification module must own seller verification workflows, including manual verification.
Avoid unnecessary abstractions and folder structures.

23. Database and Data Security
Use Supabase PostgreSQL.
The database design must support multiple roles per user.
Important domain entities are expected to include:
* Users.
* User roles.
* Role applications.
* Permissions.
* Role permission assignments.
* Seller profiles.
* Seller staff memberships.
* Seller invitations.
* Products.
* Product images.
* Product publication history.
* Vehicle listings.
* Cargo opportunities.
* Conversations.
* Messages.
* Seller contact email verification records.
* Blog posts.
* Blog moderation history.
* Advertisements.
* Payment provider accounts.
* Payment transactions.
* Orders.
* Marketers.
* Marketer referral codes.
* Referral attribution records.
* Seller referral codes.
* Reviews.
* Favourites.
* Platform settings.
* Verification requests.
* Verification history.
* Notification records.
* Background jobs.
* Audit logs.
This is a domain-level entity list, not the final database schema.
23.1 Multiple Roles per User
Do not implement roles as a single role column on the user profile.
Use a relationship-based design that allows a user to have multiple active roles.
The design should distinguish:
* Role definitions.
* User role assignments.
* Role application records.
* Role permission assignments.
* Seller-specific staff memberships.
* Seller-specific permissions.
Pending applications must not be treated as active role assignments.
23.2 Supabase Row Level Security
RLS is mandatory for protected tables.
Requirements:
* Buyers cannot access private seller data.
* Sellers can manage only their own records.
* Seller staff can access only resources permitted by their seller membership.
* Co-admins can perform only delegated operations.
* Marketers can only view their own referral statistics.
* Admin permissions must be checked securely.
* Conversation participants can only access their conversations.
* Payment information must be appropriately restricted.
* Verification documents must have restricted access.
* Public product endpoints must return only approved public fields.
Never expose the Supabase service-role key to browser or mobile clients.
Use trusted server-side operations for privileged tasks.
23.3 Audit Logging
Record sensitive operations, including:
* Role applications.
* Role approvals and rejections.
* Role suspensions and revocations.
* Role and permission changes.
* Seller verification decisions.
* Manual seller verification approvals.
* Seller suspension and restoration.
* Publishing overrides.
* Product actions performed on behalf of sellers.
* Blog approvals and rejections.
* Payment gateway enablement and disablement.
* Platform configuration changes.
* Marketer approval and suspension.
* Administrative access to sensitive operations.
Audit records must identify the actor, action, target, reason where applicable and timestamp.

24. Non-Functional Requirements
24.1 Security
* Secure authentication.
* RLS on protected Supabase tables.
* Server-side authorization.
* Input validation.
* Rate limiting.
* Secure file uploads.
* Secret management.
* Payment webhook verification.
* Audit logging.
* Protection against common web vulnerabilities.
* No sensitive credentials in client-side code.
* Secure verification document access.
24.2 Performance
* Paginated product listings.
* Optimized images.
* Appropriate database indexes.
* API caching.
* Efficient Supabase queries.
* Lazy loading where appropriate.
* Responsive frontend performance.
24.3 Reliability
* Graceful external API failure handling.
* Background job retries.
* Idempotent payment processing.
* Error logging.
* Monitoring.
* Safe database migrations.
24.4 Maintainability
* Strict TypeScript.
* Clear module boundaries.
* Reusable validation.
* Documented APIs.
* Consistent naming.
* Automated testing.
* Database migrations under version control.
24.5 Accessibility
Use semantic elements, keyboard navigation, appropriate contrast, accessible form labels, clear error messages and alternative text for images.

25. Testing Requirements
Claude Code must implement tests alongside features.
25.1 Unit Tests
Test:
* Publishing eligibility.
* Unverified seller publication allowance.
* Role and permission checks.
* Multiple roles per user.
* Role application status transitions.
* Super Admin role approval.
* Seller Staff authorization.
* Manual seller verification.
* Referral attribution.
* Product visibility.
* Blog moderation.
* Payment eligibility.
* Configuration validation.
* Seller contact validation.
25.2 Integration Tests
Test:
* Supabase authentication.
* Database access.
* RLS policies.
* Role assignment.
* Role application approval.
* Seller staff membership.
* Manual verification records.
* Cloudinary upload authorization.
* Resend email integration.
* Public seller product API.
* Payment provider callbacks.
* Background jobs.
25.3 End-to-End Tests
Important user journeys:
1. Buyer registers and browses products.
2. User applies to become a seller.
3. Super Admin approves the seller application.
4. Seller publishes a product.
5. Unverified seller publishes two unique products and is blocked from publishing another.
6. Seller cannot complete normal identity verification and requests manual verification.
7. Super Admin manually approves the seller's verification.
8. Seller's verification status changes appropriately.
9. Seller verifies their contact email.
10. Anonymous visitor contacts a seller.
11. Seller receives the enquiry through Resend.
12. Seller manages a buyer conversation.
13. User applies to become Seller Staff.
14. Super Admin approves the role application.
15. Seller authorizes the staff membership and assigns permissions.
16. Staff member accesses only the authorized seller's resources.
17. User applies to become an Admin.
18. Super Admin approves the application and assigns limited permissions.
19. Super Admin approves a marketer application.
20. Marketer receives a referral link.
21. Visitor registers using that referral link.
22. Marketer sees the signup in their dashboard.
23. Seller submits a blog post.
24. Super Admin approves the blog post.
25. Super Admin enables seller payments.
26. Seller completes payment-provider onboarding.
27. Customer completes a payment.
28. Seller's published product appears through the public seller API.
29. Clicking the API-provided product URL opens the canonical Biqbaq product page.
30. Super Admin creates an advertisement that appears on eligible pages.

26. Implementation Roadmap
Development must be incremental.
Do not ask Claude Code to build the entire marketplace in one prompt.
Phase 1: Project Foundation
* Repository setup.
* Next.js application.
* React Native application foundation.
* Supabase setup.
* Environment configuration.
* Shared TypeScript packages.
* Validation setup.
* Database migration workflow.
* Initial design system.
Phase 2: Identity, Roles and Authorization
* User registration.
* Login.
* Email verification.
* Role definitions.
* Multiple roles per user.
* Role application workflow.
* Super Admin.
* Admin.
* Co-admin.
* Seller.
* Buyer.
* Seller Staff.
* Marketer.
* Approval dashboard.
* Permission management.
* Protected dashboards.
Phase 3: Seller and Product Marketplace
* Seller registration.
* Seller dashboard.
* Product management.
* Product images.
* Publishing restrictions.
* Seller verification.
* Manual seller verification.
* Public marketplace.
* Product detail pages.
* Search and categories.
Phase 4: Communication
* Seller contact email verification.
* Anonymous seller contact through Resend.
* Buyer-seller messaging.
* Seller inbox.
* Notifications.
Phase 5: Public Seller Product API
* Seller-specific public endpoints.
* API response contracts.
* Product pagination.
* Product filtering.
* Canonical product URLs.
* Caching and invalidation.
* API documentation.
Phase 6: Blog and Advertising
* Blog management.
* Seller blog submissions.
* Super Admin approval.
* Advertisement management.
* Global advertisement placements.
* Scheduling.
Phase 7: Payment Integration
* Payment provider abstraction.
* Seller payment onboarding.
* Super Admin seller-specific payment controls.
* Checkout.
* Payment webhooks.
* Orders.
* Transaction history.
Phase 8: Marketing and Referrals
* Marketer management.
* Manual account creation.
* Marketer applications and approval.
* Referral codes.
* Referral attribution.
* Marketer dashboard.
* Seller referral dashboard.
Phase 9: Vehicle and Cargo Marketplace
* Vehicle listing management.
* Shared cargo opportunities.
* Search and filtering.
* Dealer communication.
Phase 10: Integrations and Platform Settings
* Email configuration.
* SMS integration.
* Identity verification integration.
* Express Entry information.
* Canadian job information.
* Exchange rates.
* Weather.
* Platform feature toggles.
* Configurable image upload limits.
* Audit dashboard.
Phase 11: Mobile Application
Implement the React Native application using the established backend and shared business contracts.
Prioritize authentication, product discovery, product details, seller functionality, messaging and notifications.
Phase 12: Hardening and Launch
* Security review.
* RLS review.
* Role and permission testing.
* Verification workflow testing.
* Payment testing.
* Performance testing.
* Accessibility testing.
* Backup and recovery planning.
* Monitoring.
* Production deployment.
* Documentation.

27. Outstanding Product Decisions
The following matters have not yet been finalized. Claude Code must not silently invent decisions.
ID	Outstanding decision	Status
BD-01	Whether dealers also list vehicles for sale	Unconfirmed
BD-02	Payment commission model	Unconfirmed
BD-03	Whether customers pay online, contact sellers externally, or both	Requires detailed checkout policy
BD-04	Chat attachment support	Unconfirmed
BD-05	Separate vehicle/product conversations or unified inbox	Unconfirmed
BD-06	Canadian job information display approach	Unconfirmed
BD-07	Express Entry draws only or broader IRCC updates	Unconfirmed
BD-08	Seller staff granular permissions, predefined roles, or both	Final design pending
BD-09	Exact co-admin permissions and delegation rules	Final design pending
BD-10	Product publishing approval requirements	Unconfirmed
BD-11	Referral attribution window and precedence	Unconfirmed
BD-12	Payment providers and seller-country eligibility	Requires evaluation
BD-13	SMS provider	Unconfirmed
BD-14	Image formats, dimensions and image-count limits	Unconfirmed
BD-15	Seller blog resubmission workflow	To be defined
BD-16	Detailed eligibility and evidence requirements for manual verification	To be defined
BD-17	Required application information for each role	To be finalized
BD-18	Whether users may reapply after a role application is rejected	To be finalized
28. Instructions for Claude Code
Claude Code is the implementation assistant for Biqbaq.
It must act as a senior software engineer working within the approved architecture.
28.1 General Rules
1. Treat this PRD as the primary product requirements baseline.
2. Do not invent business requirements.
3. Do not silently change confirmed requirements.
4. Do not implement explicitly out-of-scope features.
5. Do not build independent seller websites.
6. Do not replace the modular monolith with microservices.
7. Do not introduce Redis/BullMQ into the MVP without approval.
8. Do not expose secrets in frontend or mobile code.
9. Do not rely on frontend checks for security.
10. Enforce permissions and business rules on the backend.
11. Use Supabase RLS appropriately.
12. Use database migrations for schema changes.
13. Keep shared business rules consistent across web and mobile.
14. Write tests for important business rules.
15. Document significant architectural decisions.
16. Do not assume an external API is free, public or commercially permitted without checking its terms.
17. Do not activate a role merely because an application has been submitted.
18. Do not allow pending role applications to grant permissions.
19. Do not allow Seller Staff access without seller authorization and membership.
20. Do not allow manual seller verification without an authorized Super Admin decision and audit record.
28.2 Development Workflow
For every development task:
1. Read CLAUDE.md and relevant project documentation.
2. Identify affected modules.
3. Review existing code before changing it.
4. Propose an implementation plan.
5. Identify database and security implications.
6. Implement the smallest complete feature.
7. Add or update tests.
8. Run relevant tests and type checks.
9. Report files changed and decisions made.
10. Update documentation where necessary.
Claude Code must not implement several unrelated modules in one unreviewed operation.
28.3 Architecture Before Implementation
Before implementing business features, produce:
* System architecture document.
* Domain model.
* Module dependency map.
* Database design.
* Supabase RLS security design.
* API specification.
* Authentication and authorization design.
* Role application and approval design.
* Manual verification design.
* Implementation roadmap.
The database schema and security model must be reviewed before large-scale feature implementation.
28.4 Definition of Done
A feature is not complete merely because its interface looks correct.
A feature is complete when:
* Business rules are implemented.
* Backend authorization is enforced.
* Database access is secure.
* Validation is implemented.
* Relevant tests pass.
* Error states are handled.
* Documentation is updated.
* Web and mobile behaviour is consistent where applicable.
* No existing feature has been unintentionally broken.

29. Final Product Principles
1. Security first: Never trust the frontend to enforce critical business rules.
2. One backend: Web and mobile share Supabase and the same domain rules.
3. Modular monolith: Keep the system modular without unnecessary infrastructure complexity.
4. Configurable platform: Important operational limits and feature switches belong in Super Admin configuration.
5. Seller independence: Sellers own their products and manage their business activities within platform rules.
6. Direct seller payments: Enabled sellers should receive payments through their connected payment-provider accounts.
7. Public product integration: Sellers can retrieve their products through a public API and direct visitors to Biqbaq's canonical product pages.
8. Controlled publishing: Verification and publication restrictions must be enforced consistently.
9. Controlled role activation: Additional roles require Super Admin approval.
10. Multiple roles: One user account may have multiple approved active roles.
11. Manual verification: Super Admin can manually approve seller identity verification when normal verification cannot be completed.
12. Seller staff authorization: Seller Staff access requires both platform role approval and seller authorization.
13. Privacy: Customer and seller private information must be protected.
14. Incremental development: Build, test and review features in manageable stages.
End of Product Requirements Document.
