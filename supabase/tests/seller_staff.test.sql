-- Tests that try to break seller staff. Access needs both gates, stays inside one seller,
-- and nobody can pass on more than they hold.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

create function pg_temp.act_as(p_user uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-000000000101', 'owner-a@example.com', now()),
  ('00000000-0000-4000-8000-000000000102', 'owner-b@example.com', now()),
  ('00000000-0000-4000-8000-000000000103', 'staff@example.com', now()),
  ('00000000-0000-4000-8000-000000000104', 'manager@example.com', now()),
  ('00000000-0000-4000-8000-000000000105', 'stranger@example.com', now());
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000106', 'unconfirmed@example.com');
insert into user_roles (user_id, role_key) values
  ('00000000-0000-4000-8000-000000000101', 'seller'),
  ('00000000-0000-4000-8000-000000000102', 'seller'),
  ('00000000-0000-4000-8000-000000000104', 'seller_staff'),
  ('00000000-0000-4000-8000-000000000106', 'seller_staff');
insert into sellers (id, owner_user_id, slug, name, city) values
  ('00000000-0000-4000-8000-000000000a01', '00000000-0000-4000-8000-000000000101', 'staff-shop-a', 'Shop A', 'Toronto'),
  ('00000000-0000-4000-8000-000000000a02', '00000000-0000-4000-8000-000000000102', 'staff-shop-b', 'Shop B', 'Calgary');
insert into seller_private (seller_id, contact_information) values ('00000000-0000-4000-8000-000000000a01', 'PRIVATE PHONE');
insert into products (id, seller_id, created_by, slug, name, description, category_id, price_minor, currency, status) values
  ('00000000-0000-4000-8000-000000000b01', '00000000-0000-4000-8000-000000000a01', '00000000-0000-4000-8000-000000000101', 'a-draft', 'A Draft', 'Words', (select id from categories limit 1), 100, 'CAD', 'draft'),
  ('00000000-0000-4000-8000-000000000b02', '00000000-0000-4000-8000-000000000a02', '00000000-0000-4000-8000-000000000102', 'b-draft', 'B Draft', 'Words', (select id from categories limit 1), 100, 'CAD', 'draft');

create temp table v (a uuid, b uuid, pa uuid, pb uuid);
insert into v values ('00000000-0000-4000-8000-000000000a01', '00000000-0000-4000-8000-000000000a02', '00000000-0000-4000-8000-000000000b01', '00000000-0000-4000-8000-000000000b02');
grant select on v to authenticated, anon;
create temp table inv (id uuid);
grant select, insert, delete on inv to authenticated;
delete from background_jobs;

-- Tables are closed to everyone directly.
select pg_temp.act_as('00000000-0000-4000-8000-000000000101');
set local role authenticated;
select throws_ok($$ select * from seller_invitations $$, '42501', null, 'invitations cannot be read directly');
select throws_ok($$ select * from seller_staff_memberships $$, '42501', null, 'memberships cannot be read directly');
select throws_ok($$ insert into seller_staff_memberships (seller_id, user_id) values ((select a from v), auth.uid()) $$, '42501', null, 'nobody can add a membership directly');
select throws_ok($$ select * from seller_staff_permissions $$, '42501', null, 'permissions cannot be read directly');

-- Inviting.
select throws_ok($$ select invite_staff((select b from v), 'x@example.com') $$, '42501', 'NOT_AUTHORIZED', 'a seller cannot invite for another shop');
select throws_ok($$ select invite_staff((select a from v), 'not an address') $$, '23514', 'EMAIL_INVALID', 'a bad address is refused');
select throws_ok($$ select invite_staff((select a from v), 'owner-a@example.com') $$, '23514', 'CANNOT_INVITE_OWNER', 'the owner cannot be invited');
select throws_ok($$ select invite_staff((select a from v), 'x@example.com', array['users.manage']) $$, '23514', 'UNKNOWN_PERMISSION', 'platform permissions cannot be given to staff');
select lives_ok($$ insert into inv select invite_staff((select a from v), '  STAFF@example.com ', array['products.create', 'products.edit']) $$, 'a seller invites someone');
select throws_ok($$ select invite_staff((select a from v), 'staff@example.com') $$, '55000', 'INVITATION_PENDING', 'a second invitation is refused while one waits');
select is((select email from shop_invitations((select a from v))), 'staff@example.com', 'the invitation is listed, tidied');
select throws_ok($$ select * from shop_invitations((select b from v)) $$, '42501', null, 'another shop''s invitations stay hidden');
select throws_ok($$ select * from shop_staff((select b from v)) $$, '42501', null, 'and so does its staff');
reset role;
select is((select payload -> 'data' ->> 'shop' from background_jobs where payload ->> 'template' = 'staff_invitation'), 'Shop A', 'the person is emailed, with the shop''s name');
select is((select user_id from background_jobs where payload ->> 'template' = 'staff_invitation'), '00000000-0000-4000-8000-000000000103'::uuid, 'an existing account is looked up, not copied');
select is_empty($$ select 1 from background_jobs where payload ->> 'to' = 'staff@example.com' $$, 'so the address stays out of the job');

set local role anon;
select throws_ok($$ select invite_staff((select a from v), 'x@example.com') $$, '42501', null, 'a visitor cannot invite');
select throws_ok($$ select * from my_staff_invitations() $$, '42501', null, 'or see invitations');
reset role;

-- An address with no account yet is emailed directly, and the job is not visible to anyone.
select pg_temp.act_as('00000000-0000-4000-8000-000000000101');
set local role authenticated;
select lives_ok($$ select invite_staff((select a from v), 'brand-new@example.com') $$, 'someone with no account can be invited');
select lives_ok($$ select invite_staff((select a from v), 'unconfirmed@example.com', array['products.create']) $$, 'and someone who has not confirmed their address');
reset role;
select is((select payload ->> 'to' from background_jobs where user_id is null and payload ->> 'template' = 'staff_invitation'), 'brand-new@example.com', 'the job carries the address it needs');
set local role service_role;
select is((select count(*)::int from claim_email_jobs(50) where recipient_email = 'brand-new@example.com'), 1, 'and the worker can send it');
reset role;

-- Only the person who proved they own the address can use an invitation.
select pg_temp.act_as('00000000-0000-4000-8000-000000000105');
set local role authenticated;
select is_empty($$ select 1 from my_staff_invitations() $$, 'a stranger sees no invitation');
select throws_ok($$ select accept_staff_invitation((select id from inv)) $$, 'P0002', 'INVITATION_NOT_FOUND', 'and cannot accept one, even with its id');
select throws_ok($$ select decline_staff_invitation((select id from inv)) $$, 'P0002', 'INVITATION_NOT_FOUND', 'or decline it');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000106');
set local role authenticated;
select is_empty($$ select 1 from my_staff_invitations() $$, 'an address not yet confirmed does not count');
reset role;

-- Gate one only: accepted, but no approved role.
select pg_temp.act_as('00000000-0000-4000-8000-000000000103');
set local role authenticated;
select is((select shop_name from my_staff_invitations()), 'Shop A', 'the invited person sees it');
select lives_ok($$ select accept_staff_invitation((select id from inv)) $$, 'they accept');
select throws_ok($$ select accept_staff_invitation((select id from inv)) $$, '55000', 'INVITATION_NOT_PENDING', 'accepting twice is refused');
select is_empty($$ select 1 from sellers where id = (select a from v) $$, 'without the approved role, the shop stays hidden');
select is_empty($$ select 1 from products $$, 'and so do its products');
select is_empty($$ select 1 from shop_access((select a from v)) $$, 'and they have no access');
select throws_ok($$ insert into products (seller_id, name) values ((select a from v), 'No') $$, '42501', null, 'and cannot create products');
select throws_ok($$ select shop_publishing_allowance((select a from v)) $$, '42501', null, 'or see the allowance');
select results_eq($$ select shop_name, status, role_active from my_staff_shops() $$, $$ values ('Shop A', 'pending', false) $$, 'they can see what they are waiting for');
reset role;

-- Gate two only: an approved role with no membership reaches no seller.
select pg_temp.act_as('00000000-0000-4000-8000-000000000104');
set local role authenticated;
select is_empty($$ select 1 from sellers where id = (select a from v) $$, 'an approved role alone reaches no shop');
select is_empty($$ select 1 from products $$, 'or any products');
select throws_ok($$ insert into products (seller_id, name) values ((select a from v), 'No') $$, '42501', null, 'and cannot create products');
reset role;

-- Only the seller can approve them.
create temp table m as select id from seller_staff_memberships where user_id = '00000000-0000-4000-8000-000000000103';
grant select on m to authenticated, anon;
select pg_temp.act_as('00000000-0000-4000-8000-000000000103');
set local role authenticated;
select throws_ok($$ select approve_staff_member((select id from m)) $$, '42501', null, 'nobody can approve themselves');
select throws_ok($$ select set_staff_status((select id from m), 'active') $$, '42501', null, 'or activate themselves another way');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000102');
set local role authenticated;
select throws_ok($$ select approve_staff_member((select id from m)) $$, '42501', null, 'another seller cannot approve them');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000105');
set local role authenticated;
select throws_ok($$ select approve_staff_member((select id from m)) $$, '42501', null, 'and nor can a stranger');
reset role;
set local role anon;
select throws_ok($$ select approve_staff_member((select id from m)) $$, '42501', null, 'or a visitor');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000101');
set local role authenticated;
select throws_ok($$ select set_staff_status((select id from m), 'active') $$, '55000', 'INVALID_STATUS_CHANGE', 'approving cannot be skipped through restoring');
select throws_ok($$ select set_staff_status((select id from m), 'suspended') $$, '55000', 'INVALID_STATUS_CHANGE', 'someone waiting cannot be suspended');
select lives_ok($$ select approve_staff_member((select id from m)) $$, 'the seller approves them');
select throws_ok($$ select approve_staff_member((select id from m)) $$, '55000', 'INVALID_STATUS_CHANGE', 'approving twice is refused');
reset role;
select is((select status from user_roles where user_id = '00000000-0000-4000-8000-000000000103' and role_key = 'seller_staff'), 'active', 'approving gives the platform role');
select is((select count(*)::int from audit_logs where action = 'staff.approve' and actor_id = '00000000-0000-4000-8000-000000000101'), 1, 'it is audited, with who approved');
select is((select count(*)::int from audit_logs where action = 'role.assign' and metadata ->> 'role' = 'seller_staff'), 1, 'and so is the role');
select is((select count(*)::int from background_jobs where payload ->> 'template' = 'staff_approved'), 1, 'and they are told');
select pg_temp.act_as('00000000-0000-4000-8000-000000000103');
set local role authenticated;
select results_eq($$ select is_owner, permissions from shop_access((select a from v)) $$, $$ values (false, array['products.create', 'products.edit']) $$, 'with both gates, they have exactly what was given');
select is((select name from sellers where id = (select a from v)), 'Shop A', 'they can read the shop');
select is_empty($$ select 1 from seller_private $$, 'but not its private contact details');
select is((select count(*)::int from products), 1, 'they see this shop''s products only');
select lives_ok($$ insert into products (seller_id, name, description) values ((select a from v), 'Made by staff', 'Words') $$, 'they create a product');
select lives_ok($$ update products set description = 'Edited by staff' where id = (select pa from v) $$, 'they edit a product');

-- Only their own seller, and only their permissions.
select throws_ok($$ insert into products (seller_id, name) values ((select b from v), 'Sneaky') $$, '42501', null, 'they cannot create in another shop');
select lives_ok($$ update products set description = 'Sneaky' where id = (select pb from v) $$, 'an edit to another shop touches nothing');
select throws_ok($$ select publish_product((select pb from v)) $$, '42501', null, 'they cannot publish in another shop');
select throws_ok($$ select publish_product((select pa from v)) $$, '42501', null, 'they cannot publish without the permission');
select throws_ok($$ select unpublish_product((select pa from v)) $$, '42501', null, 'or unpublish');
select throws_ok($$ select delete_product((select pa from v)) $$, '42501', null, 'or delete');
select throws_ok($$ select invite_staff((select a from v), 'x@example.com') $$, '42501', null, 'or manage staff');
select throws_ok($$ select update_my_shop('Taken', 'Toronto', 'food', 'x', 'x') $$, '42501', null, 'or edit the shop''s details');
select throws_ok($$ select request_manual_verification('Please') $$, '42501', null, 'or ask for its verification');
select is_empty($$ select 1 from my_moderation_access() where products or shops or publishing $$, 'and staff are no moderators');
reset role;
select is((select description from products where id = (select pb from v)), 'Words', 'the other shop''s product is untouched');
select is((select description from products where id = (select pa from v)), 'Edited by staff', 'their edit was saved');
select is((select count(*)::int from audit_logs where action = 'product.create' and on_behalf_of_seller_id = (select a from v) and actor_id = '00000000-0000-4000-8000-000000000103'), 1, 'creating is audited with owner and actor apart');
select is((select count(*)::int from audit_logs where action = 'product.edit' and on_behalf_of_seller_id = (select a from v) and actor_id = '00000000-0000-4000-8000-000000000103'), 1, 'and so is editing');

-- Changing what they can do.
select pg_temp.act_as('00000000-0000-4000-8000-000000000102');
set local role authenticated;
select throws_ok($$ select set_staff_permissions((select id from m), array['products.delete']) $$, '42501', null, 'another seller cannot change them');
select throws_ok($$ select set_staff_status((select id from m), 'removed') $$, '42501', null, 'or remove them');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000103');
set local role authenticated;
select throws_ok($$ select set_staff_permissions((select id from m), array['products.delete']) $$, '42501', null, 'they cannot raise their own permissions');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000101');
set local role authenticated;
select throws_ok($$ select set_staff_permissions((select id from m), array['reports.view']) $$, '23514', 'UNKNOWN_PERMISSION', 'a platform permission is refused');
select lives_ok($$ select set_staff_permissions((select id from m), array['products.edit', 'products.publish', 'products.delete']) $$, 'the seller changes their permissions');
select lives_ok($$ select set_staff_permissions((select id from m), array['products.publish', 'products.edit', 'products.delete']) $$, 'saving the same set again is harmless');
select results_eq($$ select email, role_active, permissions from shop_staff((select a from v)) $$, $$ values ('staff@example.com', true, array['products.delete', 'products.edit', 'products.publish']) $$, 'the seller sees who has what');
reset role;
select is((select count(*)::int from audit_logs where action = 'staff.permissions'), 1, 'only the real change is audited');

select pg_temp.act_as('00000000-0000-4000-8000-000000000103');
set local role authenticated;
select throws_ok($$ insert into products (seller_id, name) values ((select a from v), 'No longer') $$, '42501', null, 'a removed permission stops working straight away');
select lives_ok($$ select publish_product((select pa from v)) $$, 'a new permission works: they publish');
select lives_ok($$ select unpublish_product((select pa from v)) $$, 'and unpublish');
reset role;
select is((select actor_id from audit_logs where action = 'product.publish' and on_behalf_of_seller_id = (select a from v)), '00000000-0000-4000-8000-000000000103'::uuid, 'publishing keeps owner and actor apart');
select is((select published_by from product_publication_ledger where product_id = (select pa from v)), '00000000-0000-4000-8000-000000000103'::uuid, 'the ledger records who published');

-- Staff use the shop's allowance: it does not reset for them.
update products set status = 'draft' where id = (select pa from v);
update sellers set allowance_override = 1 where id = (select a from v);
insert into products (id, seller_id, created_by, slug, name, description, category_id, price_minor, currency, status) values
  ('00000000-0000-4000-8000-000000000b03', '00000000-0000-4000-8000-000000000a01', '00000000-0000-4000-8000-000000000101', 'a-two', 'A Two', 'Words', (select id from categories limit 1), 100, 'CAD', 'draft');
select pg_temp.act_as('00000000-0000-4000-8000-000000000103');
set local role authenticated;
select results_eq($$ select (shop_publishing_allowance((select a from v)) ->> 'used')::int, (shop_publishing_allowance((select a from v)) ->> 'allowance')::int $$, $$ values (1, 1) $$, 'staff see the shop''s allowance');
select throws_ok($$ select publish_product('00000000-0000-4000-8000-000000000b03') $$, '55000', 'PUBLISH_ALLOWANCE_EXHAUSTED', 'and cannot go past it');
reset role;
update sellers set allowance_override = null where id = (select a from v);

-- A staff manager cannot pass on what they do not hold, or change themselves.
select pg_temp.act_as('00000000-0000-4000-8000-000000000101');
set local role authenticated;
delete from inv;
insert into inv select invite_staff((select a from v), 'manager@example.com', array['staff.manage', 'products.edit']);
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000104');
set local role authenticated;
select lives_ok($$ select accept_staff_invitation((select id from inv)) $$, 'a manager accepts');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000101');
set local role authenticated;
select lives_ok($$ select approve_staff_member((select membership_id from shop_staff((select a from v)) where email = 'manager@example.com')) $$, 'and the seller approves them');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000104');
set local role authenticated;
select throws_ok($$ select invite_staff((select a from v), 'x2@example.com', array['products.delete']) $$, '42501', 'NOT_AUTHORIZED', 'a manager cannot give what they do not hold');
select lives_ok($$ select invite_staff((select a from v), 'x3@example.com', array['products.edit']) $$, 'they can give what they hold');
select throws_ok($$ select set_staff_permissions((select id from m), array['products.edit']) $$, '42501', 'NOT_AUTHORIZED', 'or take away what they do not hold');
select throws_ok($$ select invite_staff((select b from v), 'x4@example.com') $$, '42501', null, 'and they reach no other shop');
reset role;
create temp table me as select id from seller_staff_memberships where user_id = '00000000-0000-4000-8000-000000000104';
grant select on me to authenticated;
select pg_temp.act_as('00000000-0000-4000-8000-000000000104');
set local role authenticated;
select throws_ok($$ select set_staff_permissions((select id from me), array['staff.manage', 'products.edit']) $$, '42501', 'CANNOT_CHANGE_OWN_ACCESS', 'a manager cannot change their own permissions');
select throws_ok($$ select set_staff_status((select id from me), 'active') $$, '42501', 'CANNOT_CHANGE_OWN_ACCESS', 'or their own status');
reset role;

-- Either gate closing ends access on its own.
select pg_temp.act_as('00000000-0000-4000-8000-000000000101');
set local role authenticated;
select lives_ok($$ select set_staff_status((select id from m), 'suspended') $$, 'the seller suspends them');
select throws_ok($$ select set_staff_status((select id from m), 'suspended') $$, '55000', 'INVALID_STATUS_CHANGE', 'repeating it is refused');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000103');
set local role authenticated;
select is_empty($$ select 1 from products $$, 'a suspended member sees nothing');
select throws_ok($$ select publish_product((select pa from v)) $$, '42501', null, 'and can do nothing');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000101');
set local role authenticated;
select lives_ok($$ select set_staff_status((select id from m), 'active') $$, 'the seller restores them');
reset role;
update user_roles set status = 'suspended' where user_id = '00000000-0000-4000-8000-000000000103' and role_key = 'seller_staff';
select pg_temp.act_as('00000000-0000-4000-8000-000000000103');
set local role authenticated;
select is_empty($$ select 1 from products $$, 'suspending the platform role ends access too, membership or not');
reset role;
update user_roles set status = 'active' where user_id = '00000000-0000-4000-8000-000000000103' and role_key = 'seller_staff';
update sellers set status = 'suspended' where id = (select a from v);
select pg_temp.act_as('00000000-0000-4000-8000-000000000103');
set local role authenticated;
select is_empty($$ select 1 from products $$, 'and so does the shop being suspended');
select throws_ok($$ select publish_product((select pa from v)) $$, '42501', null, 'with nothing allowed');
reset role;
update sellers set status = 'active' where id = (select a from v);

-- Removing, and coming back with only what is newly offered.
select pg_temp.act_as('00000000-0000-4000-8000-000000000101');
set local role authenticated;
select lives_ok($$ select set_staff_status((select id from m), 'removed') $$, 'the seller removes them');
select throws_ok($$ select set_staff_status((select id from m), 'active') $$, 'P0002', 'MEMBERSHIP_NOT_FOUND', 'a removal cannot simply be undone');
select is_empty($$ select 1 from shop_staff((select a from v)) where email = 'staff@example.com' $$, 'they leave the list');
delete from inv;
insert into inv select invite_staff((select a from v), 'staff@example.com', array['products.edit']);
reset role;
select is((select count(*)::int from background_jobs where payload ->> 'template' = 'staff_removed'), 1, 'they were told');
select pg_temp.act_as('00000000-0000-4000-8000-000000000103');
set local role authenticated;
select is_empty($$ select 1 from products $$, 'until they accept, they have nothing');
select lives_ok($$ select accept_staff_invitation((select id from inv)) $$, 'they accept the new invitation');
select is_empty($$ select 1 from products $$, 'coming back needs approving again');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000101');
set local role authenticated;
select lives_ok($$ select approve_staff_member((select id from m)) $$, 'the seller approves them again');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000103');
set local role authenticated;
select results_eq($$ select permissions from shop_access((select a from v)) $$, $$ values (array['products.edit']) $$, 'they have only what is newly offered');
select lives_ok($$ select leave_staff_shop((select id from m)) $$, 'they can leave whenever they choose');
select is_empty($$ select 1 from products $$, 'and then have nothing');
select throws_ok($$ select leave_staff_shop((select id from m)) $$, 'P0002', 'MEMBERSHIP_NOT_FOUND', 'leaving twice is refused');
reset role;

-- Invitations end properly.
select pg_temp.act_as('00000000-0000-4000-8000-000000000101');
set local role authenticated;
delete from inv;
insert into inv select invite_staff((select a from v), 'stranger@example.com');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000105');
set local role authenticated;
select lives_ok($$ select decline_staff_invitation((select id from inv)) $$, 'someone can decline');
select throws_ok($$ select accept_staff_invitation((select id from inv)) $$, '55000', 'INVITATION_NOT_PENDING', 'and cannot then accept');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000101');
set local role authenticated;
delete from inv;
insert into inv select invite_staff((select a from v), 'stranger@example.com');
select lives_ok($$ select cancel_staff_invitation((select id from inv)) $$, 'a seller can cancel');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000105');
set local role authenticated;
select throws_ok($$ select accept_staff_invitation((select id from inv)) $$, '55000', 'INVITATION_NOT_PENDING', 'a cancelled invitation cannot be accepted');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000101');
set local role authenticated;
delete from inv;
insert into inv select invite_staff((select a from v), 'stranger@example.com');
reset role;
update seller_invitations set expires_at = now() - interval '1 day' where id = (select id from inv);
select pg_temp.act_as('00000000-0000-4000-8000-000000000105');
set local role authenticated;
select is_empty($$ select 1 from my_staff_invitations() $$, 'an expired invitation disappears');
select throws_ok($$ select accept_staff_invitation((select id from inv)) $$, '55000', 'INVITATION_NOT_PENDING', 'and cannot be accepted');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000101');
set local role authenticated;
select lives_ok($$ select invite_staff((select a from v), 'stranger@example.com') $$, 'and a new one can replace it');

-- A shop cannot use invitations to email strangers without limit.
delete from inv;
reset role;
update platform_settings set value = '1' where key = 'staff.max_invitations_per_hour';
delete from rate_limit_counters;
select pg_temp.act_as('00000000-0000-4000-8000-000000000102');
set local role authenticated;
select lives_ok($$ select invite_staff((select b from v), 'one@example.com') $$, 'the first invitation goes');
select throws_ok($$ select invite_staff((select b from v), 'two@example.com') $$, 'P0001', 'RATE_LIMITED', 'going past the limit is refused');
reset role;
select is_empty($$ select 1 from seller_invitations where invitee_email = 'two@example.com' $$, 'and nothing is saved');

-- Declining someone who accepted.
select pg_temp.act_as('00000000-0000-4000-8000-000000000102');
set local role authenticated;
select is((select count(*)::int from shop_staff((select b from v))), 0, 'nobody is on this shop''s staff yet');
reset role;

-- A seller cannot undo Super Admin taking the role away.
update user_roles set status = 'suspended' where user_id = '00000000-0000-4000-8000-000000000103' and role_key = 'seller_staff';
delete from rate_limit_counters;
update platform_settings set value = '10' where key = 'staff.max_invitations_per_hour';
select pg_temp.act_as('00000000-0000-4000-8000-000000000102');
set local role authenticated;
delete from inv;
insert into inv select invite_staff((select b from v), 'staff@example.com');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000103');
set local role authenticated;
select lives_ok($$ select accept_staff_invitation((select id from inv)) $$, 'someone whose role is suspended accepts elsewhere');
reset role;
create temp table m2 as select id from seller_staff_memberships where user_id = '00000000-0000-4000-8000-000000000103' and seller_id = '00000000-0000-4000-8000-000000000a02';
grant select on m2 to authenticated;
select pg_temp.act_as('00000000-0000-4000-8000-000000000102');
set local role authenticated;
select throws_ok($$ select approve_staff_member((select id from m2)) $$, '55000', 'STAFF_ROLE_BLOCKED', 'the seller cannot approve them over Super Admin');
select lives_ok($$ select set_staff_status((select id from m2), 'removed') $$, 'the seller can decline them');
select is((select count(*)::int from shop_staff((select b from v))), 0, 'and they leave the list');
reset role;
select is((select status from user_roles where user_id = '00000000-0000-4000-8000-000000000103' and role_key = 'seller_staff'), 'suspended', 'the suspension stands');

-- Nobody applies to Super Admin for this role now.
select pg_temp.act_as('00000000-0000-4000-8000-000000000105');
set local role authenticated;
select throws_ok($$ select submit_role_application('seller_staff', '{"seller_name": "Shop A"}') $$, '23514', null, 'applying for Seller Staff is refused');
reset role;

select * from finish();
rollback;
