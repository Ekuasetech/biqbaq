-- LOCAL DEMO DATA ONLY. Invented shops and products, loaded by `supabase db reset`.
-- `supabase db push` does not run this file, so it never reaches the real project.
-- Written directly, so unverified sample shops can exceed the two-product limit.

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000d1', 'adire-studio@example.com'),
  ('00000000-0000-4000-8000-0000000000d2', 'lagos-pantry@example.com'),
  ('00000000-0000-4000-8000-0000000000d3', 'kano-naturals@example.com'),
  ('00000000-0000-4000-8000-0000000000d4', 'oyo-weavers@example.com');

-- Enquiries only go to a confirmed address, so the sample shops can receive them.
update auth.users set email_confirmed_at = now() where id::text like '00000000-0000-4000-8000-0000000000d%';

insert into public.user_roles (user_id, role_key)
select id, 'seller' from auth.users where email like '%@example.com' and id::text like '00000000-0000-4000-8000-0000000000d%';

insert into public.sellers (owner_user_id, slug, name, city, verification_status, description, category) values
  ('00000000-0000-4000-8000-0000000000d1', 'adire-studio', 'Adire Studio (sample)', 'Toronto', 'manually_verified', 'Sample seller: hand-dyed textiles and home pieces, shipped within Canada.', 'fashion'),
  ('00000000-0000-4000-8000-0000000000d2', 'lagos-pantry', 'Lagos Pantry (sample)', 'Calgary', 'unverified', 'Sample seller: Nigerian groceries and spices for customers in Canada.', 'food'),
  ('00000000-0000-4000-8000-0000000000d3', 'kano-naturals', 'Kano Naturals (sample)', 'Ottawa', 'manually_verified', 'Sample seller: small-batch skincare for customers in Canada.', 'beauty'),
  ('00000000-0000-4000-8000-0000000000d4', 'oyo-weavers', 'Oyo Weavers (sample)', 'Mississauga', 'unverified', 'Sample seller: traditional woven fabrics and homeware.', 'home');

-- The triggers build a web address from the name, and audit on-behalf creation.
-- Sample products keep their own addresses, and have nothing to audit.
alter table public.products disable trigger prepare_new_product;
alter table public.products disable trigger log_on_behalf_product_create;

insert into public.products (id, seller_id, category_id, slug, name, description, price_minor, availability, condition, status, first_published_at, view_count)
select v.id::uuid, s.id, c.id, v.slug, v.name, v.description, v.price, v.availability, v.condition, 'published', v.published::timestamptz, v.views
from (values
  ('00000000-0000-4000-8000-000000000001', 'adire-studio', 'fashion', 'ankara-tote-bag', 'Ankara Tote Bag', 'A roomy everyday tote in bold Ankara print, with reinforced handles and an inner pocket.', 4500, 'in_stock', 'new', '2026-10-29T12:00:00Z', 1240),
  ('00000000-0000-4000-8000-000000000002', 'lagos-pantry', 'food', 'suya-spice-blend', 'Suya Spice Blend', 'A smoky, peppery blend for grilling. 200 g resealable pouch.', 1200, 'in_stock', null, '2026-10-28T12:00:00Z', 865),
  ('00000000-0000-4000-8000-000000000003', 'kano-naturals', 'beauty', 'whipped-shea-butter', 'Whipped Shea Butter', 'Unrefined shea butter whipped until light. 250 ml jar.', 1800, 'in_stock', null, '2026-10-27T12:00:00Z', 2310),
  ('00000000-0000-4000-8000-000000000004', 'oyo-weavers', 'home', 'carved-wooden-stool', 'Vintage Carved Wooden Stool', 'A sturdy stool carved from a single block of wood, with the marks of earlier use.', 8500, 'limited', 'used', '2026-10-26T12:00:00Z', 412),
  ('00000000-0000-4000-8000-000000000005', 'oyo-weavers', 'fashion', 'aso-oke-set', 'Handwoven Aso Oke Set', 'A traditional handwoven set for special occasions, in three matching pieces.', 18500, 'in_stock', 'new', '2026-10-25T12:00:00Z', 978),
  ('00000000-0000-4000-8000-000000000006', 'adire-studio', 'home', 'raffia-wall-basket', 'Raffia Wall Basket', 'A decorative raffia basket for wall hanging or table use. 40 cm wide.', 6500, 'limited', 'new', '2026-10-24T12:00:00Z', 356),
  ('00000000-0000-4000-8000-000000000007', 'lagos-pantry', 'food', 'egusi-seeds', 'Ground Egusi, 1 kg', 'Finely ground melon seeds for soups and stews.', 1850, 'in_stock', null, '2026-10-23T12:00:00Z', 1502),
  ('00000000-0000-4000-8000-000000000008', 'kano-naturals', 'beauty', 'african-black-soap', 'African Black Soap', 'A gentle plant-based soap bar. 150 g.', 900, 'in_stock', null, '2026-10-22T12:00:00Z', 689),
  ('00000000-0000-4000-8000-000000000009', 'kano-naturals', 'beauty', 'hibiscus-body-oil', 'Hibiscus Body Oil', 'A light body oil infused with dried hibiscus. 100 ml bottle.', 1400, 'in_stock', null, '2026-10-21T12:00:00Z', 274),
  ('00000000-0000-4000-8000-000000000010', 'adire-studio', 'fashion', 'adire-silk-scarf', 'Adire Silk Scarf', 'A lightweight silk scarf, hand-dyed using adire techniques.', 3800, 'in_stock', 'new', '2026-10-20T12:00:00Z', 1127),
  ('00000000-0000-4000-8000-000000000011', 'oyo-weavers', 'home', 'clay-cooking-pot', 'Clay Cooking Pot', 'A handmade clay pot with a fitted lid, suitable for slow cooking.', 4200, 'out_of_stock', 'new', '2026-10-19T12:00:00Z', 93),
  ('00000000-0000-4000-8000-000000000012', 'lagos-pantry', 'food', 'plantain-chips-box', 'Plantain Chips, Box of 12', 'Crisp, lightly salted plantain chips in single-serve bags.', 2400, 'in_stock', null, '2026-10-18T12:00:00Z', 548)
) as v (id, seller, category, slug, name, description, price, availability, condition, published, views)
join public.sellers s on s.slug = v.seller
join public.categories c on c.slug = v.category;

alter table public.products enable trigger prepare_new_product;
alter table public.products enable trigger log_on_behalf_product_create;

insert into public.product_publication_ledger (product_id, seller_id, seller_was_verified)
select p.id, p.seller_id, s.verification_status <> 'unverified'
from public.products p join public.sellers s on s.id = p.seller_id;

-- Random placeholder photos: the seed fixes the image, not its subject.
insert into public.media_assets (entity_type, entity_id, secure_url, alt_text, display_order, is_primary)
select 'product', p.id, 'https://picsum.photos/seed/' || p.slug || '-' || n || '/600/600', p.name || ', placeholder image ' || n, n, n = 1
from public.products p, generate_series(1, 3) n;

-- Sample blog posts for local use, moved from the preview's sample data. supabase db push does not load this file.
insert into public.blog_posts (id, slug, title, excerpt, body, category_id, cover_url, author_name, status, publish_at, first_published_at) values
  ('20000000-0000-4000-8000-000000000001', 'how-to-start-selling-your-products-online-from-canada', 'How to start selling your products online from Canada', 'Sample article: first steps for turning a side business into an online store that customers trust.', 'This is sample text to show how an article will look. Many small businesses begin with one product and a handful of customers who already know them.

A good first step is writing a clear description of what you sell, with honest photos and a fair price. Customers want to know exactly what they are getting and who they are buying from.

Once your first listings are live, ask customers for feedback, respond to questions quickly, and add new products as you learn what people want.', (select id from public.blog_categories where slug = 'business'), 'https://picsum.photos/seed/biqbaq-blog-1/800/600', 'Amara N. (sample)', 'published', '2026-10-28', '2026-10-28'),
  ('20000000-0000-4000-8000-000000000002', 'what-to-know-before-sending-cargo-home-to-nigeria', 'What to know before sending cargo home to Nigeria', 'Sample article: questions to ask a dealer, and how to pack your goods for the journey.', 'This is sample text to show how an article will look. Sending goods in a car going home can be convenient, but it helps to agree on the details early.

Ask the dealer about estimated dates, how much space is available, and what cannot be included. Pack items securely, and label your boxes clearly.

Rules on shipping and customs can change, so confirm what applies to your goods before you send them.', (select id from public.blog_categories where slug = 'cargo'), 'https://picsum.photos/seed/biqbaq-blog-2/800/600', 'Tunde A. (sample)', 'published', '2026-10-21', '2026-10-21'),
  ('20000000-0000-4000-8000-000000000003', 'five-ways-small-sellers-can-build-customer-trust', 'Five ways small sellers can build customer trust', 'Sample article: simple habits that help new sellers earn repeat customers.', 'This is sample text to show how an article will look. Trust grows through small, consistent actions rather than big promises.

Use clear photos, describe products accurately, answer messages promptly, and keep your availability up to date. Completing identity verification also shows customers you are serious.

When something goes wrong, respond quickly and fairly. Customers often remember how a problem was handled more than the problem itself.', (select id from public.blog_categories where slug = 'business'), 'https://picsum.photos/seed/biqbaq-blog-3/800/600', 'Chidinma O. (sample)', 'published', '2026-10-14', '2026-10-14'),
  ('20000000-0000-4000-8000-000000000004', 'stocking-your-pantry-with-nigerian-groceries-for-the-holidays', 'Stocking your pantry with Nigerian groceries for the holidays', 'Sample article: the staples worth buying early for your holiday cooking.', 'This is sample text to show how an article will look. Holiday cooking is easier when the basics are already in your cupboard.

Staples such as rice, spices, ground egusi and dried goods keep well, so they are worth buying ahead of the busy season.

Local sellers can be a great source, and many will tell you what is in stock if you ask.', (select id from public.blog_categories where slug = 'food'), 'https://picsum.photos/seed/biqbaq-blog-4/800/600', 'Bola K. (sample)', 'published', '2026-10-09', '2026-10-09'),
  ('20000000-0000-4000-8000-000000000005', 'styling-ankara-for-a-canadian-winter', 'Styling Ankara for a Canadian winter', 'Sample article: ways to keep bold prints in your wardrobe through the cold months.', 'This is sample text to show how an article will look. Cold weather does not have to mean giving up colour.

Layer an Ankara top under a neutral coat, add a printed scarf, or carry a bold tote to brighten a winter outfit.

Small touches like these keep your style recognisably yours, whatever the temperature outside.', (select id from public.blog_categories where slug = 'fashion'), 'https://picsum.photos/seed/biqbaq-blog-5/800/600', 'Ngozi E. (sample)', 'published', '2026-10-02', '2026-10-02')
on conflict (id) do nothing;

-- Sample reader numbers, so the page looks as it did. Real reading adds to them.
insert into public.blog_read_totals (post_id, readers) values
  ('20000000-0000-4000-8000-000000000001', 3420),
  ('20000000-0000-4000-8000-000000000002', 2875),
  ('20000000-0000-4000-8000-000000000003', 1960),
  ('20000000-0000-4000-8000-000000000004', 1540),
  ('20000000-0000-4000-8000-000000000005', 1185)
on conflict (post_id) do nothing;
