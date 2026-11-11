begin;
alter table public.editorial_items add column schedule_state text not null default 'none' check(schedule_state in ('none','pending','scheduled','uncertain','failed','completed'));
create table public.editorial_scheduling (
 id uuid primary key default gen_random_uuid(),item_id uuid not null references public.editorial_items(id),item_version integer not null,
 actor uuid not null references auth.users(id),snapshot jsonb not null,content_hash text not null,
 suggested_for timestamptz not null,account_ids bigint[] not null,
 state text not null default 'preview' check(state in ('preview','checking','submitting','scheduled','uncertain','failed','completed')),
 expires_at timestamptz not null default now()+interval '10 minutes',external_id text,result jsonb,error text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index editorial_scheduling_one_delivery on public.editorial_scheduling(item_id) where state in ('checking','submitting','scheduled','uncertain','completed');
create index editorial_scheduling_when on public.editorial_scheduling(suggested_for) where state in ('checking','submitting','scheduled','uncertain');
alter table public.editorial_scheduling enable row level security;
revoke all on public.editorial_scheduling from anon,authenticated;
grant all on public.editorial_scheduling to service_role;

create function public.editorial_claim_schedule(p_preview uuid,p_actor uuid,p_when timestamptz,p_accounts bigint[]) returns jsonb
 language plpgsql security invoker set search_path='' as $$
declare s public.editorial_scheduling;i public.editorial_items;local_time time;
begin
 perform pg_catalog.pg_advisory_xact_lock(9110,1);
 select * into s from public.editorial_scheduling where id=p_preview for update;
 if not found or s.actor<>p_actor then raise exception 'معاينة الجدولة غير موجودة';end if;
 if s.state<>'preview' then return jsonb_build_object('existing',true,'id',s.id,'state',s.state,'externalId',s.external_id);end if;
 if s.expires_at<now() then raise exception 'انتهت المعاينة؛ افتح النافذة مجددًا';end if;
 select * into i from public.editorial_items where id=s.item_id for update;
 if i.version<>s.item_version or i.status not in ('draft','approved') or i.schedule_state not in ('none','failed') then raise exception 'تغيرت المادة أو لها عملية جدولة قائمة';end if;
 if not exists(select 1 from public.editorial_plans p where p.id=i.plan_id and p.status='active' and (p_when at time zone 'Asia/Riyadh')::date between p.start_date and p.end_date) then raise exception 'اختر موعدًا داخل الخطة النشطة';end if;
 if p_accounts is null or cardinality(p_accounts)=0 or not(p_accounts <@ s.account_ids) then raise exception 'قنوات الجدولة لا تطابق المعاينة';end if;
 local_time:=(p_when at time zone 'Asia/Riyadh')::time;
 if p_when<now()+interval '1 minute' or local_time<time '20:00' or local_time>time '23:00' then raise exception 'اختر موعدًا مستقبليًا بين 8 و11 مساءً';end if;
 if exists(select 1 from public.editorial_scheduling other where other.item_id<>i.id and other.state in ('checking','submitting','scheduled','uncertain') and abs(extract(epoch from other.suggested_for-p_when))<3600) then raise exception 'يوجد تعارض مع جدولة أخرى؛ اترك ساعة بين المنشورات';end if;
 update public.editorial_scheduling set state='checking',suggested_for=p_when,account_ids=p_accounts,updated_at=now() where id=s.id;
 update public.editorial_items set status='approved',approved_at=now(),approved_by=p_actor,schedule_state='pending',updated_at=now(),notice='اعتمد المالك النص والتصميم والموعد؛ جارٍ إرسال الجدولة' where id=i.id;
 return jsonb_build_object('existing',false,'id',s.id,'state','checking');
end $$;
revoke all on function public.editorial_claim_schedule(uuid,uuid,timestamptz,bigint[]) from public,anon,authenticated;
grant execute on function public.editorial_claim_schedule(uuid,uuid,timestamptz,bigint[]) to service_role;

-- A generation retry cannot race a delivery approved in another browser tab.
create or replace function public.editorial_claim_item(p_item uuid,p_token uuid) returns boolean language plpgsql security invoker set search_path='' as $$
declare i public.editorial_items;begin
 select * into i from public.editorial_items where id=p_item for update;
 if not found or not exists(select 1 from public.editorial_plans p where p.id=i.plan_id and p.status='active' and i.day between p.start_date and p.end_date) then return false;end if;
 if i.schedule_state not in ('none','failed') or i.status in ('approved','published') or (i.status='generating' and i.generation_started_at>now()-interval '20 minutes') or (i.generated_at is not null and i.status='draft') then return false;end if;
 update public.editorial_items set status='generating',generation_token=p_token,generation_started_at=now(),updated_at=now(),error=null where id=i.id;
 return true;
end $$;
-- Source sync at 07:45 and generation at 08:00 Asia/Riyadh, for same-day review.
select cron.schedule('first1saudi-plan-source-sync','45 4 * * *',$job$select public.editorial_call_scheduler('sync');$job$);
select cron.schedule('first1saudi-plan-daily-drafts','0 5 * * *',$job$select public.editorial_call_scheduler('generate');$job$);
commit;
