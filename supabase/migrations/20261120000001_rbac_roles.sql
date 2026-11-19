-- New enum values must be committed before another statement can use them, so they get their own migration.
alter type public.app_role add value if not exists 'admin';
alter type public.app_role add value if not exists 'vendor';
