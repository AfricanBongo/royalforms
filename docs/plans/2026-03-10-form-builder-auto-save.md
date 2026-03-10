# Form Builder Auto-Save Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace manual Save Draft with debounced auto-save, add draft versions for published template editing, and show save status in the header.

**Architecture:** New `template_versions.status` column enables draft/published distinction per version. A `useAutoSave` hook handles debounced persistence with a state machine (idle → dirty → saving → saved). Both `/forms/new` and `/forms/$templateId/edit` use the same hook, unifying the save flow.

**Tech Stack:** Supabase (PostgreSQL migrations, RLS policies), React hooks, TanStack Router (navigate with `replace: true`).

---

### Task 1: Database Migration — `template_versions.status` + CASCADE + RLS

**Files:**
- Create: `supabase/migrations/20260312000002_add_version_status_and_cascades.sql`

**Step 1: Write the migration**

```sql
-- Add status column to template_versions (draft/published per version)
ALTER TABLE public.template_versions
  ADD COLUMN status TEXT NOT NULL DEFAULT 'draft';

-- Backfill: all existing versions are published
UPDATE public.template_versions SET status = 'published';

-- Add ON DELETE CASCADE to template_sections → template_versions
ALTER TABLE public.template_sections
  DROP CONSTRAINT template_sections_template_version_id_fkey,
  ADD CONSTRAINT template_sections_template_version_id_fkey
    FOREIGN KEY (template_version_id)
    REFERENCES public.template_versions(id)
    ON DELETE CASCADE;

-- Add ON DELETE CASCADE to template_versions → form_templates
ALTER TABLE public.template_versions
  DROP CONSTRAINT template_versions_template_id_fkey,
  ADD CONSTRAINT template_versions_template_id_fkey
    FOREIGN KEY (template_id)
    REFERENCES public.form_templates(id)
    ON DELETE CASCADE;

-- DELETE policy on form_templates (root_admin only, draft templates only)
CREATE POLICY form_templates_delete ON public.form_templates
FOR DELETE USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
  AND status = 'draft'
);

-- DELETE policy on template_versions (root_admin only, draft versions only)
CREATE POLICY template_versions_delete ON public.template_versions
FOR DELETE USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
  AND status = 'draft'
);

-- Recreate templates_with_stats view to include version status info
DROP VIEW IF EXISTS public.templates_with_stats;

CREATE VIEW public.templates_with_stats AS
SELECT
  ft.id,
  ft.name,
  ft.description,
  ft.sharing_mode,
  ft.status,
  ft.is_active,
  ft.created_at,
  ft.updated_at,
  COALESCE(lv.version_number, 0)  AS latest_version,
  COALESCE(lv.version_status, 'draft') AS latest_version_status,
  COALESCE(ic.submitted_count, 0) AS submitted_count,
  COALESCE(ic.pending_count, 0)   AS pending_count
FROM public.form_templates ft
LEFT JOIN LATERAL (
  SELECT tv.version_number, tv.status AS version_status
  FROM public.template_versions tv
  WHERE tv.template_id = ft.id
    AND tv.is_latest = true
  LIMIT 1
) lv ON true
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) FILTER (WHERE fi.status = 'submitted') AS submitted_count,
    COUNT(*) FILTER (WHERE fi.status = 'draft')     AS pending_count
  FROM public.form_instances fi
  INNER JOIN public.template_versions tv2
    ON tv2.id = fi.template_version_id
  WHERE tv2.template_id = ft.id
    AND fi.is_archived = false
) ic ON true;

COMMENT ON VIEW public.templates_with_stats IS
  'Template list with status, latest version number/status and instance counts.';

-- Update create_scheduled_instances to only use published versions
CREATE OR REPLACE FUNCTION public.create_scheduled_instances()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
  target RECORD;
  v_latest_version_id UUID;
  v_readable_id TEXT;
  v_new_next_run TIMESTAMPTZ;
BEGIN
  FOR rec IN
    SELECT
      s.id AS schedule_id,
      s.template_id,
      s.repeat_interval,
      s.repeat_every,
      s.next_run_at,
      s.created_by
    FROM instance_schedules s
    JOIN form_templates ft ON ft.id = s.template_id
    WHERE s.is_active = true
      AND s.next_run_at <= now()
      AND ft.is_active = true
      AND ft.status = 'published'
  LOOP
    SELECT tv.id INTO v_latest_version_id
    FROM template_versions tv
    WHERE tv.template_id = rec.template_id
      AND tv.is_latest = true
      AND tv.status = 'published'
    LIMIT 1;

    IF v_latest_version_id IS NULL THEN
      RAISE WARNING 'create_scheduled_instances: No published version for template %, skipping schedule %',
        rec.template_id, rec.schedule_id;
      CONTINUE;
    END IF;

    FOR target IN
      SELECT sgt.group_id
      FROM schedule_group_targets sgt
      WHERE sgt.schedule_id = rec.schedule_id
    LOOP
      LOOP
        v_readable_id := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
        EXIT WHEN NOT EXISTS (
          SELECT 1 FROM form_instances WHERE readable_id = v_readable_id
        );
      END LOOP;

      INSERT INTO form_instances (
        readable_id,
        template_version_id,
        group_id,
        status,
        created_by
      ) VALUES (
        v_readable_id,
        v_latest_version_id,
        target.group_id,
        'draft',
        rec.created_by
      );
    END LOOP;

    CASE rec.repeat_interval
      WHEN 'daily' THEN
        v_new_next_run := rec.next_run_at + (rec.repeat_every || ' days')::interval;
      WHEN 'weekly' THEN
        v_new_next_run := rec.next_run_at + (rec.repeat_every * 7 || ' days')::interval;
      WHEN 'bi_weekly' THEN
        v_new_next_run := rec.next_run_at + (rec.repeat_every * 14 || ' days')::interval;
      WHEN 'monthly' THEN
        v_new_next_run := rec.next_run_at + (rec.repeat_every || ' months')::interval;
      ELSE
        v_new_next_run := rec.next_run_at + interval '1 day';
    END CASE;

    UPDATE instance_schedules
    SET last_run_at = now(),
        next_run_at = v_new_next_run,
        updated_at = now()
    WHERE id = rec.schedule_id;
  END LOOP;
END;
$$;
```

**Step 2: Apply and verify**

```bash
npx supabase db reset
```

Use `supabase_list_tables` (verbose) to verify `template_versions` has `status` column.
Use `supabase_get_advisors` (security) to verify RLS.

**Step 3: Regenerate TypeScript types**

```bash
npx supabase gen types typescript --local 2>/dev/null > src/types/database.ts
```

**Step 4: Commit**

```bash
git add supabase/migrations/20260312000002_add_version_status_and_cascades.sql src/types/database.ts
git commit -m "feat(db): add version status column, cascades, and delete policies for auto-save"
```

---

### Task 2: Service Layer — New + Modified Functions

**Files:**
- Modify: `src/services/form-templates.ts`

**Step 1: Update `TemplateListRow` interface (~line 20)**

Add `latest_version_status: string` to the interface. Update `fetchTemplates` and `fetchTemplateDetail` queries and mappings to include the new field.

**Step 2: Add `deleteDraftTemplate` function**

```typescript
export async function deleteDraftTemplate(templateId: string): Promise<void> {
  // CASCADE handles versions → sections → fields
  const { error } = await supabase
    .from('form_templates')
    .delete()
    .eq('id', templateId)
    .eq('status', 'draft')

  if (error) throw error
}
```

**Step 3: Add `discardDraftVersion` function**

```typescript
export async function discardDraftVersion(templateId: string): Promise<void> {
  // Find and delete the draft version
  const { data: draftVer, error: findErr } = await supabase
    .from('template_versions')
    .select('id, version_number')
    .eq('template_id', templateId)
    .eq('status', 'draft')
    .eq('is_latest', true)
    .single()

  if (findErr) throw findErr

  // Delete draft version (CASCADE handles sections/fields)
  const { error: delErr } = await supabase
    .from('template_versions')
    .delete()
    .eq('id', draftVer.id)

  if (delErr) throw delErr

  // Restore previous published version as latest
  const { error: restoreErr } = await supabase
    .from('template_versions')
    .update({ is_latest: true })
    .eq('template_id', templateId)
    .eq('version_number', draftVer.version_number - 1)

  if (restoreErr) throw restoreErr
}
```

**Step 4: Add `createDraftVersion` function**

Creates a new draft version row for a published template by copying sections/fields from the current published version. Returns the version number.

```typescript
export async function createDraftVersion(templateId: string): Promise<{ versionNumber: number }> {
  const user = await getCurrentAuthUser()

  // Get current published version
  const { data: current, error: cvErr } = await supabase
    .from('template_versions')
    .select('id, version_number')
    .eq('template_id', templateId)
    .eq('is_latest', true)
    .eq('status', 'published')
    .single()

  if (cvErr) throw cvErr

  // Unset is_latest on current
  const { error: unErr } = await supabase
    .from('template_versions')
    .update({ is_latest: false })
    .eq('id', current.id)

  if (unErr) throw unErr

  // Create new draft version
  const newNum = current.version_number + 1
  const { data: newVer, error: nErr } = await supabase
    .from('template_versions')
    .insert({
      template_id: templateId,
      version_number: newNum,
      is_latest: true,
      status: 'draft',
      created_by: user.id,
    })
    .select('id')
    .single()

  if (nErr) throw nErr

  // Copy sections and fields from the current version
  const { data: sections, error: secErr } = await supabase
    .from('template_sections')
    .select('title, description, sort_order, template_fields(label, description, field_type, sort_order, is_required, options, validation_rules)')
    .eq('template_version_id', current.id)
    .order('sort_order')

  if (secErr) throw secErr

  for (const sec of sections ?? []) {
    const { data: newSec, error: nsErr } = await supabase
      .from('template_sections')
      .insert({
        template_version_id: newVer.id,
        title: sec.title,
        description: sec.description,
        sort_order: sec.sort_order,
      })
      .select('id')
      .single()

    if (nsErr) throw nsErr

    const fields = sec.template_fields ?? []
    if (fields.length > 0) {
      const fieldRows = fields.map((f: Record<string, unknown>) => ({
        template_section_id: newSec.id,
        label: f.label,
        description: f.description,
        field_type: f.field_type,
        sort_order: f.sort_order,
        is_required: f.is_required,
        options: f.options,
        validation_rules: f.validation_rules,
      }))

      const { error: fErr } = await supabase
        .from('template_fields')
        .insert(fieldRows)

      if (fErr) throw fErr
    }
  }

  return { versionNumber: newNum }
}
```

**Step 5: Update `publishDraft` to also set version status**

```typescript
export async function publishDraft(templateId: string): Promise<void> {
  // Set template status to published
  const { error: tErr } = await supabase
    .from('form_templates')
    .update({ status: 'published' })
    .eq('id', templateId)

  if (tErr) throw tErr

  // Set the latest version status to published
  const { error: vErr } = await supabase
    .from('template_versions')
    .update({ status: 'published' })
    .eq('template_id', templateId)
    .eq('is_latest', true)

  if (vErr) throw vErr
}
```

**Step 6: Remove `createTemplateVersion` function**

This is replaced by the `createDraftVersion` → auto-save → `publishDraft` flow.

**Step 7: Build check**

```bash
npm run build
```

**Step 8: Commit**

```bash
git add src/services/form-templates.ts
git commit -m "feat(services): add draft version CRUD and update publishDraft for auto-save"
```

---

### Task 3: `useAutoSave` Hook

**Files:**
- Create: `src/hooks/use-auto-save.ts`

**Step 1: Write the hook**

The hook:
- Accepts `templateId | null`, `BuilderState`, `toCreateInput()`
- Compares state via `JSON.stringify` against a previous snapshot ref
- Skips the initial render (loading data is not a "change")
- Has a "meaningful change" gate (title, description, or any field label non-empty)
- Debounces 3s, calls `saveDraft` or `updateDraft`
- Exposes `flush()` for pre-publish/pre-navigate immediate save
- Tracks `saveStatus: 'idle' | 'dirty' | 'saving' | 'saved'`
- Tracks `persistedTemplateId`, `versionNumber`, `templateStatus`
- On first save of a new form, returns the new templateId so the page can update the URL

Key implementation details:
- Use `useRef` for the debounce timer, previous state snapshot, and in-flight save flag
- Use `useEffect` watching `JSON.stringify(builderState)` to detect changes
- `flush()` returns a Promise so callers can `await flush()` before publishing
- `saved` status clears back to `idle` after 2 seconds via setTimeout

**Step 2: Build check**

```bash
npm run build
```

**Step 3: Commit**

```bash
git add src/hooks/use-auto-save.ts
git commit -m "feat(hooks): add useAutoSave hook with debounced persistence"
```

---

### Task 4: Rewrite `/forms/new` Page

**Files:**
- Modify: `src/routes/_authenticated/forms/new.tsx`

**Step 1: Rewrite the page**

Changes:
- Remove `useBlocker`, blocker dialog, `isIntentionalNavRef`
- Remove manual `handleSaveDraft` and `isSaving` state
- Add `useAutoSave({ templateId: null, ... })`
- After first auto-save returns a `persistedTemplateId`, call `navigate({ to: '/forms/$templateId/edit', params: { templateId }, replace: true })`
- Replace header actions:
  - Left side (inline text): `Draft · v1 · [saveStatus]`
  - Right side buttons: `[Discard Draft] [Publish]`
- "Discard Draft": if `persistedTemplateId` exists → `deleteDraftTemplate()` → navigate to `/forms`; else just navigate away
- "Publish": `await flush()` → `publishDraft(persistedTemplateId)` → navigate to `/forms/$templateId`
- Use `setBreadcrumbs` for `Forms > [name] > New` pattern (or just `setPageTitle('New Form')` — keep simple)

**Step 2: Build check**

```bash
npm run build
```

**Step 3: Commit**

```bash
git add src/routes/_authenticated/forms/new.tsx
git commit -m "feat(builder): auto-save on new form page, replace manual save draft"
```

---

### Task 5: Rewrite `/forms/$templateId/edit` Page

**Files:**
- Modify: `src/routes/_authenticated/forms/$templateId/edit.tsx`

**Step 1: Rewrite the page**

Changes:
- Remove `useBlocker`, blocker dialog, `isIntentionalNavRef`
- Remove manual `handleSaveDraft`, `handlePublishDraft`, `handlePublish`, `isSaving` state
- On load:
  - Fetch template detail (status, version info)
  - If `template.status === 'draft'`: load draft version into builder, auto-save updates in-place
  - If `template.status === 'published'`: check for existing draft version. If none, call `createDraftVersion()`. Load the draft version into builder.
- Add `useAutoSave({ templateId, ... })`
- Replace header actions:
  - Left side (inline text): `[Draft|Published] · v[N] · [saveStatus]`
  - Right side buttons:
    - Draft (never published): `[Discard Draft] [Publish]`
    - Published with draft version: `[Discard Draft] [Publish New Version]`
- "Discard Draft":
  - If `template.status === 'draft'` → `deleteDraftTemplate()` → navigate to `/forms`
  - If `template.status === 'published'` → `discardDraftVersion()` → navigate to `/forms/$templateId`
- "Publish" / "Publish New Version": `await flush()` → `publishDraft()` → navigate

**Step 2: Build check**

```bash
npm run build
```

**Step 3: Commit**

```bash
git add src/routes/_authenticated/forms/$templateId/edit.tsx
git commit -m "feat(builder): auto-save on edit page, draft versions for published templates"
```

---

### Task 6: Update Templates List Page + fetchTemplateForEditing

**Files:**
- Modify: `src/routes/_authenticated/forms/index.tsx`
- Modify: `src/services/form-templates.ts`

**Step 1: Update `fetchTemplateForEditing`**

The function needs to handle the case where a published template has a draft version (load the draft version's sections, not the published one). Update the version lookup to prefer the draft version if it exists.

**Step 2: Update list page**

The click handler on the template row should also navigate to edit when a published template has a draft version (i.e. `latest_version_status === 'draft'`). Optionally show a "Editing" badge next to the draft badge.

**Step 3: Build check**

```bash
npm run build
```

**Step 4: Commit**

```bash
git add src/routes/_authenticated/forms/index.tsx src/services/form-templates.ts
git commit -m "feat(templates): show draft version status in list, update loading logic"
```

---

### Task 7: Final Verification + TODO Update

**Step 1: Full build + lint**

```bash
npm run build
npm run lint
```

**Step 2: Reset DB and verify migrations**

```bash
npx supabase db reset
```

**Step 3: Run security advisors**

Use `supabase_get_advisors` (security + performance).

**Step 4: Update `docs/TODO.md`**

Cross off auto-save items, add any new items discovered during implementation.

**Step 5: Commit**

```bash
git add docs/TODO.md
git commit -m "docs: update TODO with auto-save completion"
```
