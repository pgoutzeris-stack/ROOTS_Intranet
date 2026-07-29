alter table recruiting.notifications
  add column if not exists toast_shown_at timestamptz;

comment on column recruiting.notifications.toast_shown_at is
  'Serverseitiger Zustellmarker fuer einmalige Intranet-Toast-Benachrichtigungen.';

update recruiting.notifications
set toast_shown_at = now()
where toast_shown_at is null;

create index if not exists idx_notifications_user_toast_pending
  on recruiting.notifications (user_id, created_at desc)
  where read_at is null and toast_shown_at is null;
