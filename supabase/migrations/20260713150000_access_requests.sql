create table if not exists users.access_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  invite_sent boolean not null default false,
  meta jsonb not null default '{}'::jsonb
);

create unique index if not exists access_requests_pending_email_idx
  on users.access_requests (lower(email)) where status = 'pending';

alter table users.access_requests enable row level security;

revoke all on users.access_requests from anon, authenticated;
grant all on users.access_requests to service_role;
