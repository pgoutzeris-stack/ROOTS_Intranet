-- Remove the legacy single-workspace membership model.
-- Team membership now comes directly from users.profiles.

drop view if exists public.workspace_members;
drop view if exists public.workspaces;

drop policy if exists profiles_select_workspace on users.profiles;
drop policy if exists profile_images_select_workspace on users.profile_images;
drop policy if exists wm_select on users.workspace_members;
drop policy if exists workspaces_read_members on users.workspaces;

create policy profiles_select_authenticated
  on users.profiles
  for select
  using (auth.role() = 'authenticated');

create policy profile_images_select_authenticated
  on users.profile_images
  for select
  using (auth.role() = 'authenticated');

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'users', 'public', 'pg_temp'
as $function$
begin
  if new.email is null or lower(trim(split_part(new.email, '@', 2))) <> 'roots-consultants.com' then
    raise exception 'Nur firmeninterne E-Mail-Adressen (@roots-consultants.com) sind erlaubt.';
  end if;

  insert into users.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do update
    set email = excluded.email;

  return new;
end;
$function$;

create or replace function users.upsert_roots_team_member(
  p_email text,
  p_full_name text,
  p_position text,
  p_linkedin_url text,
  p_avatar_url text
)
returns uuid
language sql
security definer
set search_path to 'users', 'auth', 'public', 'extensions'
as $function$
  select users.upsert_roots_team_member(
    p_email,
    p_full_name,
    p_position,
    p_linkedin_url,
    p_avatar_url,
    'reader'
  );
$function$;

create or replace function users.upsert_roots_team_member(
  p_email text,
  p_full_name text,
  p_position text,
  p_linkedin_url text,
  p_avatar_url text,
  p_app_role text default 'reader'
)
returns uuid
language plpgsql
security definer
set search_path to 'users', 'auth', 'public', 'extensions'
as $function$
declare
  v_user_id uuid;
  v_now timestamptz := now();
  v_role text := lower(coalesce(p_app_role, 'reader'));
begin
  if v_role not in ('admin', 'reader', 'member') then
    raise exception 'Ungültige app_role: % (erlaubt: admin, reader, member)', p_app_role;
  end if;

  if p_email is null or lower(trim(split_part(p_email, '@', 2))) <> 'roots-consultants.com' then
    raise exception 'Nur @roots-consultants.com E-Mail-Adressen sind erlaubt.';
  end if;

  select id into v_user_id from auth.users where lower(email) = lower(trim(p_email));

  if v_user_id is null then
    v_user_id := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email,
      encrypted_password,
      email_confirmed_at,
      confirmation_token, recovery_token,
      email_change, email_change_token_new, email_change_token_current,
      reauthentication_token, phone_change, phone_change_token,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      is_sso_user, is_anonymous
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated', 'authenticated',
      lower(trim(p_email)),
      extensions.crypt(encode(extensions.gen_random_bytes(24), 'hex'), extensions.gen_salt('bf')),
      v_now,
      '', '', '', '', '', '', '', '',
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object('full_name', p_full_name, 'email_verified', true),
      v_now, v_now,
      false, false
    );

    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_user_id, v_user_id::text,
      jsonb_build_object('sub', v_user_id::text, 'email', lower(trim(p_email)), 'email_verified', true, 'phone_verified', false),
      'email', v_now, v_now, v_now
    );
  end if;

  insert into users.profiles (id, email, full_name, position, linkedin_url, avatar_url, app_role)
  values (v_user_id, lower(trim(p_email)), p_full_name, p_position, p_linkedin_url, p_avatar_url, v_role)
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    position = excluded.position,
    linkedin_url = excluded.linkedin_url,
    avatar_url = excluded.avatar_url,
    app_role = excluded.app_role,
    updated_at = v_now;

  update users.profile_images set is_primary = false, updated_at = v_now
  where user_id = v_user_id and is_primary;

  insert into users.profile_images (user_id, image_url, label, sort_order, is_primary)
  values (v_user_id, p_avatar_url, 'Profilbild', 0, true);

  return v_user_id;
end;
$function$;

drop function if exists public.user_workspace_ids();
drop function if exists users.user_workspace_ids();

drop table if exists users.workspace_members;
drop table if exists users.workspaces;
