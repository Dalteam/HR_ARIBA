CREATE OR REPLACE FUNCTION public.ariba_workflow_action(p_token uuid, p_request_id uuid, p_action text, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare s record; r public.workflow_requests; next_stage text; next_id text; actor_stage text;
begin
  select * into s from public.ariba_session_row(p_token) limit 1; if s.account_id is null then raise exception 'انتهت جلسة الدخول'; end if;
  select * into r from public.workflow_requests where id=p_request_id; if r.id is null then raise exception 'REQUEST_NOT_FOUND'; end if; if p_action not in ('approved','rejected') then raise exception 'INVALID_ACTION'; end if; if r.status<>'pending' then raise exception 'REQUEST_ALREADY_COMPLETED'; end if;
  if s.role='admin' then actor_stage:=r.current_stage;
  elsif r.current_stage='manager' then if not (r.manager_id=s.employee_id and (s.role='manager' or s.role='ceo')) then raise exception 'NOT_AUTHORIZED'; end if; actor_stage:='manager';
  elsif r.current_stage='hr' then if s.role<>'hr' then raise exception 'NOT_AUTHORIZED'; end if; actor_stage:='hr';
  elsif r.current_stage='ceo' then if s.role<>'ceo' then raise exception 'NOT_AUTHORIZED'; end if; actor_stage:='ceo';
  else raise exception 'INVALID_STAGE'; end if;
  insert into public.workflow_actions(request_id,actor_employee_id,actor_account_id,stage,action,comment) values(r.id,s.employee_id,s.account_id,actor_stage,p_action,p_reason);
  update public.workflow_notifications set is_read=true,read_at=now() where request_id=r.id and recipient_employee_id=s.employee_id and is_read=false;
  update public.workflow_notifications set is_read=true,read_at=now() where request_id=r.id and stage=actor_stage and is_read=false;
  if p_action='rejected' then
    update public.workflow_requests set status='rejected',current_stage='rejected',rejected_at=now(),rejection_reason=p_reason,updated_at=now() where id=r.id;
    update public.leave_requests set status='rejected',rejected_by=s.employee_id,rejected_reason=p_reason,mgr_status=case when actor_stage='manager' then 'rejected' else mgr_status end,hr_status=case when actor_stage='hr' then 'rejected' else hr_status end,ceo_status=case when actor_stage='ceo' then 'rejected' else ceo_status end,updated_at=now() where workflow_request_id=r.id;
    update public.workflow_notifications set is_read=true,read_at=now() where request_id=r.id and stage<>'employee' and is_read=false;
    insert into public.workflow_notifications(recipient_employee_id,request_id,title,body,stage,kind,is_read) values(r.employee_id,r.id,'تم رفض الطلب',coalesce(p_reason,'تم رفض الطلب'),'employee','decision',false);
    return jsonb_build_object('ok',true,'status','rejected');
  end if;
  if r.request_type='forgot_punch' then
    /* V114: نسيان بصمة — موافقة الموارد البشرية نهائية، ويتسجل الحضور/الانصراف فعليًا */
    next_stage:=null; next_id:=null;
    perform public.ariba_apply_forgot_punch(r.id);
  elsif actor_stage='manager' then next_stage:='hr'; select employee_id into next_id from public.employee_directory where active=true and employee_id='40' limit 1; update public.leave_requests set mgr_status='approved',mgr_at=now() where workflow_request_id=r.id;
  elsif actor_stage='hr' then next_stage:='ceo'; select employee_id into next_id from public.employee_directory where active=true and employee_id='86' limit 1; update public.leave_requests set hr_status='approved',hr_at=now() where workflow_request_id=r.id;
  else next_stage:=null; next_id:=null; update public.leave_requests set ceo_status='approved',ceo_at=now(),status='approved' where workflow_request_id=r.id; end if;
  if next_stage is null then
    update public.workflow_requests set status='approved',current_stage='completed',completed_at=now(),updated_at=now() where id=r.id;
    update public.workflow_notifications set is_read=true,read_at=now() where request_id=r.id and stage<>'employee' and is_read=false;
    insert into public.workflow_notifications(recipient_employee_id,request_id,title,body,stage,kind,is_read) values(r.employee_id,r.id,'تمت الموافقة النهائية','تمت الموافقة على طلبك بالكامل','employee','decision',false);
  else
    update public.workflow_requests set current_stage=next_stage,hr_id=case when next_stage='hr' then next_id else hr_id end,ceo_id=case when next_stage='ceo' then next_id else ceo_id end,updated_at=now() where id=r.id;
    update public.leave_requests set status='pending' where workflow_request_id=r.id;
    insert into public.workflow_notifications(recipient_employee_id,request_id,title,body,stage,kind,is_read) values(r.employee_id,r.id,'تمت الموافقة على مرحلة','تمت الموافقة على طلبك وانتقل للمرحلة التالية','employee','workflow',false);
    if next_id is not null then insert into public.workflow_notifications(recipient_employee_id,request_id,title,body,stage,kind,is_read) values(next_id,r.id,'طلب بانتظار موافقتك','يوجد طلب بانتظار موافقتك','workflow','request',false); end if;
  end if;
  return jsonb_build_object('ok',true,'status',case when next_stage is null then 'approved' else 'pending' end,'current_stage',coalesce(next_stage,'completed'));
end; $$;
