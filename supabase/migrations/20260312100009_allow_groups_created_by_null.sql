-- Allow groups.created_by to be NULL temporarily during bootstrap.
-- The bootstrap-root-admin Edge Function creates the group before the user
-- exists, then backfills created_by after the profile is inserted.
ALTER TABLE public.groups ALTER COLUMN created_by DROP NOT NULL;
