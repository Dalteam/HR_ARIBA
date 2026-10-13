CREATE OR REPLACE FUNCTION public.ariba_can(p_role text, p_modules text, p_need text DEFAULT 'view'::text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare m text; lv int; need int := case p_need when 'edit' then 2 else 1 end;
begin
  if p_role in ('admin','chairman') then return true; end if;
  foreach m in array string_to_array(p_modules,'|') loop
    select case level when 'edit' then 2 when 'view' then 1 else 0 end into lv from public.ariba_role_perms where role=p_role and module=m;
    if coalesce(lv,0)>=need then return true; end if;
  end loop;
  return false;
end $$;
