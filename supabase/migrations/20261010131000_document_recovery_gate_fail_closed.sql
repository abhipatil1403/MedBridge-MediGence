-- Missing recovery configuration is denial, not SQL NULL. Preserve function OIDs,
-- original consent/tenant/organization checks and existing execute grants.
do $$declare fn text;definition text;guard text:='not (select blocked from private.document_recovery_gate where id)';begin
 foreach fn in array array['private.document_security_clean(text,text)','private.can_access_case(uuid)','private.portal_case_access(uuid)'] loop
  definition:=pg_get_functiondef(fn::regprocedure);
  if position('coalesce('||guard||',false)' in definition)>0 then continue;end if;
  if position(guard in definition)=0 then raise exception 'Unexpected recovery guard definition';end if;
  execute replace(definition,guard,'coalesce('||guard||',false)');
 end loop;
end;$$;
