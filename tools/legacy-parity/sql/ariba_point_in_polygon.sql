CREATE OR REPLACE FUNCTION public.ariba_point_in_polygon(p_lat double precision, p_lng double precision, p_poly jsonb) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$
declare n int; i int; j int; yi double precision; xi double precision; yj double precision; xj double precision; inside boolean:=false;
begin
  if p_poly is null or jsonb_typeof(p_poly)<>'array' then return false; end if;
  n:=jsonb_array_length(p_poly); if n<3 then return false; end if; j:=n-1;
  for i in 0..n-1 loop
    yi:=(p_poly->i->>0)::double precision; xi:=(p_poly->i->>1)::double precision; yj:=(p_poly->j->>0)::double precision; xj:=(p_poly->j->>1)::double precision;
    if ((yi>p_lat)<>(yj>p_lat)) and (p_lng < (xj-xi)*(p_lat-yi)/(yj-yi)+xi) then inside:=not inside; end if;
    j:=i;
  end loop;
  return inside;
end $$;
