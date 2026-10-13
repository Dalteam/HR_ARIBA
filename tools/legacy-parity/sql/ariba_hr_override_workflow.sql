CREATE OR REPLACE FUNCTION public.ariba_hr_override_workflow(p_token uuid, p_request_id uuid, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare s record; r public.workflow_requests; next_id text; actor_stage text; begin
  select * into s from public.ariba_session_row(p_token) limit 1;
  if s.account_id is null or not public.ariba_can(s.role,'requests','edit') then raise exception 'NOT_AUTHORIZED'; end if;
  select * into r from public.workflow_requests where id=p_request_id;
  if r.id is null then raise exception 'REQUEST_NOT_FOUND'; end if;
  if r.status<>'pending' then raise exception 'REQUEST_NOT_PENDING'; end if;
  actor_stage:=coalesce(r.current_stage,'manager');
  if actor_stage not in ('manager','hr','ceo') then raise exception 'REQUEST_STAGE_NOT_OVERRIDEABLE'; end if;

  insert into public.workflow_actions(request_id,actor_employee_id,actor_account_id,stage,action,comment)
  values(r.id,s.employee_id,s.account_id,case when r.request_type='forgot_punch' then 'hr' else 'hr_override_'||actor_stage end,'approved',coalesce(p_reason,'اعتماد الموارد البشرية نيابة عن المسؤول في هذه المرحلة'));
  update public.workflow_notifications set is_read=true,read_at=now() where request_id=r.id and is_read=false;

  -- V114b: نسيان بصمة — موافقة الموارد البشرية نهائية ويتسجل الحضور/الانصراف فعليًا
  if r.request_type='forgot_punch' then
    perform public.ariba_apply_forgot_punch(r.id);
    update public.workflow_requests set status='approved',current_stage='completed',completed_at=now(),updated_at=now() where id=r.id;
    insert into public.workflow_notifications(recipient_employee_id,request_id,title,body,stage,kind,is_read)
    values(r.employee_id,r.id,'تمت الموافقة على نسيان البصمة','تمت الموافقة على طلبك وتم تسجيل الحضور/الانصراف','employee','decision',false);
    return jsonb_build_object('ok',true,'status','approved','current_stage','completed');
  end if;

  if actor_stage='manager' then
    update public.leave_requests set mgr_status='approved',mgr_at=now(),status='pending',updated_at=now() where workflow_request_id=r.id;
    select employee_id into next_id from public.employee_directory where active=true and employee_id='40' limit 1;
    if next_id is null then raise exception 'HR_NOT_CONFIGURED'; end if;
    update public.workflow_requests set current_stage='hr',hr_id=next_id,updated_at=now() where id=r.id;
    insert into public.workflow_notifications(recipient_employee_id,request_id,title,body,stage,kind,is_read)
    values(next_id,r.id,'طلب بانتظار موافقة الموارد البشرية','تم اعتماد الطلب نيابة عن المدير المباشر','workflow','request',false);
    return jsonb_build_object('ok',true,'status','pending','current_stage','hr','overridden',true);
  elsif actor_stage='hr' then
    update public.leave_requests set hr_status='approved',hr_at=now(),status='pending',updated_at=now() where workflow_request_id=r.id;
    select employee_id into next_id from public.employee_directory where active=true and employee_id='86' limit 1;
    if next_id is null then raise exception 'CEO_NOT_CONFIGURED'; end if;
    update public.workflow_requests set current_stage='ceo',ceo_id=next_id,updated_at=now() where id=r.id;
    insert into public.workflow_notifications(recipient_employee_id,request_id,title,body,stage,kind,is_read)
    values(next_id,r.id,'طلب بانتظار موافقتك','تم اعتماد الطلب نيابة عن الموارد البشرية','workflow','request',false);
    return jsonb_build_object('ok',true,'status','pending','current_stage','ceo','overridden',true);
  else
    update public.leave_requests set ceo_status='approved',ceo_at=now(),status='approved',updated_at=now() where workflow_request_id=r.id;
    update public.workflow_requests set status='approved',current_stage='completed',completed_at=now(),updated_at=now() where id=r.id;
    insert into public.workflow_notifications(recipient_employee_id,request_id,title,body,stage,kind,is_read)
    values(r.employee_id,r.id,'تمت الموافقة النهائية','تمت الموافقة على طلبك بالكامل بواسطة الموارد البشرية نيابة عن المسؤول','employee','decision',false);
    return jsonb_build_object('ok',true,'status','approved','current_stage','completed','overridden',true);
  end if;
end; $$;
