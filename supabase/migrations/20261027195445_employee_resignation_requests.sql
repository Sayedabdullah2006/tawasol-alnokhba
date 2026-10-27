-- Fixed-term resignation, article 79 bis. No employment/payroll deletion or automatic payout.
alter table public.wf_employee_requests drop constraint wf_employee_requests_kind_check;
alter table public.wf_employee_requests add constraint wf_employee_requests_kind_check check(kind in ('leave','permission','remote-work','expenses','advance','letter','payroll-review','attendance-correction','general','overtime','missing-hours','resignation'));
alter table public.wf_employee_requests add column resignation_details jsonb;
create unique index wf_one_pending_resignation on public.wf_employee_requests(employee_id) where kind='resignation' and status='pending';

create function workforce_private.guard_resignation() returns trigger language plpgsql set search_path='' as $$
declare e public.wf_employees;tick timestamptz:=workforce_private.work_now();
begin
 if TG_OP='UPDATE' and old.kind='resignation' then
  if current_setting('workforce.resignation_command',true) is distinct from new.id::text then raise sqlstate 'PT409' using message='استخدم إجراءات الاستقالة المخصصة';end if;
  if (new.employee_id,new.kind,new.body,new.title,new.attachments,new.created_at) is distinct from (old.employee_id,old.kind,old.body,old.title,old.attachments,old.created_at) then raise sqlstate 'PT409' using message='نموذج الاستقالة المقدم محفوظ';end if;
  return new;
 end if;
 if new.kind<>'resignation' then new.resignation_details:=null;return new;end if;
 if TG_OP<>'INSERT' or new.status<>'pending' or new.test_run_id is not null or new.starts_at is not null or new.ends_at is not null or new.amount is not null then raise sqlstate 'PT400' using message='لا يحدد طلب الاستقالة تاريخًا مؤجلًا أو مبلغًا';end if;
 select * into e from public.wf_employees where id=new.employee_id and status='active' for update;
 if not found or e.contract_end is null or e.contract_end<(tick at time zone 'Asia/Riyadh')::date then raise sqlstate 'PT409' using message='يلزم توثيق مدة العقد لدى الإدارة قبل تقديم الاستقالة؛ العقود غير المحددة لها مسار إشعار مستقل';end if;
 if exists(select 1 from public.wf_employee_requests where employee_id=new.employee_id and kind='resignation' and status='approved') then raise sqlstate 'PT409' using message='توجد استقالة مقبولة لهذا الملف؛ راجع الإدارة';end if;
 new.created_at:=tick;
 new.resignation_details:=jsonb_build_object('employee_name',e.full_name,'job_title',e.job_title,'contract_end',e.contract_end,'start_date',e.start_date,'submitted_at',tick,'withdraw_until',tick+interval '7 days','response_due',tick+interval '30 days','declaration','أتقدم باستقالتي كتابةً بإرادتي الحرة ودون إكراه، وألتزم بواجبات العمل خلال سريان العقد وتسليم ما بعهدتي.','history',jsonb_build_array(jsonb_build_object('action','submitted','at',tick,'actor',e.user_id)));
 return new;
end $$;
create trigger wf_resignation_guard before insert or update on public.wf_employee_requests for each row execute function workforce_private.guard_resignation();

create function public.wf_decide_resignation(p_id uuid,p_actor uuid,p_version integer,p_decision text,p_reason text default '',p_days integer default null) returns uuid language plpgsql security invoker set search_path='' as $$
declare r public.wf_employee_requests;tick timestamptz:=workforce_private.work_now();admin_actor boolean;d jsonb;
begin
 perform workforce_private.assert_task_actor(p_actor);
 select * into r from public.wf_employee_requests where id=p_id for update;
 if not found or r.kind<>'resignation' or r.test_run_id is not null then raise sqlstate 'PT404' using message='الطلب غير متاح';end if;
 select exists(select 1 from public.profiles where id=p_actor and role='admin') into admin_actor;
 if not admin_actor and not exists(select 1 from public.wf_employees where id=r.employee_id and user_id=p_actor) then raise insufficient_privilege;end if;
 if r.version<>p_version or r.status<>'pending' then raise sqlstate 'PT409' using message='تغير الطلب؛ حدّث القائمة';end if;
 d:=r.resignation_details;
 if tick>=(d->>'response_due')::timestamptz then raise sqlstate 'PT409' using message='انتهت مهلة القرار وأصبحت الاستقالة مقبولة بانقضاء المهلة؛ حدّث القائمة';end if;
 if p_decision='cancelled' then
  if admin_actor or tick>(d->>'withdraw_until')::timestamptz then raise sqlstate 'PT409' using message='العدول للموظفة خلال سبعة أيام وقبل القبول فقط';end if;
 elsif not admin_actor then raise insufficient_privilege;
 elsif p_decision not in ('approved','rejected','deferred') then raise sqlstate 'PT400' using message='قرار غير صحيح';
 end if;
 if p_decision<>'cancelled' and length(btrim(coalesce(p_reason,''))) not between 3 and 2000 then raise sqlstate 'PT400' using message='أدخل سبب القرار المكتوب';end if;
 if p_decision='deferred' then
  if d ? 'deferred_at' or tick>=(d->>'submitted_at')::timestamptz+interval '30 days' or p_days is null or p_days not between 1 and 60 then raise sqlstate 'PT400' using message='التأجيل مرة واحدة قبل انتهاء الثلاثين يومًا ولمدة من يوم إلى ستين يومًا';end if;
  d:=d||jsonb_build_object('deferred_at',tick,'deferral_reason',btrim(p_reason),'response_due',tick+make_interval(days=>p_days));
 elsif p_decision='approved' then d:=d||jsonb_build_object('effective_at',tick,'settlement_due',((tick at time zone 'Asia/Riyadh')::date+14));
 end if;
 d:=d||jsonb_build_object('history',(d->'history')||jsonb_build_array(jsonb_build_object('action',p_decision,'at',tick,'actor',p_actor,'reason',p_reason)));
 perform set_config('workforce.resignation_command',r.id::text,true);
 update public.wf_employee_requests set status=case when p_decision='deferred' then 'pending' else p_decision end,resignation_details=d,decision_reason=nullif(btrim(p_reason),''),decided_by=p_actor,decided_at=tick,version=version+1 where id=r.id;
 if p_decision='deferred' then
  insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key)
  select user_id,'employee_request','تأجيل قبول الاستقالة',p_reason||E'\nموعد انتهاء التأجيل: '||to_char((d->>'response_due')::timestamptz at time zone 'Asia/Riyadh','YYYY-MM-DD HH24:MI'),'/employee/requests/history?request='||r.id,'resignation:'||r.id||':deferred' from public.wf_employees where id=r.employee_id on conflict(recipient_id,event_key) do nothing;
 end if;
 return r.id;
end $$;
revoke all on function public.wf_decide_resignation(uuid,uuid,integer,text,text,integer) from public,anon,authenticated;
grant execute on function public.wf_decide_resignation(uuid,uuid,integer,text,text,integer) to service_role;

create function workforce_private.expire_resignations() returns void language plpgsql set search_path='' as $$
declare r public.wf_employee_requests;tick timestamptz:=workforce_private.work_now();due timestamptz;
begin
 for r in select * from public.wf_employee_requests where kind='resignation' and status='pending' and test_run_id is null and (resignation_details->>'response_due')::timestamptz<=tick for update skip locked loop
  due:=(r.resignation_details->>'response_due')::timestamptz;
  perform set_config('workforce.resignation_command',r.id::text,true);
  update public.wf_employee_requests set status='approved',decided_at=due,decision_reason='قُبلت الاستقالة بانقضاء المهلة النظامية',version=version+1,resignation_details=r.resignation_details||jsonb_build_object('effective_at',due,'settlement_due',(due at time zone 'Asia/Riyadh')::date+14,'history',(r.resignation_details->'history')||jsonb_build_array(jsonb_build_object('action','auto_approved','at',due))) where id=r.id;
 end loop;
end $$;
revoke all on function workforce_private.expire_resignations() from public,anon,authenticated,service_role;
revoke all on function workforce_private.guard_resignation() from public,anon,authenticated;
select cron.schedule('workforce-resignation-deadlines','* * * * *','select workforce_private.expire_resignations()');

-- Preserve the current delivery and deduplication logic; add only the new kind label.
do $patch$ declare definition text;begin
 definition:=pg_get_functiondef('workforce_private.notify_employee_request()'::regprocedure);
 definition:=replace(definition,'case new.kind when ''leave''','case new.kind when ''resignation'' then ''استقالة'' when ''leave''');
 execute definition;
end $patch$;
