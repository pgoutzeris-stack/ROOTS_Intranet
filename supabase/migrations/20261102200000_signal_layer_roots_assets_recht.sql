-- Signal Layer: LinkedIn-Assets unter dem Absender ROOTS darf nur anlegen,
-- wer app_settings.signal_layer_roots_assets = true traegt. Setzen duerfen
-- das nur Admins (Nutzerverwaltung), genau wie allowed_tools. Ohne diesen
-- Schutz koennte sich jeder ueber die eigene Profilzeile freischalten.

-- Startwert zuerst: Jannik Mueller steuert die ROOTS-LinkedIn-Assets. Danach
-- greift der verschaerfte Schutz, der diese Zeile ohne Admin-Sitzung ablehnt.
update users.profiles
set app_settings = coalesce(app_settings, '{}'::jsonb) || jsonb_build_object('signal_layer_roots_assets', true)
where lower(email) = 'jmueller@roots-consultants.com';

create or replace function users.prevent_role_escalation()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  caller_is_admin boolean := users.is_current_user_admin();
  other_admin_count integer;
begin
  if not caller_is_admin then
    if new.id is distinct from old.id
       or new.email is distinct from old.email
       or new.hourly_rate is distinct from old.hourly_rate
       or new.weekly_hours is distinct from old.weekly_hours
       or new.app_role is distinct from old.app_role
       or new.urlaubstage is distinct from old.urlaubstage
       or new.urlaubstage_jahr is distinct from old.urlaubstage_jahr
       or new.kuerzel is distinct from old.kuerzel
       or new.personal_id is distinct from old.personal_id
       or new.salutation is distinct from old.salutation
       or new.first_name is distinct from old.first_name
       or new.last_name is distinct from old.last_name
       or new.birthday is distinct from old.birthday
       or new.start_date is distinct from old.start_date
       or new.phone is distinct from old.phone
       or new.reporting_line_id is distinct from old.reporting_line_id
       or new.mentor_id is distinct from old.mentor_id
       or (coalesce(new.app_settings,'{}'::jsonb) -> 'allowed_tools')
          is distinct from
          (coalesce(old.app_settings,'{}'::jsonb) -> 'allowed_tools')
       or (coalesce(new.app_settings,'{}'::jsonb) -> 'signal_layer_roots_assets')
          is distinct from
          (coalesce(old.app_settings,'{}'::jsonb) -> 'signal_layer_roots_assets')
    then
      raise exception 'Sensitive profile fields may only be changed by administrators'
        using errcode = '42501';
    end if;
  end if;

  if old.app_role = 'admin' and new.app_role is distinct from 'admin' then
    select count(*) into other_admin_count
    from users.profiles
    where app_role = 'admin' and id <> old.id;
    if other_admin_count = 0 then
      raise exception 'Der letzte Admin kann nicht degradiert werden';
    end if;
  end if;

  return new;
end;
$function$;
