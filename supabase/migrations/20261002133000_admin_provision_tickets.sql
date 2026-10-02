-- Admin-Einladungen scheiterten am Trigger reject_uninvited_auth_user:
-- Supabase Auth setzt invited_at und app_metadata erst nach dem Insert.
-- Die Edge Function roots-admin-users legt deshalb vorher ein kurzlebiges
-- Ticket an; nur service_role darf diese Tabelle beschreiben.
create table if not exists users.provision_tickets (
  email text primary key,
  created_by uuid,
  expires_at timestamptz not null default now() + interval '5 minutes'
);
alter table users.provision_tickets enable row level security;
revoke all on users.provision_tickets from public, anon, authenticated;
grant select, insert, update, delete on users.provision_tickets to service_role;

create or replace function users.reject_uninvited_auth_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if exists (
    select 1 from users.provision_tickets t
    where t.email = lower(new.email) and t.expires_at > now()
  ) then
    delete from users.provision_tickets where email = lower(new.email);
    return new;
  end if;

  if new.invited_at is null
     and coalesce(new.raw_app_meta_data ->> 'roots_admin_provisioned', 'false') <> 'true'
  then
    raise exception 'Public user registration is disabled'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;
