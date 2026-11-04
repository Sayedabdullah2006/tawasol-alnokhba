do $fix$ declare f record; begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('partner_offer_action','partner_sandbox_offer_action') loop
  execute regexp_replace(pg_get_functiondef(f.oid),'\mextras\M','v_extras','g');
 end loop;
end $fix$;
