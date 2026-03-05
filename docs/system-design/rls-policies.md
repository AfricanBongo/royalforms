# RLS Policy Definitions

[Back to System Design Index](./index.md)

---

## 1. Overview

Row Level Security (RLS) is the **primary authorization layer** for all data operations through the Supabase Client SDK. Every table in the `public` schema has RLS enabled. Policies use helper functions that read from JWT claims to avoid per-row queries to the `profiles` table.

Edge Functions use the **service role key** which bypasses RLS entirely. This is intentional -- Edge Functions handle operations that cannot go through the Client SDK (auth admin API, report generation, report export, short URL generation).

---

## 2. Helper Functions

Three Postgres functions extract the current user's identity from the JWT. All are `STABLE` and `SECURITY DEFINER`.

### `get_current_user_role()`

```sql
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT (auth.jwt()->'user_metadata'->>'role')::text;
$$;
```

### `get_current_user_group_id()`

```sql
CREATE OR REPLACE FUNCTION public.get_current_user_group_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT (auth.jwt()->'user_metadata'->>'group_id')::uuid;
$$;
```

### `is_active_user()`

```sql
CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE((auth.jwt()->'user_metadata'->>'is_active')::boolean, false);
$$;
```

### Usage

Every RLS policy includes `is_active_user() = true` as a base condition. Disabled users are blocked at the database level even if their JWT is still valid.

---

## 3. Policy Definitions

### 3.1 `profiles`

RLS enabled. Profiles are created by Edge Functions (invite flow) using the service role key -- no INSERT policy needed via Client SDK.

| Policy | Operation | Logic |
|---|---|---|
| `profiles_select` | SELECT | Active user. Root Admin: all rows. Others: own row + rows where `group_id` matches their group. |
| `profiles_update_self` | UPDATE | Active user can update their own row (`id = auth.uid()`). Restricted to `full_name` column only via column-level grants or application logic. |
| `profiles_update_root_admin` | UPDATE | Active Root Admin can update any row (`role`, `group_id`, `is_active`). |

```sql
-- SELECT
CREATE POLICY profiles_select ON public.profiles
FOR SELECT USING (
  is_active_user() = true
  AND (
    get_current_user_role() = 'root_admin'
    OR id = auth.uid()
    OR group_id = get_current_user_group_id()
  )
);

-- UPDATE (self)
CREATE POLICY profiles_update_self ON public.profiles
FOR UPDATE USING (
  is_active_user() = true
  AND id = auth.uid()
);

-- UPDATE (root admin)
CREATE POLICY profiles_update_root_admin ON public.profiles
FOR UPDATE USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);
```

No INSERT, DELETE policies. Profiles are created via Edge Function. No hard deletes.

---

### 3.2 `groups`

RLS enabled.

| Policy | Operation | Logic |
|---|---|---|
| `groups_select` | SELECT | Active user. Root Admin: all groups. Others: only their own group, only active groups. |
| `groups_insert` | INSERT | Active Root Admin only. |
| `groups_update` | UPDATE | Active Root Admin only. |

```sql
-- SELECT
CREATE POLICY groups_select ON public.groups
FOR SELECT USING (
  is_active_user() = true
  AND (
    get_current_user_role() = 'root_admin'
    OR (id = get_current_user_group_id() AND is_active = true)
  )
);

-- INSERT
CREATE POLICY groups_insert ON public.groups
FOR INSERT WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

-- UPDATE
CREATE POLICY groups_update ON public.groups
FOR UPDATE USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);
```

No DELETE policy. Soft-delete via `is_active`.

---

### 3.3 `member_requests`

RLS enabled.

| Policy | Operation | Logic |
|---|---|---|
| `member_requests_select` | SELECT | Active user. Root Admin: all. Admin: requests for their own group. |
| `member_requests_insert` | INSERT | Active Admin only, for their own group. `proposed_role` cannot be `root_admin`. |
| `member_requests_update` | UPDATE | Active Root Admin only (for approving/rejecting). |

```sql
-- SELECT
CREATE POLICY member_requests_select ON public.member_requests
FOR SELECT USING (
  is_active_user() = true
  AND (
    get_current_user_role() = 'root_admin'
    OR (
      get_current_user_role() = 'admin'
      AND group_id = get_current_user_group_id()
    )
  )
);

-- INSERT
CREATE POLICY member_requests_insert ON public.member_requests
FOR INSERT WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() = 'admin'
  AND group_id = get_current_user_group_id()
  AND proposed_role IN ('admin', 'editor', 'viewer')
);

-- UPDATE
CREATE POLICY member_requests_update ON public.member_requests
FOR UPDATE USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);
```

No DELETE policy. Requests are never deleted.

---

### 3.4 `form_templates`

RLS enabled.

| Policy | Operation | Logic |
|---|---|---|
| `form_templates_select` | SELECT | Active user. Root Admin: all. Others: active templates where `sharing_mode = 'all'` OR their group is in `template_group_access`. |
| `form_templates_insert` | INSERT | Active Root Admin only. |
| `form_templates_update` | UPDATE | Active Root Admin only. |

```sql
-- SELECT
CREATE POLICY form_templates_select ON public.form_templates
FOR SELECT USING (
  is_active_user() = true
  AND (
    get_current_user_role() = 'root_admin'
    OR (
      is_active = true
      AND (
        sharing_mode = 'all'
        OR EXISTS (
          SELECT 1 FROM public.template_group_access tta
          WHERE tta.template_id = form_templates.id
          AND tta.group_id = get_current_user_group_id()
        )
      )
    )
  )
);

-- INSERT
CREATE POLICY form_templates_insert ON public.form_templates
FOR INSERT WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

-- UPDATE
CREATE POLICY form_templates_update ON public.form_templates
FOR UPDATE USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);
```

No DELETE policy. Soft-delete via `is_active`.

---

### 3.5 `template_versions`

RLS enabled.

| Policy | Operation | Logic |
|---|---|---|
| `template_versions_select` | SELECT | Active user. Root Admin: all. Others: versions belonging to templates they can see. |
| `template_versions_insert` | INSERT | Active Root Admin only. |
| `template_versions_update` | UPDATE | Active Root Admin only (for `is_latest` flag toggling). |

```sql
-- SELECT
CREATE POLICY template_versions_select ON public.template_versions
FOR SELECT USING (
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
          SELECT 1 FROM public.template_group_access tta
          WHERE tta.template_id = ft.id
          AND tta.group_id = get_current_user_group_id()
        )
      )
    )
  )
);

-- INSERT
CREATE POLICY template_versions_insert ON public.template_versions
FOR INSERT WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

-- UPDATE
CREATE POLICY template_versions_update ON public.template_versions
FOR UPDATE USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);
```

---

### 3.6 `template_sections`

RLS enabled. Same pattern as `template_versions` -- read access follows template visibility, write access Root Admin only.

```sql
-- SELECT
CREATE POLICY template_sections_select ON public.template_sections
FOR SELECT USING (
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
          SELECT 1 FROM public.template_group_access tta
          WHERE tta.template_id = ft.id
          AND tta.group_id = get_current_user_group_id()
        )
      )
    )
  )
);

-- INSERT
CREATE POLICY template_sections_insert ON public.template_sections
FOR INSERT WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);
```

No UPDATE or DELETE. Sections are immutable within a version.

---

### 3.7 `template_fields`

RLS enabled. Same pattern -- read follows template visibility via section -> version -> template chain, write Root Admin only.

```sql
-- SELECT
CREATE POLICY template_fields_select ON public.template_fields
FOR SELECT USING (
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
          SELECT 1 FROM public.template_group_access tta
          WHERE tta.template_id = ft.id
          AND tta.group_id = get_current_user_group_id()
        )
      )
    )
  )
);

-- INSERT
CREATE POLICY template_fields_insert ON public.template_fields
FOR INSERT WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);
```

No UPDATE or DELETE. Fields are immutable within a version.

---

### 3.8 `template_group_access`

RLS enabled.

| Policy | Operation | Logic |
|---|---|---|
| `template_group_access_select` | SELECT | Active user. Root Admin: all. Others: rows matching their `group_id`. |
| `template_group_access_insert` | INSERT | Active Root Admin only. |
| `template_group_access_delete` | DELETE | Active Root Admin only. |

```sql
-- SELECT
CREATE POLICY template_group_access_select ON public.template_group_access
FOR SELECT USING (
  is_active_user() = true
  AND (
    get_current_user_role() = 'root_admin'
    OR group_id = get_current_user_group_id()
  )
);

-- INSERT
CREATE POLICY template_group_access_insert ON public.template_group_access
FOR INSERT WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

-- DELETE
CREATE POLICY template_group_access_delete ON public.template_group_access
FOR DELETE USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);
```

---

### 3.9 `form_instances`

RLS enabled.

| Policy | Operation | Logic |
|---|---|---|
| `form_instances_select` | SELECT | Active user. Root Admin: all. Others: instances belonging to their group (including archived). |
| `form_instances_insert` | INSERT | Active Root Admin only (one-time instances). Scheduled instances are created by pg_cron via service role key. |
| `form_instances_update_submit` | UPDATE | Active Admin of owning group: can set `status`, `submitted_by`, `submitted_at`. |
| `form_instances_update_root_admin` | UPDATE | Active Root Admin: can update `is_archived`. |

```sql
-- SELECT
CREATE POLICY form_instances_select ON public.form_instances
FOR SELECT USING (
  is_active_user() = true
  AND (
    get_current_user_role() = 'root_admin'
    OR group_id = get_current_user_group_id()
  )
);

-- INSERT
CREATE POLICY form_instances_insert ON public.form_instances
FOR INSERT WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

-- UPDATE (submit - admin of owning group)
CREATE POLICY form_instances_update_submit ON public.form_instances
FOR UPDATE USING (
  is_active_user() = true
  AND get_current_user_role() = 'admin'
  AND group_id = get_current_user_group_id()
  AND status = 'draft'
);

-- UPDATE (root admin - archival)
CREATE POLICY form_instances_update_root_admin ON public.form_instances
FOR UPDATE USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);
```

No DELETE policy. No hard deletes.

---

### 3.10 `field_values`

RLS enabled. This is the most nuanced table due to field assignment and lazy creation.

| Policy | Operation | Logic |
|---|---|---|
| `field_values_select` | SELECT | Active user. Root Admin: all. Others: must be member of the form instance's owning group. |
| `field_values_insert` | INSERT | Instance must be `draft`. User must be Admin or Editor of the owning group. |
| `field_values_update_open` | UPDATE | Instance must be `draft`. Field is unassigned (`assigned_to IS NULL`). User must be Admin or Editor of the owning group. |
| `field_values_update_assigned` | UPDATE | Instance must be `draft`. Field is assigned. User must be the assigned Editor (`assigned_to = auth.uid()`). |
| `field_values_update_admin_assign` | UPDATE | Instance must be `draft`. User must be Admin of the owning group. For updating `assigned_to` and `assigned_by` columns. |

```sql
-- SELECT
CREATE POLICY field_values_select ON public.field_values
FOR SELECT USING (
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

-- INSERT (lazy creation on first edit or assignment)
CREATE POLICY field_values_insert ON public.field_values
FOR INSERT WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() IN ('admin', 'editor')
  AND EXISTS (
    SELECT 1 FROM public.form_instances fi
    WHERE fi.id = field_values.form_instance_id
    AND fi.group_id = get_current_user_group_id()
    AND fi.status = 'draft'
  )
);

-- UPDATE (open field - no assignment)
CREATE POLICY field_values_update_open ON public.field_values
FOR UPDATE USING (
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

-- UPDATE (assigned field - only assigned editor)
CREATE POLICY field_values_update_assigned ON public.field_values
FOR UPDATE USING (
  is_active_user() = true
  AND assigned_to IS NOT NULL
  AND assigned_to = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.form_instances fi
    WHERE fi.id = field_values.form_instance_id
    AND fi.status = 'draft'
  )
);

-- UPDATE (admin can assign/reassign/unassign fields)
CREATE POLICY field_values_update_admin_assign ON public.field_values
FOR UPDATE USING (
  is_active_user() = true
  AND get_current_user_role() = 'admin'
  AND EXISTS (
    SELECT 1 FROM public.form_instances fi
    WHERE fi.id = field_values.form_instance_id
    AND fi.group_id = get_current_user_group_id()
    AND fi.status = 'draft'
  )
);
```

No DELETE policy. Field values are never deleted.

---

### 3.11 `instance_schedules`

RLS enabled.

| Policy | Operation | Logic |
|---|---|---|
| `instance_schedules_select` | SELECT | Active user. Root Admin: all. Others: schedules for templates they can see. |
| `instance_schedules_insert` | INSERT | Active Root Admin only. |
| `instance_schedules_update` | UPDATE | Active Root Admin only. |

```sql
-- SELECT
CREATE POLICY instance_schedules_select ON public.instance_schedules
FOR SELECT USING (
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

-- INSERT
CREATE POLICY instance_schedules_insert ON public.instance_schedules
FOR INSERT WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

-- UPDATE
CREATE POLICY instance_schedules_update ON public.instance_schedules
FOR UPDATE USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);
```

---

### 3.12 `schedule_group_targets`

RLS enabled.

```sql
-- SELECT
CREATE POLICY schedule_group_targets_select ON public.schedule_group_targets
FOR SELECT USING (
  is_active_user() = true
  AND (
    get_current_user_role() = 'root_admin'
    OR group_id = get_current_user_group_id()
  )
);

-- INSERT
CREATE POLICY schedule_group_targets_insert ON public.schedule_group_targets
FOR INSERT WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

-- DELETE
CREATE POLICY schedule_group_targets_delete ON public.schedule_group_targets
FOR DELETE USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);
```

---

### 3.13 `report_templates`

RLS enabled. Report templates are only visible to Root Admin.

```sql
-- SELECT
CREATE POLICY report_templates_select ON public.report_templates
FOR SELECT USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

-- INSERT
CREATE POLICY report_templates_insert ON public.report_templates
FOR INSERT WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

-- UPDATE
CREATE POLICY report_templates_update ON public.report_templates
FOR UPDATE USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);
```

---

### 3.14 `report_template_versions`

RLS enabled. Root Admin only.

```sql
-- SELECT
CREATE POLICY report_template_versions_select ON public.report_template_versions
FOR SELECT USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

-- INSERT
CREATE POLICY report_template_versions_insert ON public.report_template_versions
FOR INSERT WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

-- UPDATE
CREATE POLICY report_template_versions_update ON public.report_template_versions
FOR UPDATE USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);
```

---

### 3.15 `report_template_sections`

RLS enabled. Root Admin only.

```sql
-- SELECT
CREATE POLICY report_template_sections_select ON public.report_template_sections
FOR SELECT USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

-- INSERT
CREATE POLICY report_template_sections_insert ON public.report_template_sections
FOR INSERT WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);
```

No UPDATE or DELETE. Sections are immutable within a version.

---

### 3.16 `report_template_fields`

RLS enabled. Root Admin only.

```sql
-- SELECT
CREATE POLICY report_template_fields_select ON public.report_template_fields
FOR SELECT USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

-- INSERT
CREATE POLICY report_template_fields_insert ON public.report_template_fields
FOR INSERT WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);
```

No UPDATE or DELETE. Fields are immutable within a version.

---

### 3.17 `report_instances`

RLS enabled. Report instances are viewable by any authenticated active user. Created and updated only by Edge Functions (service role key).

```sql
-- SELECT (any authenticated active user)
CREATE POLICY report_instances_select ON public.report_instances
FOR SELECT USING (
  is_active_user() = true
);
```

No INSERT, UPDATE, or DELETE policies. Report instances are created by the `generate-report` Edge Function and updated by the `export-report` Edge Function, both using the service role key.

---

## 4. Summary Matrix

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | Root Admin: all. Others: own row + same group. | Edge Function only (service role). | Self: own `full_name`. Root Admin: any row. | None. |
| `groups` | Root Admin: all. Others: own active group. | Root Admin. | Root Admin. | None. |
| `member_requests` | Root Admin: all. Admin: own group. | Admin: own group, non-root_admin roles. | Root Admin. | None. |
| `form_templates` | Root Admin: all. Others: active + shared/accessible. | Root Admin. | Root Admin. | None. |
| `template_versions` | Root Admin: all. Others: via template visibility. | Root Admin. | Root Admin. | None. |
| `template_sections` | Root Admin: all. Others: via template visibility. | Root Admin. | None. | None. |
| `template_fields` | Root Admin: all. Others: via template visibility. | Root Admin. | None. | None. |
| `template_group_access` | Root Admin: all. Others: own group rows. | Root Admin. | None. | Root Admin. |
| `form_instances` | Root Admin: all. Others: own group. | Root Admin. | Admin: submit. Root Admin: archive. | None. |
| `field_values` | Root Admin: all. Others: own group instances. | Admin/Editor: draft instances, own group. | Open: Admin/Editor. Assigned: assigned Editor. Admin: reassign. | None. |
| `instance_schedules` | Root Admin: all. Others: via template visibility. | Root Admin. | Root Admin. | None. |
| `schedule_group_targets` | Root Admin: all. Others: own group rows. | Root Admin. | None. | Root Admin. |
| `report_templates` | Root Admin. | Root Admin. | Root Admin. | None. |
| `report_template_versions` | Root Admin. | Root Admin. | Root Admin. | None. |
| `report_template_sections` | Root Admin. | Root Admin. | None. | None. |
| `report_template_fields` | Root Admin. | Root Admin. | None. | None. |
| `report_instances` | Any authenticated active user. | Edge Function only (service role). | Edge Function only (service role). | None. |

---

## 5. Important Notes

### JWT Metadata Sync

RLS helper functions read from `auth.jwt()->'user_metadata'`. This data is set at invite time and must be kept in sync with the `profiles` table. When a role, group, or active status changes in `profiles`, the Edge Function must also call `supabase.auth.admin.updateUserById()` to update the JWT metadata. **If these fall out of sync, RLS will enforce stale permissions until the user's token refreshes.**

### Service Role Bypass

Operations using the service role key bypass RLS entirely. This applies to:
- Edge Functions (user invites, report generation, report export, short URL updates)
- pg_cron jobs (scheduled instance creation)
- Database triggers invoking Edge Functions via pg_net

### No Hard Deletes

No table has a DELETE policy for regular data (only `template_group_access` and `schedule_group_targets` junction tables allow Root Admin deletes). All other removals are soft-deletes via `is_active` or `is_archived` flags.

### Performance Considerations

- Helper functions read from JWT claims (in-memory), not from database tables. No additional queries per row check.
- Policies with `EXISTS` subqueries (e.g., `template_versions_select` checking template visibility) should be indexed. Ensure foreign key columns used in these joins have indexes.
- The `field_values` policies join to `form_instances` for group and status checks. The `form_instance_id` FK on `field_values` should be indexed (it is, as part of the unique constraint on `form_instance_id, template_field_id`).
