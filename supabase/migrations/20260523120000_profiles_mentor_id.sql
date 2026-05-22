-- Onboarding-Mentor pro Mitarbeiter
alter table users.profiles
  add column if not exists mentor_id uuid references users.profiles(id) on delete set null;

comment on column users.profiles.mentor_id is 'Onboarding-Mentor (FK auf profiles)';

create or replace view public.profiles as
  select
    id,
    email,
    full_name,
    hourly_rate,
    weekly_hours,
    position,
    app_settings,
    created_at,
    updated_at,
    avatar_url,
    linkedin_url,
    app_role,
    urlaubstage,
    kuerzel,
    personal_id,
    salutation,
    first_name,
    last_name,
    birthday,
    start_date,
    phone,
    reporting_line_id,
    urlaubstage_jahr,
    mentor_id
  from users.profiles;
