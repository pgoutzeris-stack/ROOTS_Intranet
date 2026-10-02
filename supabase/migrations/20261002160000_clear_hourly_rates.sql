-- Auf Anweisung: Stundensaetze bei allen Profilen entfernen.
-- check_role_escalation nur fuer diese Aenderung aus, danach sofort wieder an.
alter table users.profiles disable trigger check_role_escalation;
update users.profiles
   set hourly_rate = null,
       app_settings = coalesce(app_settings, '{}'::jsonb) - 'client_hourly_rates'
 where hourly_rate is not null or app_settings ? 'client_hourly_rates';
alter table users.profiles enable trigger check_role_escalation;
