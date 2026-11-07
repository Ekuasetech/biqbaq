# API Specification

Status: **proposed, awaiting review**. Base path `/api/v1`. Later phases extend this document as they arrive. Request and response schemas live in `packages/validation`.

## Conventions

- **Authentication:** `Authorization: Bearer <supabase-jwt>`, or the session cookie on web.
- **Errors:** `{ "error": { "code": "PUBLISH_ALLOWANCE_EXHAUSTED", "message": "...", "details": {} } }`. Codes are stable and defined in `domain-contracts`. Clients translate by code.
- **Status codes:** 400 validation, 401 not signed in, 403 not permitted, 404 not found or not visible, 409 invalid state change, 429 rate limited.
- **Pagination:** `?page=1&pageSize=20` (maximum 100), returning `meta: { page, pageSize, total, totalPages }`.
- **Compatibility:** additive changes stay in v1; breaking changes get v2.

## Public seller product API (§10)

### `GET /api/v1/sellers/{sellerSlug}/products`

No API key. CORS open for this read endpoint so that independent sites can call it from the browser.

| Query | Values | Notes |
| --- | --- | --- |
| `page`, `pageSize` | integers | |
| `category` | category slug | |
| `availability` | availability value | |
| `sort` | `newest` (default), `price_asc`, `price_desc`, `name` | |

Response `200`:

```json
{
  "seller": { "name": "ABC Store", "slug": "abc-store", "verified": true },
  "data": [
    {
      "id": "6f1c7a2e-0000-4000-8000-000000000000",
      "name": "Ankara Tote Bag",
      "slug": "ankara-tote-bag",
      "description": "Handmade tote bag.",
      "price": { "amountMinor": 4500, "currency": "CAD" },
      "images": [{ "url": "https://res.cloudinary.com/...", "alt": "Ankara tote bag" }],
      "availability": "in_stock",
      "category": { "slug": "bags", "name": "Bags" },
      "url": "https://biqbaq.com/products/ankara-tote-bag"
    }
  ],
  "meta": { "page": 1, "pageSize": 20, "total": 1, "totalPages": 1 }
}
```

`404` if the seller does not exist or is suspended. A seller with no published products returns an empty `data`.

- **Excluded:** drafts, unpublished, archived, suspended and deleted products, and all private seller data.
- **Stable:** `id` never changes. `url` is the canonical page, where clicks must go (§10.5).
- **Headers:** `Cache-Control` with `s-maxage` and `stale-while-revalidate`, plus `ETag`. Product changes invalidate the seller's cache tag.
- **Rate limit:** per IP, returning `429` with `Retry-After`. The exact limit is set at implementation and configurable.
- **Output:** built from an explicit schema, not by passing database rows through.

## Trusted operations

Authenticated. Authorization is enforced on the server. Everything else goes via RLS reads and RPCs, listed in [workflows.md](workflows.md).

| Method and path | Purpose | Phase |
| --- | --- | --- |
| `GET /search/suggestions?q=` | **Public.** Live search box suggestions: public product and cargo car fields only, in `{ data: [...] }`. Rate limiting to be added with the backend | 3 |
| `GET /me` | Profile, active roles, permissions, seller memberships (display only) | 2 |
| `POST /admin/users/marketers` | Manually create a marketer | 8 |
| `POST /media/sign` | Authorize a Cloudinary upload for an entity the caller controls | 3 |
| `POST /media/complete` | Verify the upload and save metadata | 3 |
| `DELETE /media/{id}` | Remove from Cloudinary and the database | 3 |
| `POST /auth/email-hook` | **Supabase Auth only.** Sends account emails. Needs a valid signature made with `SEND_EMAIL_HOOK_SECRET` | 4 |
| `POST /internal/jobs/run` | **Scheduler only.** Sends one batch of waiting emails, with `Authorization: Bearer` and `JOBS_WORKER_SECRET`. Answers 503 until the secret is set | 4 |
| `POST /products/{id}/contact` | **Public.** Anonymous enquiry, sent via Resend with Reply-To | 4 |
| `POST /sellers/me/invitations` | Invite staff | 3 |
| `POST /payments/onboarding` | Start provider onboarding | 7 |
| `POST /checkout` | Server-side payment initialization | 7 |
| `POST /webhooks/payments/{provider}` | Signature-verified provider events | 7 |
| `POST /webhooks/verification/{provider}` | Signature-verified provider results | 10 |

### `POST /products/{id}/contact`

```json
{ "name": "Ada", "email": "ada@example.com", "subject": "Availability", "message": "Is this in stock?", "website": "" }
```

`website` is the hidden honeypot field. Responses: `202` when accepted for sending, `400`, `404` (product not public), `429`. Failures are reported to the visitor (§9.2), and never reveal the seller's address.
