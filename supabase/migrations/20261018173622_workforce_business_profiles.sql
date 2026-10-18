-- Public cards are explicit allowlisted snapshots, never projections of HR records.
create table public.wf_card_company (
 id boolean primary key default true check(id), name text not null default 'تواصل النخبة',
 tagline text not null default 'اترك أثراً دائماً..', website text not null default 'https://nukhba.media',
 email text not null default '', phone text not null default '', address text not null default '',
 version integer not null default 1
);
insert into public.wf_card_company(id) values(true);
create table public.wf_business_profiles (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 slug uuid not null unique default gen_random_uuid(),
 display_name text not null default '', job_title text not null default '',
 work_email text not null default '', work_phone text not null default '',
 socials jsonb not null default '{}' check(jsonb_typeof(socials)='object'),
 published jsonb, issued_at timestamptz, updated_at timestamptz not null default now(),
 version integer not null default 1,
 check((published is null)=(issued_at is null))
);
alter table public.wf_card_company enable row level security;
alter table public.wf_business_profiles enable row level security;
revoke all on public.wf_card_company,public.wf_business_profiles from public,anon,authenticated;
grant select on public.wf_card_company,public.wf_business_profiles to authenticated;
grant all on public.wf_card_company,public.wf_business_profiles to service_role;
create policy wf_card_company_read on public.wf_card_company for select to authenticated
 using((select workforce_private.is_admin()) or (select workforce_private.employee_id()) is not null);
create policy wf_business_profiles_own on public.wf_business_profiles for select to authenticated
 using(user_id=(select auth.uid()) and ((select workforce_private.is_admin()) or (select workforce_private.employee_id()) is not null));

create function public.wf_business_card_command(p_actor uuid,p_version integer,p_command text,p_data jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare emp uuid; r public.wf_business_profiles; c public.wf_card_company; k text; v text; nm text; jt text;
begin
 emp:=workforce_private.assert_task_actor(p_actor);
 if jsonb_typeof(p_data) is distinct from 'object' then raise sqlstate 'PT400' using message='تحقق من بيانات البطاقة'; end if;
 if p_command='company' then
  if emp is not null then raise insufficient_privilege; end if;
  select * into c from public.wf_card_company where id for update;
  if c.version is distinct from p_version then raise sqlstate 'PT409' using message='تغيرت بيانات الشركة؛ حدّث الصفحة'; end if;
  if length(btrim(coalesce(p_data->>'name',''))) not between 1 and 70
   or length(coalesce(p_data->>'tagline',''))>100 or length(coalesce(p_data->>'website',''))>200
   or coalesce(p_data->>'website','') !~ '^https://[^[:space:]]+$'
   or length(coalesce(p_data->>'email',''))>120 or length(coalesce(p_data->>'phone',''))>30
   or length(coalesce(p_data->>'address',''))>150 then raise sqlstate 'PT400' using message='تحقق من بيانات الشركة'; end if;
  update public.wf_card_company set name=btrim(p_data->>'name'),tagline=coalesce(p_data->>'tagline',''),website=p_data->>'website',
   email=coalesce(p_data->>'email',''),phone=coalesce(p_data->>'phone',''),address=coalesce(p_data->>'address',''),version=version+1 where id returning * into c;
  return to_jsonb(c);
 end if;
 -- Serializes first save as well as versioned issuance and revocation.
 perform pg_advisory_xact_lock(hashtextextended('business-card:'||p_actor::text,0));
 select * into r from public.wf_business_profiles where user_id=p_actor for update;
 if coalesce(r.version,0) is distinct from p_version then raise sqlstate 'PT409' using message='تغيرت البطاقة؛ حدّث الصفحة ثم حاول مجددًا'; end if;
 if p_command='save' then
  nm:=btrim(coalesce(p_data->>'display_name','')); jt:=btrim(coalesce(p_data->>'job_title',''));
  if emp is not null then select full_name,job_title into nm,jt from public.wf_employees where id=emp; end if;
  if length(coalesce(nm,'')) not between 1 and 70 or length(coalesce(jt,'')) not between 1 and 80
   or length(coalesce(p_data->>'work_email',''))>120 or length(coalesce(p_data->>'work_phone',''))>30
   or jsonb_typeof(coalesce(p_data->'socials','{}')) is distinct from 'object'
   then raise sqlstate 'PT400' using message='أدخل الاسم والمسمى الوظيفي وبيانات تواصل صحيحة'; end if;
  for k,v in select * from jsonb_each_text(coalesce(p_data->'socials','{}')) loop
   if k not in ('linkedin','instagram','x','snapchat','tiktok','facebook','youtube','whatsapp','website')
    or length(v)>500 or v !~ '^https://[^[:space:]]+$' then raise sqlstate 'PT400' using message='تحقق من روابط التواصل'; end if;
  end loop;
  insert into public.wf_business_profiles(user_id,display_name,job_title,work_email,work_phone,socials)
   values(p_actor,nm,jt,coalesce(p_data->>'work_email',''),coalesce(p_data->>'work_phone',''),coalesce(p_data->'socials','{}'))
  on conflict(user_id) do update set display_name=excluded.display_name,job_title=excluded.job_title,work_email=excluded.work_email,
   work_phone=excluded.work_phone,socials=excluded.socials,version=public.wf_business_profiles.version+1,updated_at=now() returning * into r;
 elsif p_command='issue' then
  if r.user_id is null or r.socials='{}' then raise sqlstate 'PT400' using message='احفظ رابط تواصل واحدًا على الأقل قبل إصدار البطاقة'; end if;
  nm:=r.display_name; jt:=r.job_title;
  if emp is not null then select full_name,job_title into nm,jt from public.wf_employees where id=emp; end if;
  select * into c from public.wf_card_company where id;
  update public.wf_business_profiles set published=jsonb_build_object('name',nm,'title',jt,'email',r.work_email,'phone',r.work_phone,'socials',r.socials,
   'company',jsonb_build_object('name',c.name,'tagline',c.tagline,'website',c.website,'email',c.email,'phone',c.phone,'address',c.address)),
   issued_at=now(),updated_at=now(),version=version+1 where user_id=p_actor returning * into r;
 elsif p_command='revoke' then
  if r.user_id is null then raise no_data_found; end if;
  update public.wf_business_profiles set published=null,issued_at=null,slug=gen_random_uuid(),updated_at=now(),version=version+1 where user_id=p_actor returning * into r;
 else raise sqlstate 'PT400' using message='الإجراء غير متاح';
 end if;
 return to_jsonb(r);
end $$;
revoke all on function public.wf_business_card_command(uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.wf_business_card_command(uuid,integer,text,jsonb) to service_role;

create function public.wf_public_business_card(p_slug uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select b.published from public.wf_business_profiles b where b.slug=p_slug and b.issued_at is not null
 and workforce_private.notification_recipient_active(b.user_id)
$$;
revoke all on function public.wf_public_business_card(uuid) from public,anon,authenticated;
grant execute on function public.wf_public_business_card(uuid) to service_role;
