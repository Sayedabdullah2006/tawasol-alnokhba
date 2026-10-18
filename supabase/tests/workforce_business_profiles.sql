begin;
set local role service_role;
do $$
declare actor uuid; other_actor uuid; owner uuid; r jsonb; published jsonb; old_slug uuid; n bigint;
begin
 select user_id into actor from public.wf_employees where status='active' order by id limit 1;
 select user_id into other_actor from public.wf_employees where status='active' and user_id<>actor limit 1;
 select user_id into owner from public.wf_task_assignment_admins limit 1;
 select count(*) into n from public.wf_notification_deliveries;
 r:=public.wf_business_card_command(actor,0,'save','{"display_name":"spoofed","job_title":"admin","work_email":"card-check@example.com","work_phone":"","socials":{"linkedin":"https://www.linkedin.com/in/card-check"}}');
 if r->>'display_name'='spoofed' or r->>'job_title'='admin' then raise exception 'Employee identity is editable'; end if;
 if public.wf_public_business_card((r->>'slug')::uuid) is not null then raise exception 'Draft is public'; end if;
 begin perform public.wf_business_card_command(actor,0,'issue'); raise exception 'Stale issuance allowed'; exception when sqlstate 'PT409' then null; end;
 begin perform public.wf_business_card_command(actor,1,'company','{}'); raise exception 'Employee edited company'; exception when insufficient_privilege then null; end;
 begin perform public.wf_business_card_command(actor,1,'save','{"socials":{"website":"javascript:alert(1)"}}'); raise exception 'Bad URL accepted'; exception when sqlstate 'PT400' then null; end;
 r:=public.wf_business_card_command(actor,1,'issue'); old_slug:=(r->>'slug')::uuid;
 published:=public.wf_public_business_card(old_slug);
 if published is null or published->>'email'<>'card-check@example.com' then raise exception 'Published snapshot missing'; end if;
 if (select array_agg(k order by k) from jsonb_object_keys(published) k) <> array['company','email','name','phone','socials','title'] then raise exception 'Unexpected public fields'; end if;
 r:=public.wf_business_card_command(actor,2,'save','{"work_email":"new-card-check@example.com","work_phone":"","socials":{"x":"https://x.com/cardcheck"}}');
 if public.wf_public_business_card(old_slug)->>'email'<>'card-check@example.com' then raise exception 'Draft modified published card'; end if;
 r:=public.wf_business_card_command(actor,3,'issue');
 if public.wf_public_business_card(old_slug)->>'email'<>'new-card-check@example.com' then raise exception 'Reissue failed'; end if;
 r:=public.wf_business_card_command(actor,4,'revoke');
 if (r->>'slug')::uuid=old_slug or public.wf_public_business_card(old_slug) is not null or public.wf_public_business_card((r->>'slug')::uuid) is not null then raise exception 'Revocation failed'; end if;
 perform public.wf_business_card_command(other_actor,0,'save','{"work_email":"","work_phone":"","socials":{}}');
 begin perform public.wf_business_card_command(other_actor,1,'issue'); raise exception 'Issued without social URL'; exception when sqlstate 'PT400' then null; end;
 select to_jsonb(c) into r from public.wf_card_company c where id;
 perform public.wf_business_card_command(owner,(r->>'version')::integer,'company',r);
 if (select count(*) from public.wf_notification_deliveries)<>n then raise exception 'Card operation sent mail'; end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
end $$;
set local role authenticated;
do $$
begin
 if (select count(*) from public.wf_business_profiles)<>1 then raise exception 'Peer draft visible'; end if;
 begin perform public.wf_public_business_card(gen_random_uuid()); raise exception 'Direct public RPC access'; exception when insufficient_privilege then null; end;
 begin perform public.wf_business_card_command(auth.uid(),0,'revoke'); raise exception 'Direct mutation access'; exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
 begin perform count(*) from public.wf_business_profiles; raise exception 'Anon can read private drafts'; exception when insufficient_privilege then null; end;
end $$;
rollback;
