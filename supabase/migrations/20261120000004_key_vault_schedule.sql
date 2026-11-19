-- Runs the rotation check every 15 seconds in the database, so keys rotate on time even when nobody calls them.
create extension if not exists pg_cron;
select cron.schedule('warden-rotate-keys', '15 seconds', 'select private.rotate_due()');
