CREATE OR REPLACE FUNCTION public.ariba_employee_location_ids(p_data jsonb) RETURNS text[]
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$ select coalesce((select array_agg(x) from jsonb_array_elements_text(case when jsonb_typeof(p_data->'workLocationIds')='array' then p_data->'workLocationIds' else '[]'::jsonb end) x where x<>'' and exists(select 1 from public.work_locations w where w.id=x and w.active=true)), array[]::text[]) $$;
