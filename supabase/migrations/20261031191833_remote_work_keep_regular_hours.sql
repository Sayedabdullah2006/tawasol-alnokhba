-- New agreements stop the eligible allowances without reducing ordinary daily hours.
-- Signed snapshots are immutable and retain their original agreed terms.
do $patch$
declare f oid;body text;previous text;
begin
 f:='workforce_private.remote_quote(uuid,jsonb,uuid)'::regprocedure;
 select prosrc into body from pg_proc where oid=f;
 previous:=body;
 body:=replace(body,'required:=ceil(daily*(fixed-eligible)/fixed);','required:=daily;');
 if body=previous then raise exception 'Missing remote-work daily-hours seam';end if;
 previous:=body;
 body:=replace(body,'''remote-v1-stop-two-allowances''','''remote-v2-regular-hours''');
 if body=previous then raise exception 'Missing remote-work agreement version seam';end if;
 execute replace(pg_get_functiondef(f),(select prosrc from pg_proc where oid=f),body);
end $patch$;
