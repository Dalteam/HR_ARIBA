CREATE OR REPLACE FUNCTION public.ariba_apply_forgot_punch(p_request_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare r public.workflow_requests; k text; d date; t1 time; t2 time; a public.attendance; late integer; note text; loc text;
begin
  select * into r from public.workflow_requests where id=p_request_id and request_type='forgot_punch';
  if r.id is null then return; end if;
  k:=r.payload->>'kind'; d:=(r.payload->>'date')::date;
  t1:=nullif(r.payload->>'time','')::time; t2:=nullif(r.payload->>'time2','')::time;
  note:=' | أُضيفت بطلب نسيان بصمة معتمد من الموارد البشرية'; loc:='طلب نسيان بصمة';
  if k='in' then
    select * into a from public.attendance where emp_id=r.employee_id and date=d order by time_in asc nulls last, created_at asc limit 1;
    late:=public.ariba_punch_late(t1);
    if a.id is null then
      insert into public.attendance(emp_id,date,time_in,status,notes,late_minutes,early_minutes,location_name)
      values(r.employee_id,d,t1,case when late>0 then 'late' else 'present' end,'طلب نسيان بصمة (دخول)'||note,late,0,loc);
    elsif a.time_in is null or t1 < a.time_in then
      update public.attendance set time_in=t1, late_minutes=late, status=case when late>0 then 'late' else 'present' end,
             early_minutes=case when time_out is not null then public.ariba_punch_early(t1,time_out,late) else early_minutes end,
             notes=coalesce(notes,'')||note where id=a.id;
    end if;
  elsif k='out' then
    select * into a from public.attendance where emp_id=r.employee_id and date=d order by time_in desc nulls last, created_at desc limit 1;
    if a.id is null then
      insert into public.attendance(emp_id,date,time_out,status,notes,late_minutes,early_minutes,location_name)
      values(r.employee_id,d,t1,'present','طلب نسيان بصمة (خروج)'||note,0,0,loc);
    elsif a.time_out is null or coalesce(a.notes,'') like '%إغلاق تلقائي%' or t1 > a.time_out then
      update public.attendance set time_out=t1, early_minutes=public.ariba_punch_early(a.time_in,t1,coalesce(a.late_minutes,0)),
             notes=coalesce(notes,'')||note where id=a.id;
    end if;
  elsif k='both' then
    select * into a from public.attendance where emp_id=r.employee_id and date=d order by time_in asc nulls last, created_at asc limit 1;
    late:=public.ariba_punch_late(t1);
    if a.id is null then
      insert into public.attendance(emp_id,date,time_in,time_out,status,notes,late_minutes,early_minutes,location_name)
      values(r.employee_id,d,t1,t2,case when late>0 then 'late' else 'present' end,'طلب نسيان بصمة (دخول وخروج)'||note,late,public.ariba_punch_early(t1,t2,late),loc);
    else
      if a.time_in is not null and a.time_in<=t1 then t1:=a.time_in; late:=coalesce(a.late_minutes,public.ariba_punch_late(t1)); end if;
      update public.attendance set time_in=t1, time_out=t2, late_minutes=late,
             status=case when late>0 then 'late' else 'present' end,
             early_minutes=public.ariba_punch_early(t1,t2,late), notes=coalesce(notes,'')||note where id=a.id;
    end if;
  end if;
end $$;
