-- Add covering indexes for all foreign keys.
-- Prevents slow sequential scans on JOIN/WHERE clauses involving FKs.

CREATE INDEX idx_profiles_group_id ON public.profiles (group_id);
CREATE INDEX idx_groups_created_by ON public.groups (created_by);
CREATE INDEX idx_member_requests_group_id ON public.member_requests (group_id);
CREATE INDEX idx_member_requests_requested_by ON public.member_requests (requested_by);
CREATE INDEX idx_member_requests_decided_by ON public.member_requests (decided_by);
