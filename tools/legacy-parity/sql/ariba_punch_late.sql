CREATE OR REPLACE FUNCTION public.ariba_punch_late(p_time time without time zone) RETURNS integer
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare cs public.company_settings; tol integer; thr time;
begin
  if p_time is null then return 0; end if;
  select * into cs from public.company_settings where id='default';
  tol:=coalesce(cs.tolerance_minutes,15);
  if coalesce(cs.flexible_enabled,false) then
    thr:=(coalesce(cs.flex_window_end,'17:00'::time) - (coalesce(cs.shift_hours,8) * interval '1 hour')) + make_interval(mins=>tol);
  else
    thr:=coalesce(cs.work_start,'08:00'::time) + make_interval(mins=>tol);
  end if;
  if p_time <= thr then return 0; end if;
  return greatest(1, round(extract(epoch from (p_time - thr))/60))::integer;
end $$;
