CREATE OR REPLACE FUNCTION public.ariba_leave_calc(p_employee_id text, p_asof date DEFAULT CURRENT_DATE) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  e public.employee_directory;
  y int := extract(year from p_asof)::int;
  start_year int;
  year_start date := make_date(y,1,1);
  year_end date := make_date(y,12,31);
  annual_days numeric := 21;
  carry numeric := 0;
  prev_year_end numeric := 0;
  prev_carry_next numeric := 0;
  accrued_today numeric := 0;
  accrued_year_end numeric := 0;
  used_today numeric := 0;
  used_year numeric := 0;
  used_since_start numeric := 0;
  total_entitlement numeric := 0;
  current_balance numeric := 0;
  projected_balance numeric := 0;
  eos_total numeric := 0;
  yy int;
  ov jsonb;
  ent numeric;
  used numeric;
  adj numeric;
  yend numeric;
  carry_next numeric;
  eos numeric;
  den_wd int;
  num_wd int;
  elapsed_wd int;
  start_date date;
  sdate date;
  edate date;
  d date;
  req_used numeric;
  historical_used numeric;
  hol_dates date[] := '{}';
  cap numeric := 1000000;
  cfg jsonb;
begin
  select value into cfg from public.ariba_app_settings where key='leave_carry';
  if coalesce((cfg->>'enabled')::boolean,false) then cap := greatest(0,coalesce(nullif(cfg->>'days','')::numeric,0)); end if;
  select * into e from public.employee_directory where employee_id=p_employee_id and active=true;
  if e.employee_id is null then raise exception 'الموظف غير موجود'; end if;
  start_date := e.join_date;
  if start_date is null then return jsonb_build_object('leaveBalance',0,'leaveYearEnd',0,'leaveCarryover',0,'leaveAccruedToday',0,'leaveAccruedYearEnd',0,'leaveUsedToday',0,'leaveUsedYear',0,'leaveUsedSinceStart',0,'leaveTotalSinceStart',0,'leaveAvailableSinceStart',0,'leaveEosExcess',0,'leaveYear',y); end if;
  start_year := extract(year from start_date)::int;
  if start_year > y then return jsonb_build_object('leaveBalance',0,'leaveYearEnd',0,'leaveCarryover',0,'leaveAccruedToday',0,'leaveAccruedYearEnd',0,'leaveUsedToday',0,'leaveUsedYear',0,'leaveUsedSinceStart',0,'leaveTotalSinceStart',0,'leaveAvailableSinceStart',0,'leaveEosExcess',0,'leaveYear',y); end if;
  select array_agg(d2) into hol_dates
  from public.public_holidays h, generate_series(0, greatest(0,coalesce(h.days,1)-1)) as off(i), lateral (select h.holiday_date + off.i as d2) s
  where h.holiday_date >= make_date(start_year,1,1) and h.holiday_date <= make_date(y,12,31) + interval '10 days';
  hol_dates := coalesce(hol_dates, '{}');
  for yy in start_year..y loop
    sdate := greatest(make_date(yy,1,1),start_date);
    edate := case when yy=y then year_end else make_date(yy,12,31) end;
    den_wd := 0; num_wd := 0;
    d := make_date(yy,1,1);
    while d <= make_date(yy,12,31) loop if extract(dow from d) between 0 and 4 and not (d = any(hol_dates)) then den_wd := den_wd + 1; end if; d := d + 1; end loop;
    d := sdate;
    while d <= edate loop if extract(dow from d) between 0 and 4 and not (d = any(hol_dates)) then num_wd := num_wd + 1; end if; d := d + 1; end loop;
    ov := coalesce(e.data->'leaveYearOverrides'->(yy::text),'{}'::jsonb);
    if yy=start_year then
      carry := coalesce(nullif(ov->>'carry','')::numeric,0);
    else
      carry := least(cap,greatest(0,coalesce(prev_year_end,0)));
      if ov ? 'carry' then carry := greatest(0,coalesce(nullif(ov->>'carry','')::numeric,0)); end if;
    end if;
    if ov ? 'entitlement' then ent := greatest(0,coalesce(nullif(ov->>'entitlement','')::numeric,0)); else ent := case when num_wd>0 and den_wd>0 then annual_days*num_wd/den_wd else 0 end; end if;
    if ov ? 'used' then used := greatest(0,coalesce(nullif(ov->>'used','')::numeric,0)) + coalesce((select sum(l.days) from public.leave_requests l where l.emp_id=e.employee_id and lower(l.type)='annual' and lower(l.status)='approved' and extract(year from l.from_date)=yy and l.from_date <= edate and (nullif(ov->>'asOf','') is null or l.from_date >= nullif(ov->>'asOf','')::date)),0); else
      select coalesce(sum(l.days),0) into req_used from public.leave_requests l where l.emp_id=e.employee_id and lower(l.type)='annual' and lower(l.status)='approved' and l.from_date <= edate and l.to_date >= sdate;
      historical_used := coalesce(nullif(e.data->>('leaveUsed'||yy),'')::numeric,0);
      used := greatest(0,coalesce(req_used,0),historical_used);
    end if;
    adj := case when ov ? 'adjustment' then coalesce(nullif(ov->>'adjustment','')::numeric,0) else 0 end;
    yend := case when ov ? 'yearEnd' and ov ? 'carry' then greatest(0,coalesce(nullif(ov->>'yearEnd','')::numeric,0) - case when ov ? 'used' then greatest(0, used - coalesce(nullif(ov->>'used','')::numeric,0)) else 0 end) else greatest(0,carry+ent+adj-used) end;
    carry_next := least(cap,greatest(0,yend));
    eos := case when cap>=1000000 then 0 else greatest(0,yend-cap) end;
    total_entitlement := total_entitlement + ent;
    if yy < y then eos_total := eos_total + eos; end if;
    prev_year_end := yend; prev_carry_next := carry_next;
    if yy=y then
      elapsed_wd := 0; den_wd := 0; d := greatest(year_start,start_date);
      while d <= p_asof loop if extract(dow from d) between 0 and 4 and not (d = any(hol_dates)) then elapsed_wd := elapsed_wd + 1; end if; d := d + 1; end loop;
      d := year_start; while d <= year_end loop if extract(dow from d) between 0 and 4 and not (d = any(hol_dates)) then den_wd := den_wd + 1; end if; d := d + 1; end loop;
      accrued_today := case when elapsed_wd>0 and den_wd>0 then annual_days*elapsed_wd/den_wd else 0 end;
      accrued_year_end := ent;
      select coalesce(sum(l.days),0) into req_used from public.leave_requests l where l.emp_id=e.employee_id and lower(l.type)='annual' and lower(l.status)='approved' and l.from_date <= p_asof and l.to_date >= greatest(start_date,year_start);
      historical_used := coalesce(nullif(e.data->>('leaveUsed'||yy),'')::numeric,0);
      used_today := case when ov ? 'used' then greatest(0,coalesce(nullif(ov->>'used','')::numeric,0)) + coalesce((select sum(l.days) from public.leave_requests l where l.emp_id=e.employee_id and lower(l.type)='annual' and lower(l.status)='approved' and extract(year from l.from_date)=yy and l.from_date <= p_asof and (nullif(ov->>'asOf','') is null or l.from_date >= nullif(ov->>'asOf','')::date)),0) else greatest(0,coalesce(req_used,0),historical_used) end;
      used_year := used;
      current_balance := case when ov ? 'current' then greatest(0,coalesce(nullif(ov->>'current','')::numeric,0) - case when ov ? 'used' then greatest(0, used_today - coalesce(nullif(ov->>'used','')::numeric,0)) else 0 end) else greatest(0,carry+accrued_today+adj-used_today) end;
      projected_balance := yend;
    end if;
  end loop;
  used_since_start := 0;
  for yy in start_year..y loop
    ov := coalesce(e.data->'leaveYearOverrides'->(yy::text),'{}'::jsonb);
    if ov ? 'used' then used_since_start := used_since_start + greatest(0,coalesce(nullif(ov->>'used','')::numeric,0)) + coalesce((select sum(l.days) from public.leave_requests l where l.emp_id=e.employee_id and lower(l.type)='annual' and lower(l.status)='approved' and extract(year from l.from_date)=yy and l.from_date <= least(p_asof,make_date(yy,12,31)) and (nullif(ov->>'asOf','') is null or l.from_date >= nullif(ov->>'asOf','')::date)),0); else
      historical_used := coalesce(nullif(e.data->>('leaveUsed'||yy),'')::numeric,0);
      select coalesce(sum(l.days),0) into req_used from public.leave_requests l where l.emp_id=e.employee_id and lower(l.type)='annual' and lower(l.status)='approved' and l.from_date >= greatest(start_date,make_date(yy,1,1)) and l.from_date <= least(p_asof,make_date(yy,12,31));
      used_since_start := used_since_start + greatest(0,historical_used,coalesce(req_used,0));
    end if;
  end loop;
  return jsonb_build_object('leaveBalance',round(current_balance,2),'leaveYearEnd',round(projected_balance,2),'leaveCarryover',round(carry,2),'leaveAccruedToday',round(accrued_today,2),'leaveAccruedYearEnd',round(accrued_year_end,2),'leaveUsedToday',round(used_today,2),'leaveUsedYear',round(used_year,2),'leaveUsedSinceStart',round(used_since_start,2),'leaveTotalSinceStart',round(total_entitlement,2),'leaveAvailableSinceStart',round(greatest(0,total_entitlement-used_since_start),2),'leaveEosExcess',round(eos_total + case when cap>=1000000 then 0 else greatest(0,projected_balance-cap) end,2),'leaveYear',y);
end;
$$;
