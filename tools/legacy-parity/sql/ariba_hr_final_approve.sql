CREATE OR REPLACE FUNCTION public.ariba_hr_final_approve(p_token uuid, p_request_id uuid, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare s record; r public.workflow_requests; i int := 0; last jsonb; reason text;
begin
  select * into s from public.ariba_session_row(p_token) limit 1;
  if s.account_id is null or not public.ariba_can(s.role,'requests','edit') then raise exception 'NOT_AUTHORIZED'; end if;
  select * into r from public.workflow_requests where id=p_request_id;
  if r.id is null then raise exception 'REQUEST_NOT_FOUND'; end if;
  if r.status<>'pending' then raise exception 'REQUEST_NOT_PENDING'; end if;
  reason := coalesce(nullif(p_reason,''),'اعتماد نهائي من الموارد البشرية');
  loop
    i := i + 1;
    if i > 4 then raise exception 'FINAL_APPROVE_LOOP_LIMIT'; end if;
    last := public.ariba_hr_override_workflow(p_token, p_request_id, reason);
    exit when coalesce(last->>'status','')<>'pending';
  end loop;
  return jsonb_build_object('ok',true,'status',last->>'status','current_stage',last->>'current_stage','steps',i,'final',true);
end; $$;
