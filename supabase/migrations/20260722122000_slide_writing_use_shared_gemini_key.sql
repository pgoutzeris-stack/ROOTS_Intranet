create or replace function public.slide_writing_read_ai_key()
returns text
language sql
stable
security definer
set search_path to ''
as $function$
  select decrypted_secret
  from vault.decrypted_secrets
  where name in ('slide_writing_gemini_api_key', 'image_generation_google_api_key')
  order by
    case when name = 'slide_writing_gemini_api_key' then 0 else 1 end,
    updated_at desc nulls last,
    created_at desc
  limit 1;
$function$;

create or replace function public.slide_writing_ai_key_configured()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from vault.secrets
    where name in ('slide_writing_gemini_api_key', 'image_generation_google_api_key')
  );
$function$;

revoke all on function public.slide_writing_read_ai_key() from public, anon, authenticated;
revoke all on function public.slide_writing_ai_key_configured() from public, anon, authenticated;
grant execute on function public.slide_writing_read_ai_key() to service_role;
grant execute on function public.slide_writing_ai_key_configured() to service_role;
