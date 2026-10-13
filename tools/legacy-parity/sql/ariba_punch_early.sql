CREATE OR REPLACE FUNCTION public.ariba_punch_early(p_in time without time zone, p_out time without time zone, p_late integer) RETURNS integer
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare cs public.company_settings; expected time;
begin
  if p_in is null or p_out is null then return 0; end if;
  select * into cs from public.company_settings where id='default';
  if not coalesce(cs.flexible_enabled,false) then return 0; end if;
  expected:=(p_in + (coalesce(cs.shift_hours,8) * interval '1 hour'))::time;
  if coalesce(p_late,0)>0 then expected:=least(expected, coalesce(cs.flex_window_end,'17:00'::time)); end if;
  return greatest(0, round(extract(epoch from (expected - p_out))/60))::integer;
end $$;
