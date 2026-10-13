CREATE OR REPLACE FUNCTION public.ariba_delete_request(p_token uuid, p_request_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare s record; r public.workflow_requests; nd int := 0; nl int := 0; nn int := 0; is_hr boolean; is_tpl boolean; nm text; ttl text;
begin
  select * into s from public.ariba_session_row(p_token) limit 1;
  if s.account_id is null then raise exception 'انتهت جلسة الدخول'; end if;
  select * into r from public.workflow_requests where id=p_request_id;
  if r.id is null then raise exception 'REQUEST_NOT_FOUND'; end if;
  is_hr := s.role in ('hr','admin'); is_tpl := r.request_type like 'template:%';
  if not is_hr then
    if r.employee_id is distinct from s.employee_id then raise exception 'NOT_AUTHORIZED'; end if;
    if (not is_tpl) and r.status = 'approved' then raise exception 'CANNOT_DELETE_APPROVED'; end if;   -- طلب معتمد بيأثر على رصيد/حضور: HR بس يحذفه
  end if;
  ttl := coalesce(r.payload->>'title', r.request_type);
  insert into public.ariba_deleted_items(kind,ref_id,employee_id,snapshot,deleted_by,deleted_by_role)
  values('workflow_request', r.id::text, r.employee_id,
    jsonb_build_object(
      'request', to_jsonb(r),
      'documents', coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'file_name',d.file_name,'mime_type',d.mime_type,'file_size',d.file_size,'document_type',d.document_type,'uploaded_by',d.uploaded_by,'created_at',d.created_at,'base64',encode(d.file_data,'base64'))) from public.ariba_documents d where d.request_id=r.id),'[]'::jsonb),
      'leave', coalesce((select jsonb_agg(to_jsonb(l)) from public.leave_requests l where l.workflow_request_id=r.id),'[]'::jsonb),
      'notifications', coalesce((select jsonb_agg(to_jsonb(n)) from public.workflow_notifications n where n.request_id=r.id),'[]'::jsonb)),
    s.employee_id, s.role);
  delete from public.ariba_documents where request_id=r.id;               get diagnostics nd = row_count;
  delete from public.leave_requests where workflow_request_id=r.id;       get diagnostics nl = row_count;
  delete from public.workflow_notifications where request_id=r.id;        get diagnostics nn = row_count;
  delete from public.workflow_requests where id=r.id;
  -- موظف حذف مستند أو طلب لسه معلق: نبلّغ الموارد البشرية
  if (not is_hr) and r.status='pending' then
    select coalesce(name_ar,employee_id) into nm from public.employee_directory where employee_id=r.employee_id;
    insert into public.workflow_notifications(recipient_employee_id,request_id,title,body,stage,kind,is_read)
    select a.employee_id, null, '🗑 '||nm||' حذف '||case when is_tpl then 'مستنداً بانتظار توقيعه' else 'طلباً معلقاً' end||': '||ttl, 'اتحذف من طرف الموظف ومتسجّل في أرشيف المحذوفات.', 'hr', case when is_tpl then 'template_decision' else 'request' end, false
    from public.ariba_auth_accounts a where a.role='hr' and a.active=true;
  end if;
  return jsonb_build_object('ok',true,'request_id',r.id,'documents',nd,'leave_rows',nl,'notifications',nn);
end; $$;
