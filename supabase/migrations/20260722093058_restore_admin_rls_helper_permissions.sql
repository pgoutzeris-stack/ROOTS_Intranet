-- Keep the current-user admin lookup available to authenticated RLS policies
-- without exposing it to anonymous callers. The explicit empty search_path
-- prevents object shadowing in this SECURITY DEFINER helper.
create or replace function users.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select p.app_role = 'admin'
      from users.profiles as p
      where p.id = (select auth.uid())
    ),
    false
  );
$$;

revoke all on function users.is_current_user_admin() from public, anon;
grant execute on function users.is_current_user_admin() to authenticated, service_role;

-- Authenticated directory reads are already covered by
-- profiles_authenticated_directory_read. These two policies were redundant,
-- and the onboarding policy called a helper whose execute grant was removed.
drop policy if exists profiles_select_admin on users.profiles;
drop policy if exists profiles_select_onboarding_manager on users.profiles;
