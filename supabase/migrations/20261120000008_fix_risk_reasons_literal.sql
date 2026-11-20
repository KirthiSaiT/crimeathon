-- Fix for databases already at 20261120000007: a bare text literal appended to the reasons array was read as an
-- array literal, so a monitor-mode call failed. Give the literals an explicit text type. Safe to run twice.
do $$
declare def text := pg_get_functiondef('public.sim_api(text, text, text, jsonb, inet, text, boolean)'::regprocedure);
begin
  execute replace(def, 'v_reasons || ''', 'v_reasons || text ''');
end $$;
