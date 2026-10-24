-- Copy only: keep eligibility, deadline, links and deduplication unchanged.
-- No existing notices are replayed or delivered by this migration.
do $$
declare f oid:='public.wf_generate_work_confirmation_reminders(timestamptz)'::regprocedure; old_body text; body text;
begin
 select prosrc into old_body from pg_proc where oid=f;
 body:=replace(old_body,$s$عدم التأكيد خلال المهلة يؤدي إلى تسجيل انصراف تلقائي.$s$,
 $s$عدم التأكيد خلال المهلة يؤدي إلى تسجيل انصراف تلقائي.\nأكّدي من نفس جهاز ومتصفح تسجيل الحضور؛ فتح الرابط من الجوال لا يؤكد الجلسة ولا يجددها.$s$);
 if body=old_body then raise exception 'Confirmation reminder text changed; review copy update';end if;
 execute replace(pg_get_functiondef(f),old_body,body);
end $$;
