-- Resolve circular dependency: now that profiles exists, add the FK constraint.
ALTER TABLE public.groups
  ADD CONSTRAINT groups_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id);
