begin;
create function public.editorial_save_revision(p_plan uuid,p_revision integer,p_values jsonb,p_actor uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.editorial_plans; item public.editorial_items; d jsonb; s jsonb; next_proposal jsonb:=p_values->'proposal'; local_today date:=(now() at time zone 'Asia/Riyadh')::date; result jsonb;
begin
 perform pg_catalog.pg_advisory_xact_lock(9109,1);
 select * into p from public.editorial_plans where id=p_plan for update;
 if not found or p.status='archived' or p.revision<>p_revision then raise exception 'تغيرت الخطة أو أصبحت مؤرشفة؛ أعد تحميلها';end if;
 if p.status<>'draft' then
  if (p_values->>'start_date')::date<>p.start_date then raise exception 'لا يتغير تاريخ بداية خطة بدأت';end if;
  if exists(select 1 from public.editorial_items i where i.plan_id=p.id and i.status='published' and i.day>(p_values->>'end_date')::date) then raise exception 'لا تقصر الخطة دون تاريخ مادة منشورة';end if;
    for d in select value from jsonb_array_elements(p.proposal->'days') where (value->>'date')::date<=local_today or exists(select 1 from public.editorial_items i where i.plan_id=p.id and i.day=(value->>'date')::date and i.status='published') loop
     if not exists(select 1 from jsonb_array_elements(next_proposal->'days') nextday where nextday=d) then raise exception 'لا تعدل يومًا مضى أو مادة منشورة';end if;
    end loop;
 end if;
 update public.editorial_plans set name=p_values->>'name',start_date=(p_values->>'start_date')::date,end_date=(p_values->>'end_date')::date,
  times=array(select jsonb_array_elements_text(p_values->'times')),instructions=p_values->>'instructions',proposal=next_proposal,
  attachment_path=coalesce(p_values->>'attachment_path',attachment_path),attachment_name=coalesce(p_values->>'attachment_name',attachment_name),revision=p.revision+1,updated_at=now()
 where id=p.id;
 insert into public.editorial_plan_revisions(plan_id,revision,instructions,proposal,created_by) values(p.id,p.revision+1,p_values->>'instructions',next_proposal,p_actor);
 if p.status<>'draft' then
  for item in select * from public.editorial_items where plan_id=p.id and day>local_today and status<>'published' for update loop
   select value into d from jsonb_array_elements(next_proposal->'days') where value->>'date'=item.day::text;
   s:=d->'slots'->item.slot;
   if s is null then
    update public.editorial_items set history=history||jsonb_build_array(jsonb_build_object('reason','تعديل الخطة للأيام القادمة','at',now(),'snapshot',to_jsonb(item)-'history')),status='held',notice='أزيل الموعد من الخطة؛ بقي المحتوى محفوظًا',version=version+1,generation_token=null,updated_at=now() where id=item.id;
   else
    update public.editorial_items set history=history||jsonb_build_array(jsonb_build_object('reason','تعديل الخطة للأيام القادمة','at',now(),'snapshot',to_jsonb(item)-'history')),
     post_type=s->>'type',phase=d->>'phase',brief=s,scheduled_at=(item.day::text||'T'||(s->>'time')||':00+03:00')::timestamptz,status='draft',copy=null,analysis=null,concepts=null,design_urls='{}',source_ids='{}',generated_at=null,approved_at=null,approved_by=null,generation_token=null,error=null,notice='تغيرت إرشادات هذا اليوم؛ يلزم إعداد واعتماد جديدان',version=version+1,updated_at=now() where id=item.id;
   end if;
  end loop;
 end if;
 select to_jsonb(saved) into result from public.editorial_plans saved where id=p.id;return result;
end $$;
revoke all on function public.editorial_save_revision(uuid,integer,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.editorial_save_revision(uuid,integer,jsonb,uuid) to service_role;

create or replace function public.editorial_reserve_sources(p_item uuid,p_token uuid,p_sources uuid[]) returns boolean language plpgsql security invoker set search_path='' as $$
declare i public.editorial_items; begin
 perform pg_catalog.pg_advisory_xact_lock(9109,2);
 select * into i from public.editorial_items where id=p_item and generation_token=p_token and status='generating' for update;
 if not found or cardinality(p_sources)=0 then return false;end if;
 if exists(select 1 from unnest(p_sources) s(id) left join public.editorial_sources n on n.id=s.id where n.id is null or n.status='excluded') then return false;end if;
 if i.post_type<>'quote' then
  if exists(select 1 from public.editorial_items other join public.editorial_plans p on p.id=other.plan_id where other.id<>i.id and other.source_ids&&p_sources and other.post_type<>'quote' and abs(other.day-i.day)<30 and (other.status='published' or (p.status in ('active','paused') and other.status in ('generating','draft','approved')))) then return false;end if;
  if exists(select 1 from public.editorial_sources s cross join public.postpulse_posts legacy where s.id=any(p_sources)
   and lower(coalesce(legacy.status,'')) not in ('failed','cancelled','canceled','draft','media_import_failed')
   and abs(((coalesce(legacy.scheduled_for,legacy.created_at) at time zone 'Asia/Riyadh')::date)-i.day)<30
   and (strpos(coalesce(legacy.content,''),regexp_replace(s.url,'^https?://(www\.)?first1saudi\.net',''))>0
     or exists(select 1 from public.social_schedule old where old.wp_post_id=s.wp_post_id and old.design_image_url=legacy.design_url))) then return false;end if;
 end if;
 update public.editorial_items set source_ids=p_sources,updated_at=now() where id=i.id;return true;
end $$;
commit;
