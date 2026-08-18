alter table public.request_recovery_drafts
  drop constraint if exists request_recovery_drafts_user_id_fkey;

alter table public.request_recovery_drafts
  add constraint request_recovery_drafts_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.request_recovery_drafts
  alter column user_id set not null;
