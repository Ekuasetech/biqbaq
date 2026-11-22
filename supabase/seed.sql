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

Once your first listings are live, ask customers for feedback, respond to questions quickly, and add new products as you learn what people want.', (select id from public.blog_categories where slug = 'entrepreneurship'), 'https://picsum.photos/seed/biqbaq-blog-1/800/600', 'Amara N. (sample)', 'published', '2026-10-28', '2026-10-28'),
  ('20000000-0000-4000-8000-000000000002', 'what-to-know-before-sending-cargo-home-to-nigeria', 'What to know before sending cargo home to Nigeria', 'Sample article: questions to ask a dealer, and how to pack your goods for the journey.', 'This is sample text to show how an article will look. Sending goods in a car going home can be convenient, but it helps to agree on the details early.

Ask the dealer about estimated dates, how much space is available, and what cannot be included. Pack items securely, and label your boxes clearly.

Rules on shipping and customs can change, so confirm what applies to your goods before you send them.', (select id from public.blog_categories where slug = 'entrepreneurship'), 'https://picsum.photos/seed/biqbaq-blog-2/800/600', 'Tunde A. (sample)', 'published', '2026-10-21', '2026-10-21'),
  ('20000000-0000-4000-8000-000000000003', 'five-ways-small-sellers-can-build-customer-trust', 'Five ways small sellers can build customer trust', 'Sample article: simple habits that help new sellers earn repeat customers.', 'This is sample text to show how an article will look. Trust grows through small, consistent actions rather than big promises.

Use clear photos, describe products accurately, answer messages promptly, and keep your availability up to date. Completing identity verification also shows customers you are serious.

When something goes wrong, respond quickly and fairly. Customers often remember how a problem was handled more than the problem itself.', (select id from public.blog_categories where slug = 'entrepreneurship'), 'https://picsum.photos/seed/biqbaq-blog-3/800/600', 'Chidinma O. (sample)', 'published', '2026-10-14', '2026-10-14'),
  ('20000000-0000-4000-8000-000000000004', 'stocking-your-pantry-with-nigerian-groceries-for-the-holidays', 'Stocking your pantry with Nigerian groceries for the holidays', 'Sample article: the staples worth buying early for your holiday cooking.', 'This is sample text to show how an article will look. Holiday cooking is easier when the basics are already in your cupboard.

Staples such as rice, spices, ground egusi and dried goods keep well, so they are worth buying ahead of the busy season.

Local sellers can be a great source, and many will tell you what is in stock if you ask.', (select id from public.blog_categories where slug = 'entrepreneurship'), 'https://picsum.photos/seed/biqbaq-blog-4/800/600', 'Bola K. (sample)', 'published', '2026-10-09', '2026-10-09'),
  ('20000000-0000-4000-8000-000000000005', 'styling-ankara-for-a-canadian-winter', 'Styling Ankara for a Canadian winter', 'Sample article: ways to keep bold prints in your wardrobe through the cold months.', 'This is sample text to show how an article will look. Cold weather does not have to mean giving up colour.

Layer an Ankara top under a neutral coat, add a printed scarf, or carry a bold tote to brighten a winter outfit.

Small touches like these keep your style recognisably yours, whatever the temperature outside.', (select id from public.blog_categories where slug = 'entrepreneurship'), 'https://picsum.photos/seed/biqbaq-blog-5/800/600', 'Ngozi E. (sample)', 'published', '2026-10-02', '2026-10-02')
on conflict (id) do nothing;

-- Sample reader numbers, so the page looks as it did. Real reading adds to them.
insert into public.blog_read_totals (post_id, readers) values
  ('20000000-0000-4000-8000-000000000001', 3420),
  ('20000000-0000-4000-8000-000000000002', 2875),
  ('20000000-0000-4000-8000-000000000003', 1960),
  ('20000000-0000-4000-8000-000000000004', 1540),
  ('20000000-0000-4000-8000-000000000005', 1185)
on conflict (post_id) do nothing;

-- Sample ads for local use, moved from the preview's sample data. Three are deliberately not
-- eligible (off, finished, not started), to exercise the rules. supabase db push does not load this file.
insert into public.advertisements (id, slug, title, description, advertiser_name, image_url, destination_url, placements, priority, active, starts_at, ends_at) values
  ('30000000-0000-4000-8000-000000000001', 'send-your-goods-home-this-season', 'Send your goods home this season', 'Sample ad: compare cars going from Canada to Nigeria, and find space for your goods.', 'Maple Freight (sample)', 'https://picsum.photos/seed/biqbaq-ad-1/900/600', '/cargo-cars', array['homepage', 'global'], 30, true, '2026-01-01T00:00:00.000Z', '2030-01-01T00:00:00.000Z'),
  ('30000000-0000-4000-8000-000000000002', 'stock-up-on-your-favourite-nigerian-staples', 'Stock up on your favourite Nigerian staples', 'Sample ad: rice, spices and pantry essentials from sellers across Canada.', 'Naija Foods Canada (sample)', 'https://picsum.photos/seed/biqbaq-ad-2/900/600', '/products?category=food', array['homepage', 'global'], 20, true, '2026-01-01T00:00:00.000Z', '2030-01-01T00:00:00.000Z'),
  ('30000000-0000-4000-8000-000000000003', 'fresh-prints-for-every-occasion', 'Fresh prints for every occasion', 'Sample ad: bold Ankara styles for work, weekends and special events.', 'Ankara House (sample)', 'https://picsum.photos/seed/biqbaq-ad-3/900/600', '/products?category=fashion', array['homepage', 'global'], 10, true, '2026-01-01T00:00:00.000Z', '2030-01-01T00:00:00.000Z'),
  ('30000000-0000-4000-8000-000000000004', 'inactive-ad-never-shown', 'Inactive ad: never shown', 'Never shown.', 'Hidden Advertiser (sample)', 'https://picsum.photos/seed/biqbaq-ad-4/900/600', '/products', array['homepage', 'global'], 99, false, '2026-01-01T00:00:00.000Z', '2030-01-01T00:00:00.000Z'),
  ('30000000-0000-4000-8000-000000000005', 'finished-ad-never-shown', 'Finished ad: never shown', 'Never shown.', 'Past Advertiser (sample)', 'https://picsum.photos/seed/biqbaq-ad-5/900/600', '/products', array['homepage', 'global'], 98, true, '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z'),
  ('30000000-0000-4000-8000-000000000006', 'future-ad-not-shown-yet', 'Future ad: not shown yet', 'Not shown yet.', 'Future Advertiser (sample)', 'https://picsum.photos/seed/biqbaq-ad-6/900/600', '/products', array['homepage', 'global'], 97, true, '2030-01-01T00:00:00.000Z', '2031-01-01T00:00:00.000Z')
on conflict (id) do nothing;

-- Sample cargo cars and their dealers, for local use, moved from the preview's sample data.
-- Space was a percentage there; it is weight now (owner's decision, 2026-11-07), at 5 kg a percent.
-- An unverified dealer's trips are hidden, as only verified sellers' trips show (Q-05).
insert into auth.users (id, email, email_confirmed_at) values
  ('40000000-0000-4000-8000-000000000001', 'maple-auto-export@example.com', now()),
  ('40000000-0000-4000-8000-000000000002', 'prairie-motors@example.com', now()),
  ('40000000-0000-4000-8000-000000000003', 'laurent-autos@example.com', now()),
  ('40000000-0000-4000-8000-000000000004', 'northgate-exports@example.com', now()),
  ('40000000-0000-4000-8000-000000000005', 'capital-auto-traders@example.com', now()),
  ('40000000-0000-4000-8000-000000000006', 'red-river-exports@example.com', now()),
  ('40000000-0000-4000-8000-000000000007', 'pacific-gate-motors@example.com', now()),
  ('40000000-0000-4000-8000-000000000008', 'atlantic-auto-shippers@example.com', now()),
  ('40000000-0000-4000-8000-000000000009', 'lakeshore-exports@example.com', now()),
  ('40000000-0000-4000-8000-000000000010', 'peel-motors@example.com', now())
on conflict (id) do nothing;
insert into public.user_roles (user_id, role_key)
select id, 'seller' from auth.users where id::text like '40000000-%'
on conflict (user_id, role_key) do nothing;
insert into public.sellers (id, owner_user_id, slug, name, city, verification_status, description, category) values
  ('41000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'maple-auto-export', 'Maple Auto Export (sample)', 'Toronto', 'manually_verified', 'Sample dealer: cars going to Nigeria with room for goods.', 'home'),
  ('41000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', 'prairie-motors', 'Prairie Motors (sample)', 'Toronto', 'manually_verified', 'Sample dealer: cars going to Nigeria with room for goods.', 'home'),
  ('41000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000003', 'laurent-autos', 'Laurent Autos (sample)', 'Toronto', 'unverified', 'Sample dealer: cars going to Nigeria with room for goods.', 'home'),
  ('41000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000004', 'northgate-exports', 'Northgate Exports (sample)', 'Toronto', 'manually_verified', 'Sample dealer: cars going to Nigeria with room for goods.', 'home'),
  ('41000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000005', 'capital-auto-traders', 'Capital Auto Traders (sample)', 'Toronto', 'manually_verified', 'Sample dealer: cars going to Nigeria with room for goods.', 'home'),
  ('41000000-0000-4000-8000-000000000006', '40000000-0000-4000-8000-000000000006', 'red-river-exports', 'Red River Exports (sample)', 'Toronto', 'manually_verified', 'Sample dealer: cars going to Nigeria with room for goods.', 'home'),
  ('41000000-0000-4000-8000-000000000007', '40000000-0000-4000-8000-000000000007', 'pacific-gate-motors', 'Pacific Gate Motors (sample)', 'Toronto', 'unverified', 'Sample dealer: cars going to Nigeria with room for goods.', 'home'),
  ('41000000-0000-4000-8000-000000000008', '40000000-0000-4000-8000-000000000008', 'atlantic-auto-shippers', 'Atlantic Auto Shippers (sample)', 'Toronto', 'manually_verified', 'Sample dealer: cars going to Nigeria with room for goods.', 'home'),
  ('41000000-0000-4000-8000-000000000009', '40000000-0000-4000-8000-000000000009', 'lakeshore-exports', 'Lakeshore Exports (sample)', 'Toronto', 'manually_verified', 'Sample dealer: cars going to Nigeria with room for goods.', 'home'),
  ('41000000-0000-4000-8000-000000000010', '40000000-0000-4000-8000-000000000010', 'peel-motors', 'Peel Motors (sample)', 'Toronto', 'unverified', 'Sample dealer: cars going to Nigeria with room for goods.', 'home')
on conflict (id) do nothing;
insert into public.vehicle_listings (id, seller_id, slug, make, model, year, origin_city, destination_city, departure_date, available_kg, restrictions, cargo_status, status, first_published_at) values
  ('10000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000001', '2021-toyota-sienna', 'Toyota', 'Sienna', 2021, 'Toronto', 'Lagos', '2026-12-05', 200, array['Sample: no hazardous or flammable items', 'Sample: no perishable food', 'Sample: boxes must be sealed and labelled']::text[], 'accepting_cargo', 'published', now()),
  ('10000000-0000-4000-8000-000000000002', '41000000-0000-4000-8000-000000000002', '2019-honda-pilot', 'Honda', 'Pilot', 2019, 'Calgary', 'Lagos', '2026-12-12', 325, array['Sample: no hazardous or flammable items', 'Sample: no perishable food', 'Sample: boxes must be sealed and labelled']::text[], 'accepting_cargo', 'published', now()),
  ('10000000-0000-4000-8000-000000000003', '41000000-0000-4000-8000-000000000003', '2018-toyota-highlander', 'Toyota', 'Highlander', 2018, 'Montreal', 'Port Harcourt', '2026-12-20', 125, array['Sample: no hazardous or flammable items', 'Sample: no perishable food', 'Sample: boxes must be sealed and labelled']::text[], 'accepting_cargo', 'published', now()),
  ('10000000-0000-4000-8000-000000000004', '41000000-0000-4000-8000-000000000004', '2020-lexus-rx-350', 'Lexus', 'RX 350', 2020, 'Edmonton', 'Abuja', '2027-01-08', 250, array['Sample: no hazardous or flammable items', 'Sample: no perishable food', 'Sample: boxes must be sealed and labelled']::text[], 'accepting_cargo', 'published', now()),
  ('10000000-0000-4000-8000-000000000005', '41000000-0000-4000-8000-000000000005', '2017-toyota-camry', 'Toyota', 'Camry', 2017, 'Ottawa', 'Lagos', '2027-01-12', 275, array['Sample: no hazardous or flammable items', 'Sample: no perishable food', 'Sample: boxes must be sealed and labelled']::text[], 'accepting_cargo', 'published', now()),
  ('10000000-0000-4000-8000-000000000006', '41000000-0000-4000-8000-000000000006', '2022-toyota-rav4', 'Toyota', 'RAV4', 2022, 'Winnipeg', 'Lagos', '2027-01-15', 150, array['Sample: no hazardous or flammable items', 'Sample: no perishable food', 'Sample: boxes must be sealed and labelled']::text[], 'accepting_cargo', 'published', now()),
  ('10000000-0000-4000-8000-000000000007', '41000000-0000-4000-8000-000000000007', '2016-honda-accord', 'Honda', 'Accord', 2016, 'Vancouver', 'Port Harcourt', '2027-01-20', 350, array['Sample: no hazardous or flammable items', 'Sample: no perishable food', 'Sample: boxes must be sealed and labelled']::text[], 'accepting_cargo', 'published', now()),
  ('10000000-0000-4000-8000-000000000008', '41000000-0000-4000-8000-000000000001', '2019-ford-explorer', 'Ford', 'Explorer', 2019, 'Mississauga', 'Lagos', '2027-01-24', 225, array['Sample: no hazardous or flammable items', 'Sample: no perishable food', 'Sample: boxes must be sealed and labelled']::text[], 'accepting_cargo', 'published', now()),
  ('10000000-0000-4000-8000-000000000009', '41000000-0000-4000-8000-000000000008', '2018-hyundai-santa-fe', 'Hyundai', 'Santa Fe', 2018, 'Halifax', 'Abuja', '2027-02-02', 300, array['Sample: no hazardous or flammable items', 'Sample: no perishable food', 'Sample: boxes must be sealed and labelled']::text[], 'accepting_cargo', 'published', now()),
  ('10000000-0000-4000-8000-000000000010', '41000000-0000-4000-8000-000000000009', '2020-toyota-corolla', 'Toyota', 'Corolla', 2020, 'Toronto', 'Lagos', '2027-02-06', 100, array['Sample: no hazardous or flammable items', 'Sample: no perishable food', 'Sample: boxes must be sealed and labelled']::text[], 'accepting_cargo', 'published', now()),
  ('10000000-0000-4000-8000-000000000011', '41000000-0000-4000-8000-000000000010', '2021-kia-sorento', 'Kia', 'Sorento', 2021, 'Brampton', 'Port Harcourt', '2027-02-14', 175, array['Sample: no hazardous or flammable items', 'Sample: no perishable food', 'Sample: boxes must be sealed and labelled']::text[], 'accepting_cargo', 'published', now()),
  ('10000000-0000-4000-8000-000000000012', '41000000-0000-4000-8000-000000000002', '2017-mercedes-benz-gle', 'Mercedes-Benz', 'GLE', 2017, 'Saskatoon', 'Abuja', '2027-02-20', 250, array['Sample: no hazardous or flammable items', 'Sample: no perishable food', 'Sample: boxes must be sealed and labelled']::text[], 'accepting_cargo', 'published', now())
on conflict (id) do nothing;
insert into public.media_assets (entity_type, entity_id, cloudinary_public_id, secure_url, alt_text, display_order, is_primary) values
  ('vehicle', '10000000-0000-4000-8000-000000000001', 'sample/vehicle/2021-toyota-sienna-0', 'https://picsum.photos/seed/biqbaq-cargo-2021-toyota-sienna-1/600/600', 'A silver Toyota Sienna packed with luggage and boxes, being loaded into a shipping container', 0, true),
  ('vehicle', '10000000-0000-4000-8000-000000000001', 'sample/vehicle/2021-toyota-sienna-1', 'https://picsum.photos/seed/biqbaq-cargo-2021-toyota-sienna-2/600/600', '2021 Toyota Sienna, placeholder image 2', 1, false),
  ('vehicle', '10000000-0000-4000-8000-000000000001', 'sample/vehicle/2021-toyota-sienna-2', 'https://picsum.photos/seed/biqbaq-cargo-2021-toyota-sienna-3/600/600', '2021 Toyota Sienna, placeholder image 3', 2, false),
  ('vehicle', '10000000-0000-4000-8000-000000000002', 'sample/vehicle/2019-honda-pilot-0', 'https://picsum.photos/seed/biqbaq-cargo-2019-honda-pilot-1/600/600', '2019 Honda Pilot, placeholder image 1', 0, true),
  ('vehicle', '10000000-0000-4000-8000-000000000002', 'sample/vehicle/2019-honda-pilot-1', 'https://picsum.photos/seed/biqbaq-cargo-2019-honda-pilot-2/600/600', '2019 Honda Pilot, placeholder image 2', 1, false),
  ('vehicle', '10000000-0000-4000-8000-000000000002', 'sample/vehicle/2019-honda-pilot-2', 'https://picsum.photos/seed/biqbaq-cargo-2019-honda-pilot-3/600/600', '2019 Honda Pilot, placeholder image 3', 2, false),
  ('vehicle', '10000000-0000-4000-8000-000000000003', 'sample/vehicle/2018-toyota-highlander-0', 'https://picsum.photos/seed/biqbaq-cargo-2018-toyota-highlander-1/600/600', '2018 Toyota Highlander, placeholder image 1', 0, true),
  ('vehicle', '10000000-0000-4000-8000-000000000003', 'sample/vehicle/2018-toyota-highlander-1', 'https://picsum.photos/seed/biqbaq-cargo-2018-toyota-highlander-2/600/600', '2018 Toyota Highlander, placeholder image 2', 1, false),
  ('vehicle', '10000000-0000-4000-8000-000000000003', 'sample/vehicle/2018-toyota-highlander-2', 'https://picsum.photos/seed/biqbaq-cargo-2018-toyota-highlander-3/600/600', '2018 Toyota Highlander, placeholder image 3', 2, false),
  ('vehicle', '10000000-0000-4000-8000-000000000004', 'sample/vehicle/2020-lexus-rx-350-0', 'https://picsum.photos/seed/biqbaq-cargo-2020-lexus-rx-350-1/600/600', '2020 Lexus RX 350, placeholder image 1', 0, true),
  ('vehicle', '10000000-0000-4000-8000-000000000004', 'sample/vehicle/2020-lexus-rx-350-1', 'https://picsum.photos/seed/biqbaq-cargo-2020-lexus-rx-350-2/600/600', '2020 Lexus RX 350, placeholder image 2', 1, false),
  ('vehicle', '10000000-0000-4000-8000-000000000004', 'sample/vehicle/2020-lexus-rx-350-2', 'https://picsum.photos/seed/biqbaq-cargo-2020-lexus-rx-350-3/600/600', '2020 Lexus RX 350, placeholder image 3', 2, false),
  ('vehicle', '10000000-0000-4000-8000-000000000005', 'sample/vehicle/2017-toyota-camry-0', 'https://picsum.photos/seed/biqbaq-cargo-2017-toyota-camry-1/600/600', '2017 Toyota Camry, placeholder image 1', 0, true),
  ('vehicle', '10000000-0000-4000-8000-000000000005', 'sample/vehicle/2017-toyota-camry-1', 'https://picsum.photos/seed/biqbaq-cargo-2017-toyota-camry-2/600/600', '2017 Toyota Camry, placeholder image 2', 1, false),
  ('vehicle', '10000000-0000-4000-8000-000000000005', 'sample/vehicle/2017-toyota-camry-2', 'https://picsum.photos/seed/biqbaq-cargo-2017-toyota-camry-3/600/600', '2017 Toyota Camry, placeholder image 3', 2, false),
  ('vehicle', '10000000-0000-4000-8000-000000000006', 'sample/vehicle/2022-toyota-rav4-0', 'https://picsum.photos/seed/biqbaq-cargo-2022-toyota-rav4-1/600/600', '2022 Toyota RAV4, placeholder image 1', 0, true),
  ('vehicle', '10000000-0000-4000-8000-000000000006', 'sample/vehicle/2022-toyota-rav4-1', 'https://picsum.photos/seed/biqbaq-cargo-2022-toyota-rav4-2/600/600', '2022 Toyota RAV4, placeholder image 2', 1, false),
  ('vehicle', '10000000-0000-4000-8000-000000000006', 'sample/vehicle/2022-toyota-rav4-2', 'https://picsum.photos/seed/biqbaq-cargo-2022-toyota-rav4-3/600/600', '2022 Toyota RAV4, placeholder image 3', 2, false),
  ('vehicle', '10000000-0000-4000-8000-000000000007', 'sample/vehicle/2016-honda-accord-0', 'https://picsum.photos/seed/biqbaq-cargo-2016-honda-accord-1/600/600', '2016 Honda Accord, placeholder image 1', 0, true),
  ('vehicle', '10000000-0000-4000-8000-000000000007', 'sample/vehicle/2016-honda-accord-1', 'https://picsum.photos/seed/biqbaq-cargo-2016-honda-accord-2/600/600', '2016 Honda Accord, placeholder image 2', 1, false),
  ('vehicle', '10000000-0000-4000-8000-000000000007', 'sample/vehicle/2016-honda-accord-2', 'https://picsum.photos/seed/biqbaq-cargo-2016-honda-accord-3/600/600', '2016 Honda Accord, placeholder image 3', 2, false),
  ('vehicle', '10000000-0000-4000-8000-000000000008', 'sample/vehicle/2019-ford-explorer-0', 'https://picsum.photos/seed/biqbaq-cargo-2019-ford-explorer-1/600/600', '2019 Ford Explorer, placeholder image 1', 0, true),
  ('vehicle', '10000000-0000-4000-8000-000000000008', 'sample/vehicle/2019-ford-explorer-1', 'https://picsum.photos/seed/biqbaq-cargo-2019-ford-explorer-2/600/600', '2019 Ford Explorer, placeholder image 2', 1, false),
  ('vehicle', '10000000-0000-4000-8000-000000000008', 'sample/vehicle/2019-ford-explorer-2', 'https://picsum.photos/seed/biqbaq-cargo-2019-ford-explorer-3/600/600', '2019 Ford Explorer, placeholder image 3', 2, false),
  ('vehicle', '10000000-0000-4000-8000-000000000009', 'sample/vehicle/2018-hyundai-santa-fe-0', 'https://picsum.photos/seed/biqbaq-cargo-2018-hyundai-santa-fe-1/600/600', '2018 Hyundai Santa Fe, placeholder image 1', 0, true),
  ('vehicle', '10000000-0000-4000-8000-000000000009', 'sample/vehicle/2018-hyundai-santa-fe-1', 'https://picsum.photos/seed/biqbaq-cargo-2018-hyundai-santa-fe-2/600/600', '2018 Hyundai Santa Fe, placeholder image 2', 1, false),
  ('vehicle', '10000000-0000-4000-8000-000000000009', 'sample/vehicle/2018-hyundai-santa-fe-2', 'https://picsum.photos/seed/biqbaq-cargo-2018-hyundai-santa-fe-3/600/600', '2018 Hyundai Santa Fe, placeholder image 3', 2, false),
  ('vehicle', '10000000-0000-4000-8000-000000000010', 'sample/vehicle/2020-toyota-corolla-0', 'https://picsum.photos/seed/biqbaq-cargo-2020-toyota-corolla-1/600/600', '2020 Toyota Corolla, placeholder image 1', 0, true),
  ('vehicle', '10000000-0000-4000-8000-000000000010', 'sample/vehicle/2020-toyota-corolla-1', 'https://picsum.photos/seed/biqbaq-cargo-2020-toyota-corolla-2/600/600', '2020 Toyota Corolla, placeholder image 2', 1, false),
  ('vehicle', '10000000-0000-4000-8000-000000000010', 'sample/vehicle/2020-toyota-corolla-2', 'https://picsum.photos/seed/biqbaq-cargo-2020-toyota-corolla-3/600/600', '2020 Toyota Corolla, placeholder image 3', 2, false),
  ('vehicle', '10000000-0000-4000-8000-000000000011', 'sample/vehicle/2021-kia-sorento-0', 'https://picsum.photos/seed/biqbaq-cargo-2021-kia-sorento-1/600/600', '2021 Kia Sorento, placeholder image 1', 0, true),
  ('vehicle', '10000000-0000-4000-8000-000000000011', 'sample/vehicle/2021-kia-sorento-1', 'https://picsum.photos/seed/biqbaq-cargo-2021-kia-sorento-2/600/600', '2021 Kia Sorento, placeholder image 2', 1, false),
  ('vehicle', '10000000-0000-4000-8000-000000000011', 'sample/vehicle/2021-kia-sorento-2', 'https://picsum.photos/seed/biqbaq-cargo-2021-kia-sorento-3/600/600', '2021 Kia Sorento, placeholder image 3', 2, false),
  ('vehicle', '10000000-0000-4000-8000-000000000012', 'sample/vehicle/2017-mercedes-benz-gle-0', 'https://picsum.photos/seed/biqbaq-cargo-2017-mercedes-benz-gle-1/600/600', '2017 Mercedes-Benz GLE, placeholder image 1', 0, true),
  ('vehicle', '10000000-0000-4000-8000-000000000012', 'sample/vehicle/2017-mercedes-benz-gle-1', 'https://picsum.photos/seed/biqbaq-cargo-2017-mercedes-benz-gle-2/600/600', '2017 Mercedes-Benz GLE, placeholder image 2', 1, false),
  ('vehicle', '10000000-0000-4000-8000-000000000012', 'sample/vehicle/2017-mercedes-benz-gle-2', 'https://picsum.photos/seed/biqbaq-cargo-2017-mercedes-benz-gle-3/600/600', '2017 Mercedes-Benz GLE, placeholder image 3', 2, false)
on conflict do nothing;
insert into public.vehicle_view_totals (vehicle_listing_id, views) values
  ('10000000-0000-4000-8000-000000000001', 1876),
  ('10000000-0000-4000-8000-000000000002', 942),
  ('10000000-0000-4000-8000-000000000003', 531),
  ('10000000-0000-4000-8000-000000000004', 1208),
  ('10000000-0000-4000-8000-000000000005', 640),
  ('10000000-0000-4000-8000-000000000006', 1543),
  ('10000000-0000-4000-8000-000000000007', 487),
  ('10000000-0000-4000-8000-000000000008', 1102),
  ('10000000-0000-4000-8000-000000000009', 318),
  ('10000000-0000-4000-8000-000000000010', 1689),
  ('10000000-0000-4000-8000-000000000011', 729),
  ('10000000-0000-4000-8000-000000000012', 256)
on conflict (vehicle_listing_id) do nothing;
