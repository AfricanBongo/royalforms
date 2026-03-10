-- Add TO authenticated, service_role to ALL RLS policies across the application.
-- Also adds the missing DELETE policy for instance_schedules.
--
-- Why: Policies without TO default to TO public, which is overly permissive.
-- Authenticated + service_role ensures only logged-in users and backend services
-- can interact with the data.

-- ============================================================================
-- profiles
-- ============================================================================

DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles
FOR SELECT
TO authenticated, service_role
USING (
  (select is_active_user()) = true
  AND (
    (select get_current_user_role()) = 'root_admin'
    OR id = (select auth.uid())
    OR group_id = (select get_current_user_group_id())
  )
);

DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles
FOR UPDATE
TO authenticated, service_role
USING (
  (select is_active_user()) = true
  AND (
    id = (select auth.uid())
    OR (select get_current_user_role()) = 'root_admin'
  )
);

-- ============================================================================
-- groups
-- ============================================================================

DROP POLICY IF EXISTS groups_select ON public.groups;
CREATE POLICY groups_select ON public.groups
FOR SELECT
TO authenticated, service_role
USING (
  (select is_active_user()) = true
  AND (
    (select get_current_user_role()) = 'root_admin'
    OR (id = (select get_current_user_group_id()) AND is_active = true)
  )
);

DROP POLICY IF EXISTS groups_insert ON public.groups;
CREATE POLICY groups_insert ON public.groups
FOR INSERT
TO authenticated, service_role
WITH CHECK (
  (select is_active_user()) = true
  AND (select get_current_user_role()) = 'root_admin'
);

DROP POLICY IF EXISTS groups_update ON public.groups;
CREATE POLICY groups_update ON public.groups
FOR UPDATE
TO authenticated, service_role
USING (
  (select is_active_user()) = true
  AND (select get_current_user_role()) = 'root_admin'
);

-- ============================================================================
-- member_requests
-- ============================================================================

DROP POLICY IF EXISTS member_requests_select ON public.member_requests;
CREATE POLICY member_requests_select ON public.member_requests
FOR SELECT
TO authenticated, service_role
USING (
  (select is_active_user()) = true
  AND (
    (select get_current_user_role()) = 'root_admin'
    OR (
      (select get_current_user_role()) = 'admin'
      AND group_id = (select get_current_user_group_id())
    )
  )
);

DROP POLICY IF EXISTS member_requests_insert ON public.member_requests;
CREATE POLICY member_requests_insert ON public.member_requests
FOR INSERT
TO authenticated, service_role
WITH CHECK (
  is_active_user() = true
  AND (
    (get_current_user_role() = 'root_admin' AND proposed_role IN ('admin', 'editor', 'viewer'))
    OR
    (get_current_user_role() = 'admin' AND group_id = get_current_user_group_id() AND proposed_role IN ('admin', 'editor', 'viewer'))
  )
);

DROP POLICY IF EXISTS member_requests_update ON public.member_requests;
CREATE POLICY member_requests_update ON public.member_requests
FOR UPDATE
TO authenticated, service_role
USING (
  (select is_active_user()) = true
  AND (select get_current_user_role()) = 'root_admin'
);

DROP POLICY IF EXISTS member_requests_delete ON public.member_requests;
CREATE POLICY member_requests_delete ON public.member_requests
FOR DELETE
TO authenticated, service_role
USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

-- ============================================================================
-- form_templates
-- ============================================================================

DROP POLICY IF EXISTS form_templates_select ON public.form_templates;
CREATE POLICY form_templates_select ON public.form_templates
FOR SELECT
TO authenticated, service_role
USING (
  is_active_user() = true
  AND (
    get_current_user_role() = 'root_admin'
    OR (
      is_active = true
      AND (
        sharing_mode = 'all'
        OR EXISTS (
          SELECT 1 FROM public.template_group_access tga
          WHERE tga.template_id = form_templates.id
          AND tga.group_id = get_current_user_group_id()
        )
      )
    )
  )
);

DROP POLICY IF EXISTS form_templates_insert ON public.form_templates;
CREATE POLICY form_templates_insert ON public.form_templates
FOR INSERT
TO authenticated, service_role
WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

DROP POLICY IF EXISTS form_templates_update ON public.form_templates;
CREATE POLICY form_templates_update ON public.form_templates
FOR UPDATE
TO authenticated, service_role
USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

DROP POLICY IF EXISTS form_templates_delete ON public.form_templates;
CREATE POLICY form_templates_delete ON public.form_templates
FOR DELETE
TO authenticated, service_role
USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
  AND status = 'draft'
);

-- ============================================================================
-- template_versions
-- ============================================================================

DROP POLICY IF EXISTS template_versions_select ON public.template_versions;
CREATE POLICY template_versions_select ON public.template_versions
FOR SELECT
TO authenticated, service_role
USING (
  is_active_user() = true
  AND (
    get_current_user_role() = 'root_admin'
    OR EXISTS (
      SELECT 1 FROM public.form_templates ft
      WHERE ft.id = template_versions.template_id
      AND ft.is_active = true
      AND (
        ft.sharing_mode = 'all'
        OR EXISTS (
          SELECT 1 FROM public.template_group_access tga
          WHERE tga.template_id = ft.id
          AND tga.group_id = get_current_user_group_id()
        )
      )
    )
  )
);

DROP POLICY IF EXISTS template_versions_insert ON public.template_versions;
CREATE POLICY template_versions_insert ON public.template_versions
FOR INSERT
TO authenticated, service_role
WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

DROP POLICY IF EXISTS template_versions_update ON public.template_versions;
CREATE POLICY template_versions_update ON public.template_versions
FOR UPDATE
TO authenticated, service_role
USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

DROP POLICY IF EXISTS template_versions_delete ON public.template_versions;
CREATE POLICY template_versions_delete ON public.template_versions
FOR DELETE
TO authenticated, service_role
USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
  AND status = 'draft'
);

-- ============================================================================
-- template_sections
-- ============================================================================

DROP POLICY IF EXISTS template_sections_select ON public.template_sections;
CREATE POLICY template_sections_select ON public.template_sections
FOR SELECT
TO authenticated, service_role
USING (
  is_active_user() = true
  AND (
    get_current_user_role() = 'root_admin'
    OR EXISTS (
      SELECT 1 FROM public.template_versions tv
      JOIN public.form_templates ft ON ft.id = tv.template_id
      WHERE tv.id = template_sections.template_version_id
      AND ft.is_active = true
      AND (
        ft.sharing_mode = 'all'
        OR EXISTS (
          SELECT 1 FROM public.template_group_access tga
          WHERE tga.template_id = ft.id
          AND tga.group_id = get_current_user_group_id()
        )
      )
    )
  )
);

DROP POLICY IF EXISTS template_sections_insert ON public.template_sections;
CREATE POLICY template_sections_insert ON public.template_sections
FOR INSERT
TO authenticated, service_role
WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

DROP POLICY IF EXISTS template_sections_delete ON public.template_sections;
CREATE POLICY template_sections_delete ON public.template_sections
FOR DELETE
TO authenticated, service_role
USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
  AND EXISTS (
    SELECT 1 FROM public.template_versions tv
    WHERE tv.id = template_sections.template_version_id
      AND tv.status = 'draft'
  )
);

-- ============================================================================
-- template_fields
-- ============================================================================

DROP POLICY IF EXISTS template_fields_select ON public.template_fields;
CREATE POLICY template_fields_select ON public.template_fields
FOR SELECT
TO authenticated, service_role
USING (
  is_active_user() = true
  AND (
    get_current_user_role() = 'root_admin'
    OR EXISTS (
      SELECT 1 FROM public.template_sections ts
      JOIN public.template_versions tv ON tv.id = ts.template_version_id
      JOIN public.form_templates ft ON ft.id = tv.template_id
      WHERE ts.id = template_fields.template_section_id
      AND ft.is_active = true
      AND (
        ft.sharing_mode = 'all'
        OR EXISTS (
          SELECT 1 FROM public.template_group_access tga
          WHERE tga.template_id = ft.id
          AND tga.group_id = get_current_user_group_id()
        )
      )
    )
  )
);

DROP POLICY IF EXISTS template_fields_insert ON public.template_fields;
CREATE POLICY template_fields_insert ON public.template_fields
FOR INSERT
TO authenticated, service_role
WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

DROP POLICY IF EXISTS template_fields_delete ON public.template_fields;
CREATE POLICY template_fields_delete ON public.template_fields
FOR DELETE
TO authenticated, service_role
USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
  AND EXISTS (
    SELECT 1 FROM public.template_sections ts
    JOIN public.template_versions tv ON tv.id = ts.template_version_id
    WHERE ts.id = template_fields.template_section_id
      AND tv.status = 'draft'
  )
);

-- ============================================================================
-- template_group_access
-- ============================================================================

DROP POLICY IF EXISTS template_group_access_select ON public.template_group_access;
CREATE POLICY template_group_access_select ON public.template_group_access
FOR SELECT
TO authenticated, service_role
USING (
  is_active_user() = true
  AND (
    get_current_user_role() = 'root_admin'
    OR group_id = get_current_user_group_id()
  )
);

DROP POLICY IF EXISTS template_group_access_insert ON public.template_group_access;
CREATE POLICY template_group_access_insert ON public.template_group_access
FOR INSERT
TO authenticated, service_role
WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

DROP POLICY IF EXISTS template_group_access_delete ON public.template_group_access;
CREATE POLICY template_group_access_delete ON public.template_group_access
FOR DELETE
TO authenticated, service_role
USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

-- ============================================================================
-- form_instances
-- ============================================================================

DROP POLICY IF EXISTS form_instances_select ON public.form_instances;
CREATE POLICY form_instances_select ON public.form_instances
FOR SELECT
TO authenticated, service_role
USING (
  is_active_user() = true
  AND (
    get_current_user_role() = 'root_admin'
    OR group_id = get_current_user_group_id()
  )
);

DROP POLICY IF EXISTS form_instances_insert ON public.form_instances;
CREATE POLICY form_instances_insert ON public.form_instances
FOR INSERT
TO authenticated, service_role
WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

DROP POLICY IF EXISTS form_instances_update_submit ON public.form_instances;
CREATE POLICY form_instances_update_submit ON public.form_instances
FOR UPDATE
TO authenticated, service_role
USING (
  is_active_user() = true
  AND get_current_user_role() = 'admin'
  AND group_id = get_current_user_group_id()
  AND status = 'draft'
);

DROP POLICY IF EXISTS form_instances_update_root_admin ON public.form_instances;
CREATE POLICY form_instances_update_root_admin ON public.form_instances
FOR UPDATE
TO authenticated, service_role
USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

-- ============================================================================
-- field_values
-- ============================================================================

DROP POLICY IF EXISTS field_values_select ON public.field_values;
CREATE POLICY field_values_select ON public.field_values
FOR SELECT
TO authenticated, service_role
USING (
  is_active_user() = true
  AND (
    get_current_user_role() = 'root_admin'
    OR EXISTS (
      SELECT 1 FROM public.form_instances fi
      WHERE fi.id = field_values.form_instance_id
      AND fi.group_id = get_current_user_group_id()
    )
  )
);

DROP POLICY IF EXISTS field_values_insert ON public.field_values;
CREATE POLICY field_values_insert ON public.field_values
FOR INSERT
TO authenticated, service_role
WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() IN ('admin', 'editor')
  AND EXISTS (
    SELECT 1 FROM public.form_instances fi
    WHERE fi.id = field_values.form_instance_id
    AND fi.group_id = get_current_user_group_id()
    AND fi.status = 'draft'
  )
);

DROP POLICY IF EXISTS field_values_update_open ON public.field_values;
CREATE POLICY field_values_update_open ON public.field_values
FOR UPDATE
TO authenticated, service_role
USING (
  is_active_user() = true
  AND assigned_to IS NULL
  AND get_current_user_role() IN ('admin', 'editor')
  AND EXISTS (
    SELECT 1 FROM public.form_instances fi
    WHERE fi.id = field_values.form_instance_id
    AND fi.group_id = get_current_user_group_id()
    AND fi.status = 'draft'
  )
);

DROP POLICY IF EXISTS field_values_update_assigned ON public.field_values;
CREATE POLICY field_values_update_assigned ON public.field_values
FOR UPDATE
TO authenticated, service_role
USING (
  is_active_user() = true
  AND assigned_to IS NOT NULL
  AND assigned_to = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.form_instances fi
    WHERE fi.id = field_values.form_instance_id
    AND fi.status = 'draft'
  )
);

DROP POLICY IF EXISTS field_values_update_admin_assign ON public.field_values;
CREATE POLICY field_values_update_admin_assign ON public.field_values
FOR UPDATE
TO authenticated, service_role
USING (
  is_active_user() = true
  AND get_current_user_role() = 'admin'
  AND EXISTS (
    SELECT 1 FROM public.form_instances fi
    WHERE fi.id = field_values.form_instance_id
    AND fi.group_id = get_current_user_group_id()
    AND fi.status = 'draft'
  )
);

-- ============================================================================
-- instance_schedules
-- ============================================================================

DROP POLICY IF EXISTS instance_schedules_select ON public.instance_schedules;
CREATE POLICY instance_schedules_select ON public.instance_schedules
FOR SELECT
TO authenticated, service_role
USING (
  is_active_user() = true
  AND (
    get_current_user_role() = 'root_admin'
    OR EXISTS (
      SELECT 1 FROM public.form_templates ft
      WHERE ft.id = instance_schedules.template_id
      AND ft.is_active = true
      AND (
        ft.sharing_mode = 'all'
        OR EXISTS (
          SELECT 1 FROM public.template_group_access tta
          WHERE tta.template_id = ft.id
          AND tta.group_id = get_current_user_group_id()
        )
      )
    )
  )
);

DROP POLICY IF EXISTS instance_schedules_insert ON public.instance_schedules;
CREATE POLICY instance_schedules_insert ON public.instance_schedules
FOR INSERT
TO authenticated, service_role
WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

DROP POLICY IF EXISTS instance_schedules_update ON public.instance_schedules;
CREATE POLICY instance_schedules_update ON public.instance_schedules
FOR UPDATE
TO authenticated, service_role
USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

-- NEW: DELETE policy for instance_schedules (needed for "Delete schedule" feature)
CREATE POLICY instance_schedules_delete ON public.instance_schedules
FOR DELETE
TO authenticated, service_role
USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

-- ============================================================================
-- schedule_group_targets
-- ============================================================================

DROP POLICY IF EXISTS schedule_group_targets_select ON public.schedule_group_targets;
CREATE POLICY schedule_group_targets_select ON public.schedule_group_targets
FOR SELECT
TO authenticated, service_role
USING (
  is_active_user() = true
  AND (
    get_current_user_role() = 'root_admin'
    OR group_id = get_current_user_group_id()
  )
);

DROP POLICY IF EXISTS schedule_group_targets_insert ON public.schedule_group_targets;
CREATE POLICY schedule_group_targets_insert ON public.schedule_group_targets
FOR INSERT
TO authenticated, service_role
WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

DROP POLICY IF EXISTS schedule_group_targets_delete ON public.schedule_group_targets;
CREATE POLICY schedule_group_targets_delete ON public.schedule_group_targets
FOR DELETE
TO authenticated, service_role
USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);
