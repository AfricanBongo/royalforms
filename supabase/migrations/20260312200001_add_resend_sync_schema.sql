-- Add resend_segment_id to groups and create resend_sync_queue table
-- for retry of failed Resend API calls.

-- 1. Add resend_segment_id to groups
ALTER TABLE public.groups
  ADD COLUMN resend_segment_id TEXT;

-- 2. Create resend_sync_queue table
CREATE TABLE public.resend_sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL CHECK (action IN (
    'create_segment',
    'create_contact',
    'delete_contact',
    'move_contact',
    'deactivate_contact',
    'reactivate_contact'
  )),
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Enable RLS on resend_sync_queue
ALTER TABLE public.resend_sync_queue ENABLE ROW LEVEL SECURITY;

-- SELECT: root_admin only
CREATE POLICY resend_sync_queue_select ON public.resend_sync_queue
FOR SELECT USING (
  (select is_active_user()) = true
  AND (select get_current_user_role()) = 'root_admin'
);

-- UPDATE: root_admin only
CREATE POLICY resend_sync_queue_update ON public.resend_sync_queue
FOR UPDATE USING (
  (select is_active_user()) = true
  AND (select get_current_user_role()) = 'root_admin'
);

-- INSERT: root_admin only (Edge Function uses service role which bypasses
-- RLS anyway, but this restricts direct client-side inserts)
CREATE POLICY resend_sync_queue_insert ON public.resend_sync_queue
FOR INSERT WITH CHECK (
  (select is_active_user()) = true
  AND (select get_current_user_role()) = 'root_admin'
);

-- DELETE: root_admin only (manual cleanup of old rows)
CREATE POLICY resend_sync_queue_delete ON public.resend_sync_queue
FOR DELETE USING (
  (select is_active_user()) = true
  AND (select get_current_user_role()) = 'root_admin'
);

-- 4. Partial index for retry processor (only non-completed rows)
CREATE INDEX idx_resend_sync_queue_pending
  ON public.resend_sync_queue(status)
  WHERE status != 'completed';

-- 5. Apply update_updated_at trigger
CREATE TRIGGER set_resend_sync_queue_updated_at
  BEFORE UPDATE ON public.resend_sync_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();
