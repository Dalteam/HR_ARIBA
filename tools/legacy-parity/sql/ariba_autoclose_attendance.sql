CREATE OR REPLACE FUNCTION public.ariba_autoclose_attendance(p_before date DEFAULT NULL::date) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare n integer; lim date;
begin
  lim:=coalesce(p_before,(now() at time zone 'Asia/Riyadh')::date);
  update public.attendance
     set time_out='23:59:00', early_minutes=0,
         notes=coalesce(notes,'')||' | إغلاق تلقائي 23:59 (نسي بصمة الخروج)'
   where time_in is not null and time_out is null and date < lim;
  get diagnostics n = row_count;
  return n;
end $$;
