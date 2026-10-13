CREATE OR REPLACE FUNCTION public.ariba_attendance(p_token uuid, p_action text, p_lat double precision, p_lng double precision) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare n_allowed integer; s record; e public.employee_directory; loc public.work_locations; d double precision; today date; nowt time; open_rec public.attendance; first_rec public.attendance; cs public.company_settings; work_start time; tol integer; late integer; early integer; expected_out time; is_first_session boolean; session_late integer;
begin
  select * into s from public.ariba_session_row(p_token) limit 1;
  if s.account_id is null or s.employee_id is null then raise exception 'INVALID_SESSION'; end if;
  if p_lat is null or p_lng is null then raise exception 'GPS_REQUIRED'; end if;
  select * into e from public.employee_directory where employee_id=s.employee_id and active=true;
  if e.employee_id is null then raise exception 'EMPLOYEE_NOT_ACTIVE'; end if;
  /* V140: المواقع المسموحة للموظف */
  select count(*) into n_allowed from public.work_locations w
   where w.active=true and (case when cardinality(public.ariba_employee_location_ids(e.data))>0 then w.id = any(public.ariba_employee_location_ids(e.data)) else (w.employer='all' or w.employer=e.employer) end);
  if n_allowed=0 then raise exception 'NO_ACTIVE_LOCATION'; end if;
  /* الموقع الفعلي اللي الموظف جواه (مضلع أو دايرة) — الأصغر مساحة أولاً */
  select w.* into loc from public.work_locations w
   where w.active=true and coalesce(w.type,'')<>'remote'
     and (case when cardinality(public.ariba_employee_location_ids(e.data))>0 then w.id = any(public.ariba_employee_location_ids(e.data)) else (w.employer='all' or w.employer=e.employer) end)
     and (case when w.polygon is not null then public.ariba_point_in_polygon(p_lat,p_lng,w.polygon)
               else (6371000*2*asin(least(1,sqrt(power(sin(radians(p_lat-w.latitude)/2),2)+cos(radians(p_lat))*cos(radians(w.latitude))*power(sin(radians(p_lng-w.longitude)/2),2)))) <= w.radius_m) end)
   order by case when w.polygon is not null then 1e12 else w.radius_m end asc limit 1;
  if loc.id is not null then
    d:= case when loc.polygon is not null then 0 else 6371000*2*asin(least(1,sqrt(power(sin(radians(p_lat-loc.latitude)/2),2)+cos(radians(p_lat))*cos(radians(loc.latitude))*power(sin(radians(p_lng-loc.longitude)/2),2)))) end;
  else
    /* برّه كل المواقع: يسمح بس لو الموظف عنده موقع "عمل عن بعد" وطلب عمل عن بعد معتمد لليوم */
    select w.* into loc from public.work_locations w
     where w.active=true and w.type='remote'
       and (case when cardinality(public.ariba_employee_location_ids(e.data))>0 then w.id = any(public.ariba_employee_location_ids(e.data)) else (w.employer='all' or w.employer=e.employer) end)
     order by w.id limit 1;
    if loc.id is null then raise exception 'OUTSIDE_GEOFENCE'; end if;
    if not exists(select 1 from public.workflow_requests r where r.employee_id=e.employee_id and r.request_type='remote' and r.status='approved'
         and nullif(r.payload->>'from','')::date <= (now() at time zone 'Asia/Riyadh')::date
         and coalesce(nullif(r.payload->>'to','')::date, nullif(r.payload->>'from','')::date) >= (now() at time zone 'Asia/Riyadh')::date) then
      raise exception 'REMOTE_NOT_APPROVED';
    end if;
    d:=0;
  end if;
  select * into cs from public.company_settings where id='default';
  today:=(now() at time zone 'Asia/Riyadh')::date; nowt:=(now() at time zone 'Asia/Riyadh')::time;
  work_start:=coalesce(cs.work_start,'08:00'); tol:=coalesce(cs.tolerance_minutes,15);

  -- V114: أي بصمة دخول من يوم سابق بدون خروج تتقفل تلقائيًا 23:59 (من غير أي إضافي)
  update public.attendance set time_out='23:59:00', early_minutes=0, notes=coalesce(notes,'')||' | إغلاق تلقائي 23:59 (نسي بصمة الخروج)'
   where emp_id=e.employee_id and time_in is not null and time_out is null and date < today;

  select * into open_rec from public.attendance where emp_id=e.employee_id and date=today and time_in is not null and time_out is null order by created_at desc limit 1;
  select * into first_rec from public.attendance where emp_id=e.employee_id and date=today order by time_in asc limit 1;
  is_first_session := (first_rec.id is null);

  if p_action='in' then
    if open_rec.id is not null then raise exception 'ALREADY_CHECKED_IN'; end if;
    if coalesce(cs.flexible_enabled,false) then
      session_late:=0;
      if is_first_session then
        if nowt < coalesce(cs.flex_window_start,'08:00') then raise exception 'TOO_EARLY_FOR_FLEXIBLE_WINDOW'; end if;
        /* V114: سماح tolerance_minutes بعد آخر وقت دخول (نهاية النطاق - عدد الساعات)، والتأخير يتحسب بعد السماح */
        session_late:=public.ariba_punch_late(nowt);
        if session_late>0 then
          expected_out:=coalesce(cs.flex_window_end,'17:00');
        else
          expected_out:=(nowt + (coalesce(cs.shift_hours,8) * interval '1 hour'))::time;
        end if;
      else
        expected_out:=(first_rec.time_in + (coalesce(cs.shift_hours,8) * interval '1 hour'))::time;
      end if;
    else
      expected_out:=null;
      session_late:=case when is_first_session then greatest(0,extract(epoch from (nowt-(work_start+make_interval(mins=>tol))))/60)::integer else 0 end;
    end if;
    insert into public.attendance(emp_id,date,time_in,location_id,location_name,lat,lng,status,notes,late_minutes)
    values(e.employee_id,today,nowt,loc.id,loc.name,p_lat,p_lng,case when loc.type='remote' then 'remote' when session_late>0 then 'late' else 'present' end,case when loc.type='remote' then 'عمل عن بعد (طلب معتمد) — ' else '' end||'GPS distance: '||round(d)::text||' m'||case when not is_first_session then ' (دخول إضافي في نفس اليوم)' else '' end,session_late)
    returning * into open_rec;
    return jsonb_build_object('ok',true,'action',p_action,'late_minutes',session_late,'flexible_enabled',coalesce(cs.flexible_enabled,false),'expected_checkout',expected_out,'is_additional_session',not is_first_session,'distance_m',round(d),'location_id',loc.id,'location_name',loc.name,'record',to_jsonb(open_rec));

  elsif p_action='out' then
    if open_rec.id is null then raise exception 'NO_CHECKIN'; end if;
    if coalesce(cs.flexible_enabled,false) then
      /* V114: الدوام 8 ساعات بالضبط من أول دخول؛ لو الدخول كان متأخر يتحدد بنهاية النطاق */
      expected_out:=(coalesce(first_rec.time_in, open_rec.time_in) + (coalesce(cs.shift_hours,8) * interval '1 hour'))::time;
      if coalesce(first_rec.late_minutes,0)>0 then expected_out:=least(expected_out, coalesce(cs.flex_window_end,'17:00')); end if;
      early:=greatest(0,extract(epoch from (expected_out-nowt))/60)::integer;
    else
      early:=0; expected_out:=null;
    end if;
    update public.attendance set time_out=nowt,notes=coalesce(notes,'')||' | GPS checkout distance: '||round(d)::text||' m',early_minutes=early where id=open_rec.id returning * into open_rec;
    return jsonb_build_object('ok',true,'action',p_action,'early_minutes',early,'flexible_enabled',coalesce(cs.flexible_enabled,false),'expected_checkout',expected_out,'distance_m',round(d),'location_id',loc.id,'location_name',loc.name,'record',to_jsonb(open_rec));
  else raise exception 'INVALID_ATTENDANCE_ACTION'; end if;
end;$$;
