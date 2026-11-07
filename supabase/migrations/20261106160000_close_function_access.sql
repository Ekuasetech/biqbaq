-- PostgreSQL lets everyone run a new function unless told otherwise, so signed-out
-- visitors could call every function here. Each one still refused them through its
-- own check, but the permission layer should refuse first.
--
-- A default for one schema cannot remove PostgreSQL's built-in rule, so each migration
-- must revoke access to its own new functions. A database test fails if one forgets.

revoke execute on all routines in schema public from public, anon;
grant execute on all routines in schema public to authenticated;

-- Visitors only ever read through public views, which need none of this.
revoke execute on all routines in schema private from anon;
revoke usage on schema private from anon;
