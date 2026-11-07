-- Tests that try to break product images.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

create function pg_temp.act_as(p_user uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000f1', 'owner@example.com'),
  ('00000000-0000-4000-8000-0000000000f2', 'seller@example.com'),
  ('00000000-0000-4000-8000-0000000000f3', 'other@example.com'),
  ('00000000-0000-4000-8000-0000000000f5', 'buyer@example.com');
select private.bootstrap_super_admin('owner@example.com');
insert into user_roles (user_id, role_key) values
  ('00000000-0000-4000-8000-0000000000f2', 'seller'),
  ('00000000-0000-4000-8000-0000000000f3', 'seller');
insert into sellers (owner_user_id, slug, name, city) values
  ('00000000-0000-4000-8000-0000000000f2', 'img-shop', 'Img Shop', 'Toronto'),
  ('00000000-0000-4000-8000-0000000000f3', 'img-other', 'Img Other', 'Calgary');

select pg_temp.act_as('00000000-0000-4000-8000-0000000000f2');
insert into products (seller_id, name, description, category_id)
select s.id, 'Pictured', 'x', (select id from categories where slug = 'food') from sellers s where s.slug = 'img-shop';

create temp table ctx as select id from products where name = 'Pictured';
grant select on ctx to authenticated, anon;
create temp table asset (name text primary key, id uuid);
grant select on asset to authenticated, anon;

create function pg_temp.record(p_name text) returns void language sql as $$
  insert into asset select p_name, record_product_image('00000000-0000-4000-8000-0000000000f2', (select id from ctx), 'biqbaq/' || p_name, 'https://res.cloudinary.com/demo/image/upload/' || p_name || '.jpg');
$$;

-- Limits ----------------------------------------------------------------------

set local role authenticated;
select is(
  authorize_product_image((select id from ctx)),
  '{"formats": ["jpg", "png", "webp"], "max_bytes": 1048576, "max_images": 5, "max_dimension": 4000}'::jsonb,
  'a seller gets the agreed limits for their own product'
);

-- Only the server may save an image.
select throws_ok(
  $$ select record_product_image(auth.uid(), (select id from ctx), 'biqbaq/x', 'https://evil.example/x.jpg') $$,
  '42501', null, 'a seller cannot save an image without the server''s checks'
);
select throws_ok(
  $$ insert into media_assets (entity_type, entity_id, secure_url) values ('product', (select id from ctx), 'https://evil.example/x.jpg') $$,
  '42501', null, 'a seller cannot add an image directly'
);
select throws_ok($$ update media_assets set secure_url = 'https://evil.example/x.jpg' $$, '42501', null, 'a seller cannot change an image''s address');
select throws_ok($$ delete from media_assets $$, '42501', null, 'a seller cannot delete images directly');
reset role;

select throws_ok(
  $$ select record_product_image('00000000-0000-4000-8000-0000000000f2', (select id from ctx), 'biqbaq/bad', 'https://evil.example/x.jpg') $$,
  '23514', 'IMAGE_REJECTED', 'only Cloudinary addresses are stored, even from the server'
);

select pg_temp.record('a');
select is((select is_primary from media_assets where id = (select id from asset where name = 'a')), true, 'the first image is the main one');
select pg_temp.record('b');
select is((select is_primary from media_assets where id = (select id from asset where name = 'b')), false, 'later images are not');
select throws_ok(
  $$ select record_product_image('00000000-0000-4000-8000-0000000000f2', (select id from ctx), 'biqbaq/a', 'https://res.cloudinary.com/demo/a.jpg') $$,
  '23505', null, 'one file cannot be saved twice'
);
select pg_temp.record('c');
select pg_temp.record('d');
select pg_temp.record('e');
select throws_ok(
  $$ select record_product_image('00000000-0000-4000-8000-0000000000f2', (select id from ctx), 'biqbaq/f', 'https://res.cloudinary.com/demo/f.jpg') $$,
  '55000', 'IMAGE_LIMIT_REACHED', 'a sixth image cannot be saved'
);
set local role authenticated;
select throws_ok($$ select authorize_product_image((select id from ctx)) $$, '55000', 'IMAGE_LIMIT_REACHED', 'and a sixth upload is not authorized');

-- Privacy and ownership ---------------------------------------------------------

select is((select count(*)::int from media_assets), 5, 'a seller can see their draft''s images');
select is(product_image_limit(), 5, 'a seller can see the current limit');
reset role;

select pg_temp.act_as('00000000-0000-4000-8000-0000000000f3');
set local role authenticated;
select is_empty($$ select id from media_assets $$, 'another seller cannot see a draft''s images');
select throws_ok($$ select authorize_product_image((select id from ctx)) $$, '42501', null, 'or upload to it');
select throws_ok($$ select remove_product_image((select id from asset where name = 'a')) $$, '42501', null, 'or remove its images');
select throws_ok($$ select make_product_image_primary((select id from asset where name = 'b')) $$, '42501', null, 'or change the main image');
reset role;

select pg_temp.act_as('00000000-0000-4000-8000-0000000000f5');
set local role authenticated;
select throws_ok($$ select authorize_product_image((select id from ctx)) $$, '42501', null, 'a buyer cannot upload');
reset role;

-- Changing images -------------------------------------------------------------

select pg_temp.act_as('00000000-0000-4000-8000-0000000000f2');
set local role authenticated;
select lives_ok($$ select make_product_image_primary((select id from asset where name = 'c')) $$, 'a seller can choose the main image');
select is((select count(*)::int from media_assets where is_primary), 1, 'there is only ever one main image');
select lives_ok($$ select publish_product((select id from ctx)) $$, 'the product can be published');
select is((select images -> 0 ->> 'url' from public_products where name = 'Pictured'), 'https://res.cloudinary.com/demo/image/upload/c.jpg', 'the main image shows first publicly');
select is((select images -> 0 ->> 'alt' from public_products where name = 'Pictured'), 'Pictured', 'it is described by the product''s name');
select is((select jsonb_array_length(images) from public_products where name = 'Pictured'), 5, 'all its images are public');

select is(remove_product_image((select id from asset where name = 'c')), 'biqbaq/c', 'removing returns the file to delete');
select is((select count(*)::int from media_assets where is_primary), 1, 'removing the main image promotes another');
select throws_ok($$ select remove_product_image((select id from asset where name = 'c')) $$, 'P0002', 'IMAGE_NOT_FOUND', 'it cannot be removed twice');
reset role;

select is(
  (select metadata ->> 'public_id' from audit_logs where action = 'product.image_remove'),
  'biqbaq/c', 'removing a published product''s image is logged (Q-03)'
);
select is(
  (select on_behalf_of_seller_id from audit_logs where action = 'product.image_remove'),
  null, 'a seller''s own change is not marked as on behalf'
);

-- A suspension covers images too.
update products set status = 'suspended' where id = (select id from ctx);
select pg_temp.act_as('00000000-0000-4000-8000-0000000000f2');
set local role authenticated;
select throws_ok($$ select authorize_product_image((select id from ctx)) $$, '55000', 'PRODUCT_NOT_EDITABLE', 'a suspended product cannot get new images');
select throws_ok($$ select remove_product_image((select id from asset where name = 'a')) $$, '55000', 'PRODUCT_NOT_EDITABLE', 'or lose them');
reset role;
select throws_ok(
  $$ select record_product_image('00000000-0000-4000-8000-0000000000f2', (select id from ctx), 'biqbaq/g', 'https://res.cloudinary.com/demo/g.jpg') $$,
  '55000', 'PRODUCT_NOT_EDITABLE', 'an upload that finishes after a suspension is refused'
);
update products set status = 'published' where id = (select id from ctx);

-- A suspended Seller role stops it all.
update user_roles set status = 'suspended' where user_id = '00000000-0000-4000-8000-0000000000f2';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000f2');
set local role authenticated;
select throws_ok($$ select remove_product_image((select id from asset where name = 'a')) $$, '42501', null, 'a suspended Seller role cannot change images');
reset role;
update user_roles set status = 'active' where user_id = '00000000-0000-4000-8000-0000000000f2';

-- On behalf keeps both people.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000f1');
set local role authenticated;
select lives_ok($$ select remove_product_image((select id from asset where name = 'b')) $$, 'Super Admin can remove an image for a seller');
reset role;
select results_eq(
  $$ select actor_id, on_behalf_of_seller_id from audit_logs where action = 'product.image_remove' and metadata ->> 'public_id' = 'biqbaq/b' $$,
  $$ select '00000000-0000-4000-8000-0000000000f1'::uuid, seller_id from products where id = (select id from ctx) $$,
  'an on-behalf change records both people'
);

-- Visitors ---------------------------------------------------------------------

select set_config('request.jwt.claims', '', true);
set local role anon;
select throws_ok($$ select authorize_product_image((select id from ctx)) $$, '42501', null, 'visitors cannot upload');
select throws_ok($$ select record_product_image('00000000-0000-4000-8000-0000000000f5', (select id from ctx), 'x', 'https://res.cloudinary.com/x') $$, '42501', null, 'or save images');
select throws_ok($$ select remove_product_image((select id from asset where name = 'a')) $$, '42501', null, 'or remove them');
select ok((select count(*) from public_products where name = 'Pictured') = 1, 'visitors see published images through the public view');
reset role;

select * from finish();
rollback;
