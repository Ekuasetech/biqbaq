-- The blog's categories, as the owner chose them (2026-11-20): Business Psychology,
-- Entrepreneurship, Leadership, Accounting, Marketing and Human Resources Management. They
-- replace Business, Cargo, Food and Fashion. Posts in those move to Entrepreneurship (owner's
-- choice), and can be re-filed in the blog editor.

insert into public.blog_categories (slug, name_en, name_fr) values
  ('business-psychology', 'Business Psychology', 'Psychologie des affaires'),
  ('entrepreneurship', 'Entrepreneurship', 'Entrepreneuriat'),
  ('leadership', 'Leadership', 'Leadership'),
  ('accounting', 'Accounting', 'Comptabilité'),
  ('marketing', 'Marketing', 'Marketing'),
  ('human-resources-management', 'Human Resources Management', 'Gestion des ressources humaines')
on conflict (slug) do update set name_en = excluded.name_en, name_fr = excluded.name_fr;

update public.blog_posts
set category_id = (select id from public.blog_categories where slug = 'entrepreneurship')
where category_id in (select id from public.blog_categories where slug in ('business', 'cargo', 'food', 'fashion'));

delete from public.blog_categories where slug in ('business', 'cargo', 'food', 'fashion');

insert into public.audit_logs (actor_id, action, target_type, target_id, reason, metadata)
values (null, 'blog.category_create', 'blog_category', 'entrepreneurship', 'Blog categories replaced at the owner''s request',
  jsonb_build_object('added', jsonb_build_array('Business Psychology', 'Entrepreneurship', 'Leadership', 'Accounting', 'Marketing', 'Human Resources Management'),
                     'removed', jsonb_build_array('Business', 'Cargo', 'Food', 'Fashion'), 'posts_moved_to', 'Entrepreneurship'));
