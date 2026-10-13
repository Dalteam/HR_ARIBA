CREATE OR REPLACE FUNCTION public.ariba_submit_request(p_token uuid, p_type text, p_payload jsonb, p_attachment_name text DEFAULT NULL::text, p_attachment_mime text DEFAULT NULL::text, p_attachment_base64 text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare s record; e record; r_id uuid; doc jsonb; mgr text; next_stage text; payload2 jsonb; is_leave boolean; fdate date; tdate date; ndays integer; notes text; hr_emp text; fp_kind text; fp_date date; fp_time time; fp_time2 time;
begin
 select * into s from public.ariba_session_row(p_token) limit 1;
 if s.account_id is null or s.employee_id is null then raise exception 'INVALID_SESSION'; end if;
 select * into e from public.employee_directory where employee_id=s.employee_id and active=true;
 if e.employee_id is null then raise exception 'الموظف غير موجود'; end if;
 mgr:=e.manager_id;
 next_stage:=case when nullif(mgr,'') is not null then 'manager' else 'hr' end;
 if p_type='forgot_punch' then
   /* V114: نسيان بصمة — يروح للموارد البشرية مباشرة */
   fp_kind:=p_payload->>'kind';
   if fp_kind is null or fp_kind not in ('in','out','both') then raise exception 'حدد نوع البصمة (دخول / خروج / دخول وخروج)'; end if;
   begin
     fp_date:=(p_payload->>'date')::date; fp_time:=(p_payload->>'time')::time;
     if fp_kind='both' then fp_time2:=(p_payload->>'time2')::time; end if;
   exception when others then raise exception 'التاريخ أو الوقت غير صحيح'; end;
   if fp_date is null or fp_time is null then raise exception 'حدد التاريخ والوقت'; end if;
   if fp_date > (now() at time zone 'Asia/Riyadh')::date then raise exception 'لا يمكن اختيار تاريخ في المستقبل'; end if;
   if fp_kind='both' and (fp_time2 is null or fp_time2 <= fp_time) then raise exception 'وقت الخروج لازم يكون بعد وقت الدخول'; end if;
   if coalesce(trim(p_payload->>'notes'),'')='' then raise exception 'اكتب سبب نسيان البصمة'; end if;
   if exists (select 1 from public.workflow_requests w where w.employee_id=s.employee_id and w.request_type='forgot_punch' and w.status='pending' and w.payload->>'date'=fp_date::text and w.payload->>'kind'=fp_kind) then raise exception 'يوجد طلب نسيان بصمة معلق لنفس اليوم'; end if;
   next_stage:='hr';
   select employee_id into hr_emp from public.employee_directory where active=true and employee_id='40' limit 1;
 end if;
 payload2:=coalesce(p_payload,'{}'::jsonb)||jsonb_build_object('submitted_from','employee_app','submitted_at',now());
 insert into public.workflow_requests(employee_id,request_type,payload,manager_id,hr_id,current_stage,status)
 values(s.employee_id,p_type,payload2,mgr,coalesce(hr_emp,'40'),next_stage,'pending') returning id into r_id;
 if p_attachment_name is not null and trim(p_attachment_name)<>'' and p_attachment_base64 is not null and p_attachment_base64<>'' then
   select public.ariba_save_document(p_token,s.employee_id,case when p_type in ('annual','sick','emergency','death','marriage','maternity','paternity','umrah','hajj','remote') then 'Leave Attachment' else initcap(replace(p_type,'_',' '))||' Attachment' end,p_attachment_name,p_attachment_mime,p_attachment_base64,r_id) into doc;
 end if;
 is_leave:=p_type in ('annual','sick','emergency','death','marriage','maternity','paternity','umrah','hajj','remote','perm','perm_mat','early_leave');
 if is_leave then
   fdate:=nullif(payload2->>'from','')::date;
   tdate:=nullif(payload2->>'to','')::date;
   if fdate is null and nullif(payload2->>'date','') is not null then fdate:=(payload2->>'date')::date; tdate:=fdate; end if;
   ndays:=greatest(1,coalesce((payload2->>'days')::integer,case when fdate is not null and tdate is not null then (tdate-fdate)+1 else 1 end));
   notes:=coalesce(payload2->>'notes','');
   insert into public.leave_requests(emp_id,type,from_date,to_date,days,notes,status,mgr_status,hr_status,ceo_status,manager_id,workflow_request_id)
   values(s.employee_id,p_type,coalesce(fdate,current_date),coalesce(tdate,coalesce(fdate,current_date)),ndays,notes,'pending','pending','pending','pending',mgr,r_id)
   on conflict (workflow_request_id) do nothing;
 end if;
 if p_type='forgot_punch' then
   if hr_emp is not null then
     insert into public.workflow_notifications(recipient_employee_id,request_id,title,body,stage,kind,is_read) values(hr_emp,r_id,'طلب نسيان بصمة','يوجد طلب نسيان بصمة بانتظار موافقتك','hr','request',false);
   end if;
 elsif mgr is not null then
   insert into public.workflow_notifications(recipient_employee_id,request_id,title,body,stage,kind,is_read) values(mgr,r_id,'طلب جديد','يوجد طلب جديد من الموظف بانتظار موافقتك','manager','request',false);
 else
   insert into public.workflow_notifications(recipient_employee_id,request_id,title,body,stage,kind,is_read) select employee_id,r_id,'طلب جديد','تم إرسال طلبك إلى الموارد البشرية','hr','request',false from public.employee_directory where employee_id=s.employee_id;
 end if;
 
 -- V115: إشعار الموارد البشرية بكل طلب جديد (والموارد البشرية تقدر تعتمد بالنيابة عن المدير المباشر)
 if p_type <> 'forgot_punch' then
   insert into public.workflow_notifications(recipient_employee_id,request_id,title,body,stage,kind,is_read)
   select d.employee_id,r_id,'طلب جديد من '||coalesce(e.name_ar,s.employee_id),
     case when next_stage='manager' then 'الطلب بانتظار المدير المباشر — تقدر تعتمده بالنيابة عنه من طلبات الموظفين' else 'الطلب بانتظار موافقتك' end,
     'hr','request',false
   from public.employee_directory d
   where d.active=true and d.employee_id='40' and d.employee_id<>s.employee_id and d.employee_id<>coalesce(mgr,'');
 end if;
 return jsonb_build_object('ok',true,'request_id',r_id,'current_stage',next_stage,'attachment',doc);
end; $$;
