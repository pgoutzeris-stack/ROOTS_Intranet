-- New users may only be created through an admin invitation or an explicitly
-- marked service-role provisioning flow. This is defense in depth for the
-- hosted Auth setting that controls public email signups.
drop trigger if exists on_auth_user_created_confirm on auth.users;
drop function if exists public.auto_confirm_email();

create or replace function users.reject_uninvited_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.invited_at is null
     and coalesce(
       new.raw_app_meta_data ->> 'roots_admin_provisioned',
       'false'
     ) <> 'true'
  then
    raise exception 'Public user registration is disabled'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

revoke all on function users.reject_uninvited_auth_user() from public;
revoke all on function users.reject_uninvited_auth_user() from anon;
revoke all on function users.reject_uninvited_auth_user() from authenticated;

drop trigger if exists reject_uninvited_auth_user on auth.users;
create trigger reject_uninvited_auth_user
before insert on auth.users
for each row
execute function users.reject_uninvited_auth_user();

-- Missing tool settings must never grant access. Explicit JSON null remains
-- the existing representation for "all tools" assigned by an administrator.
create or replace function app_private.can_access_tool(tool_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((
    select case
      when p.app_role = 'admin' then true
      when not (coalesce(p.app_settings, '{}'::jsonb) ? 'allowed_tools') then false
      when p.app_settings -> 'allowed_tools' = 'null'::jsonb then true
      else coalesce((p.app_settings -> 'allowed_tools') ? tool_id, false)
    end
    from users.profiles as p
    where p.id = (select auth.uid())
  ), false);
$function$;

create or replace function app_private.can_edit_tool(tool_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((
    select p.app_role in ('admin', 'editor', 'member')
       and case
         when not (coalesce(p.app_settings, '{}'::jsonb) ? 'allowed_tools') then false
         when p.app_settings -> 'allowed_tools' = 'null'::jsonb then true
         else coalesce((p.app_settings -> 'allowed_tools') ? tool_id, false)
       end
    from users.profiles as p
    where p.id = (select auth.uid())
  ), false);
$function$;

create or replace function users.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'users', 'public'
as $function$
begin
  insert into users.profiles (
    id,
    email,
    full_name,
    app_role,
    app_settings
  )
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      split_part(new.email, '@', 1)
    ),
    'reader',
    jsonb_build_object('allowed_tools', '[]'::jsonb)
  )
  on conflict (id) do nothing;

  return new;
end;
$function$;

-- Profile images are rendered in several static clients. Restrict the stored
-- value as well as escaping it in the client so it cannot break out of src="".
alter table users.profiles
  drop constraint if exists profiles_avatar_url_safe;

alter table users.profiles
  add constraint profiles_avatar_url_safe
  check (
    avatar_url is null
    or btrim(avatar_url) = ''
    or (
      avatar_url ~ '^https://'
      and avatar_url !~ '[<>"''`[:cntrl:][:space:]]'
    )
  );
