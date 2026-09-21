create table if not exists shared.ai_provider_usage (
  id uuid primary key default gen_random_uuid(),
  app text not null,
  operation text not null,
  provider text not null,
  model text not null,
  status text not null check (status in ('success', 'error', 'incomplete')),
  user_id uuid null,
  request_id text null,
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  cached_input_tokens bigint not null default 0 check (cached_input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  thinking_tokens bigint not null default 0 check (thinking_tokens >= 0),
  total_tokens bigint generated always as
    (input_tokens + cached_input_tokens + output_tokens + thinking_tokens) stored,
  search_query_count integer not null default 0 check (search_query_count >= 0),
  image_count integer not null default 0 check (image_count >= 0),
  provider_cost numeric null,
  currency text null,
  duration_ms integer null,
  error_code text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_provider_usage_created_at_idx
  on shared.ai_provider_usage (created_at desc);
create index if not exists ai_provider_usage_app_model_idx
  on shared.ai_provider_usage (app, model, created_at desc);
create unique index if not exists ai_provider_usage_request_id_idx
  on shared.ai_provider_usage (request_id) where request_id is not null;

alter table shared.ai_provider_usage enable row level security;
revoke all on shared.ai_provider_usage from anon, authenticated, public;
grant all on shared.ai_provider_usage to service_role;

comment on table shared.ai_provider_usage is
  'Append-only provider usage ledger for every ROOTS Intranet AI call. Written by service-role Edge Functions.';
