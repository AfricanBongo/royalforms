# Report Generation & Template Lifecycle Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign report generation to be round-based, add draft/published lifecycle to report templates, create templates via upfront dialog, improve data tables and formula validation, and add breaking change detection for linked forms/reports.

**Architecture:** Database migrations add `status` columns and update the auto-generate trigger. Service layer gains draft/published lifecycle functions for reports, round-based queries, and name uniqueness checks. UI gains creation dialogs, round-based generate dialog, formula field type filtering, breaking change warnings, and editor min-height.

**Tech Stack:** PostgreSQL (migrations), Deno (Edge Function), React 19, TypeScript, Shadcn UI, BlockNote, Supabase client SDK.

---

## Task 1: Migration — Add status columns to report templates

**Files:**
- Create: `supabase/migrations/20260312200001_report_template_status.sql`

**Step 1: Write the migration**

```sql
-- Add draft/published status to report_templates
ALTER TABLE public.report_templates
  ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'
  CHECK (status IN ('draft', 'published'));

-- Add draft/published status to report_template_versions
ALTER TABLE public.report_template_versions
  ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'
  CHECK (status IN ('draft', 'published'));

-- Set all existing rows to published
UPDATE public.report_templates SET status = 'published';
UPDATE public.report_template_versions SET status = 'published';
```

**Step 2: Apply and verify**

Run: `npx supabase db reset`
Then: Use `supabase_list_tables` (verbose) to verify `status` column exists on both tables.

**Step 3: Regenerate TypeScript types**

Run: `supabase gen types typescript --local 2>/dev/null > src/types/database.ts`

**Step 4: Commit**

```
feat(reports): add draft/published status to report templates and versions
```

---

## Task 2: Migration — Update auto-generate trigger to check full round

**Files:**
- Create: `supabase/migrations/20260312200002_report_auto_generate_full_round.sql`

**Step 1: Write the migration**

Replace the `trigger_on_form_instance_submitted()` function. The key change: instead of checking siblings in the **same group + same day**, check all instances for the **same form template + same day** across all groups.

Current logic (to replace):
```sql
-- Old: checks only same group
SELECT count(*) FILTER (WHERE fi.status != 'submitted') INTO pending_count
FROM public.form_instances fi
JOIN public.template_versions tv ON fi.template_version_id = tv.id
WHERE tv.template_id = v_form_template_id
  AND fi.group_id = NEW.group_id
  AND fi.created_at::date = NEW.created_at::date
  AND fi.is_archived = false;
```

New logic:
```sql
-- New: checks ALL groups for the round
SELECT count(*) FILTER (WHERE fi.status != 'submitted') INTO pending_count
FROM public.form_instances fi
JOIN public.template_versions tv ON fi.template_version_id = tv.id
WHERE tv.template_id = v_form_template_id
  AND fi.created_at::date = NEW.created_at::date
  AND fi.is_archived = false;
```

Also update the instance ID collection query to include all groups in the round (not just the submitting group).

Read `supabase/migrations/20260305000005_reports.sql` lines 200-288 for the full current trigger function before writing the replacement.

**Step 2: Apply and verify**

Run: `npx supabase db reset`
Run: `supabase_get_advisors` (security) to verify no regressions.

**Step 3: Commit**

```
fix(reports): auto-generate checks full round across all groups
```

---

## Task 3: Service — Report template draft/published lifecycle

**Files:**
- Modify: `src/services/reports.ts`

**Step 1: Add new service functions**

Following the pattern from `src/services/form-templates.ts` (lines 435-583 for `saveDraft`, `updateDraft`, `publishDraft`, and lines 706-800 for `discardDraft`, `createDraftVersion`), add equivalent functions for reports:

- `saveDraftReportTemplate(input)` — Create report template with `status: 'draft'`, version 1 with `status: 'draft'`. Input: `name, abbreviation, form_template_id`. Sections can be empty.
- `publishReportTemplate(templateId)` — Set template `status = 'published'`, latest version `status = 'published'`.
- `discardReportDraft(templateId)` — If template has only one version (draft that was never published), deactivate. If template is published with a draft version on top, delete the draft version and restore previous published version as latest.
- `createReportDraftVersion(templateId)` — Copy sections/fields from current published version into a new draft version (N+1). Used when editing a published template.

**Step 2: Update existing functions**

- `createReportTemplate()` — Should now set `status: 'draft'` on both template and version. Remove the full sections/fields creation (handled by auto-save after dialog).
- `updateReportTemplate()` — Already saves in-place (fixed earlier). No changes needed.
- `fetchReportTemplates()` — Include `status` in the select and return type.
- `fetchReportTemplateById()` — Include `status` in the select and return type.

**Step 3: Update `ReportTemplateListRow` and `ReportTemplateDetail` interfaces**

Add `status: 'draft' | 'published'` to both interfaces.

**Step 4: Add name uniqueness check functions**

```typescript
export async function isReportTemplateNameTaken(name: string): Promise<boolean>
```

Query `report_templates` where `name = name.trim()` and `is_active = true`. Return `true` if count > 0.

Also add to `src/services/form-templates.ts`:
```typescript
export async function isFormTemplateNameTaken(name: string): Promise<boolean>
```

Query `form_templates` where `name = name.trim()` and `is_active = true`.

**Step 5: Type-check**

Run: `npx tsc -b`

**Step 6: Commit**

```
feat(reports): add draft/published lifecycle and name uniqueness checks
```

---

## Task 4: Service — Round-based form instance queries

**Files:**
- Modify: `src/services/reports.ts` (or create `src/services/form-instance-rounds.ts` if cleaner)

**Step 1: Add round query function**

```typescript
interface FormInstanceRound {
  date: string                    // ISO date string (YYYY-MM-DD)
  total_count: number             // total instances in the round
  submitted_count: number         // submitted instances
  groups: Array<{
    group_id: string
    group_name: string
    form_instance_id: string
    status: 'pending' | 'submitted'
  }>
}

export async function fetchFormInstanceRounds(
  formTemplateId: string,
): Promise<FormInstanceRound[]>
```

Query `form_instances` joined with `template_versions` (to filter by template) and `groups` (for name), grouped by `created_at::date`, ordered by date descending. Build the round structure from the results.

**Step 2: Type-check**

Run: `npx tsc -b`

**Step 3: Commit**

```
feat(reports): add round-based form instance query
```

---

## Task 5: UI — Create Form Template dialog

**Files:**
- Create: `src/features/forms/CreateFormTemplateDialog.tsx`
- Modify: `src/routes/_authenticated/forms/index.tsx` (replace direct navigation with dialog)
- Modify: `src/routes/_authenticated/forms/new.tsx` (remove — or convert to redirect to edit)

**Step 1: Check Shadcn for dialog component**

Use `shadcn_search_items_in_registries` for "dialog". Use the existing `Dialog` component from `@/components/ui/dialog`.

**Step 2: Create the dialog component**

Props: `open: boolean`, `onOpenChange: (open: boolean) => void`

Content:
- Text input for template name
- On submit: check `isFormTemplateNameTaken(name)`. If taken, show inline error.
- If unique: call `saveDraft({ name, description: null, sections: [] })` to create the template
- Navigate to `/forms/$templateId/edit`

**Step 3: Wire into forms list page**

Replace the "New Form" button's `navigate('/forms/new')` with opening the dialog.

**Step 4: Update `/forms/new.tsx`**

Either remove entirely (if the dialog handles creation) or convert to a redirect to the forms list page. The new flow is: list page -> dialog -> edit page.

**Step 5: Type-check and lint**

Run: `npx tsc -b && npm run lint`

**Step 6: Commit**

```
feat(forms): create form template via upfront dialog
```

---

## Task 6: UI — Create Report Template dialog

**Files:**
- Create: `src/features/reports/CreateReportTemplateDialog.tsx`
- Modify: `src/routes/_authenticated/reports/index.tsx` (replace direct navigation with dialog)
- Modify: `src/routes/_authenticated/reports/new.tsx` (remove or redirect)

**Step 1: Create the dialog component**

Props: `open: boolean`, `onOpenChange: (open: boolean) => void`

Content:
- Text input for template name
- Select dropdown for linked form template (fetch active published form templates)
- On form template selection, show schedule info:
  - If scheduled: "Scheduled [weekly on Wednesdays]"
  - If not scheduled: "No schedule configured — reports can only be generated manually"
- On submit: check `isReportTemplateNameTaken(name)`. If taken, show inline error.
- If unique: call `saveDraftReportTemplate({ name, abbreviation: auto-generated, form_template_id })` to create the template
- Navigate to `/reports/$templateId/edit`

**Step 2: Wire into reports list page**

Replace the "New Report" button's navigation with opening the dialog.

**Step 3: Type-check and lint**

Run: `npx tsc -b && npm run lint`

**Step 4: Commit**

```
feat(reports): create report template via upfront dialog with linked form selection
```

---

## Task 7: UI — Report template edit page lifecycle updates

**Files:**
- Modify: `src/routes/_authenticated/reports/$templateId/edit.tsx`
- Modify: `src/routes/_authenticated/reports/$templateId/index.tsx` (detail page — add Edit button that creates draft version)

**Step 1: Update edit page**

- On load: check template status. If published and no draft version exists, call `createReportDraftVersion(templateId)` to create a new draft.
- "Publish" button: calls `publishReportTemplate(templateId)` then navigates to detail page.
- "Discard Draft" button: calls `discardReportDraft(templateId)`. If template was previously published, navigate to detail page. If it was draft-only, navigate to list.
- Header shows: `v{N} Draft` or `v{N} Published` based on status.

**Step 2: Update detail page**

- "Edit" button: navigates to edit page (which will create draft version on load if needed).
- "Generate Report" button: only enabled when template status is `published`.

**Step 3: Update list page**

- Show template status badge (Draft / Published).
- "Generate" action only available for published templates.

**Step 4: Type-check and lint**

Run: `npx tsc -b && npm run lint`

**Step 5: Commit**

```
feat(reports): implement draft/published lifecycle in report template UI
```

---

## Task 8: UI — Round-based Generate Report dialog

**Files:**
- Modify: `src/features/reports/GenerateReportDialog.tsx`

**Step 1: Rewrite dialog content**

Replace the flat instance-checkbox list with:
- List of rounds, each showing: date, "X/Y groups submitted"
- Latest round pre-selected
- Checkboxes for selecting multiple rounds
- Each round expandable (Collapsible from Shadcn) showing group-level checkboxes (secondary feature)
- "Generate" button sends the selected form instance IDs to `generateReport()`

**Step 2: Wire in `fetchFormInstanceRounds()`**

Load rounds on dialog open. Derive selected instance IDs from selected rounds + optional group filters.

**Step 3: Type-check and lint**

Run: `npx tsc -b && npm run lint`

**Step 4: Commit**

```
feat(reports): round-based report generation with group filtering
```

---

## Task 9: Edge Function — Data table rows per group with group name

**Files:**
- Modify: `supabase/functions/generate-report/index.ts`

**Step 1: Fetch group info for form instances**

When fetching field values, also join `form_instances.group_id` and `groups.name` so each value can be attributed to a group.

**Step 2: Rewrite table field resolution**

Current: one row per `form_instance_id`.
New: one row per group. Row identifier is `group_name` instead of `form_instance_id`.

**Step 3: Support formula columns**

Table column config can now have either:
- `template_field_id` — direct field reference (existing)
- `formula` — a formula expression string (new)

When a column has a formula, evaluate it per-group using only that group's field values.

**Step 4: Field type validation for aggregates**

When resolving aggregates (SUM, AVERAGE, etc.), check the referenced field's `field_type`. Only allow `number`, `rating`, `range` for SUM/AVERAGE/MIN/MAX/MEDIAN. COUNT works on all types.

If incompatible type detected, return `{ error: "SUM requires numeric field types" }`.

**Step 5: Deploy and test locally**

Run: `npx supabase functions serve` and test with a manual invocation.

**Step 6: Commit**

```
feat(reports): data table rows per group, formula columns, field type validation
```

---

## Task 10: UI — Formula field type filtering in editor

**Files:**
- Modify: `src/features/reports/editor/FormulaBlock.tsx`
- Modify: `src/features/reports/editor/DataTableBlock.tsx`
- Modify: `src/features/reports/editor/types.ts` (if `FormFieldOption` needs `field_type`)

**Step 1: Update `FormFieldOption` type**

Ensure `field_type` is included (check if already present from prior work).

**Step 2: Filter field picker in FormulaBlock**

When showing the field picker for an aggregate function:
- If function is COUNT: show all fields
- Otherwise: filter to only `number`, `rating`, `range` field types

**Step 3: Add formula column support in DataTableBlock**

Column config gains a mode: "field" (direct reference) or "formula" (formula expression).
- When "formula" mode, show the formula builder inline (reuse `FormulaEditor` sub-component from `FormulaBlock.tsx`).
- Serialize formula config into the column definition.

**Step 4: Type-check and lint**

Run: `npx tsc -b && npm run lint`

**Step 5: Commit**

```
feat(reports): formula field type filtering and table column formula support
```

---

## Task 11: UI — WYSIWYG editor min-height

**Files:**
- Modify: `src/routes/_authenticated/reports/$templateId/edit.tsx`
- Modify: `src/routes/_authenticated/reports/new.tsx` (if still exists, or just the edit page)

**Step 1: Update editor container CSS**

Change the editor wrapper `div` to use `min-h-[calc(100vh-<offset>)]` where offset accounts for the header and metadata card height. Use `flex-grow` so it expands beyond the min-height.

Approximate: `min-h-[calc(100vh-280px)]` (adjust based on actual header + metadata height). The `280px` accounts for ~64px nav header + ~200px metadata card + ~16px padding.

**Step 2: Verify visually**

Check both new and edit pages. The editor should fill remaining vertical space and expand with content.

**Step 3: Commit**

```
style(reports): editor fills remaining vertical space with min-height
```

---

## Task 12: UI — Breaking change detection (form -> report)

**Files:**
- Create: `src/hooks/use-form-report-link-check.ts`
- Modify: `src/routes/_authenticated/forms/$templateId/edit.tsx`

**Step 1: Create the hook**

```typescript
function useFormReportLinkCheck(templateId: string, currentFields: FormField[])
```

- On mount, query `report_templates` where `form_template_id = templateId` and `is_active = true`
- If a linked report exists, fetch its latest version's fields and extract all referenced form field IDs from their configs
- Compare `currentFields` against `referencedFieldIds`:
  - `removedFields`: fields in referenced set but not in current fields
  - `typeChangedFields`: fields where type changed to incompatible type for their usage
  - `addedFields`: fields in current but not in referenced set (non-breaking)
- Return: `{ linkedReport, breakingChanges, additions, hasBreakingChanges, hasAdditions }`

**Step 2: Add inline warning to form edit page**

When `hasBreakingChanges` is true, show a warning banner below the header:
"Removing [field names] will break the linked report [Report Name]."

**Step 3: Add publish-time confirmation**

When user clicks Publish and `hasBreakingChanges` is true, show confirmation dialog:
- List the breaking changes
- "Publish Anyway" / "Cancel" buttons

When `hasAdditions` is true (and no breaking changes), show info dialog:
- "New fields added. Update the report template to include them."
- "Go to Report Template" button (link to `/reports/$reportTemplateId/edit`)
- "Publish" button to continue

**Step 4: Type-check and lint**

Run: `npx tsc -b && npm run lint`

**Step 5: Commit**

```
feat(forms): breaking change detection for linked report templates
```

---

## Task 13: UI — Form schedule auto-generate notice

**Files:**
- Modify: The schedule creation/edit UI component (find via `instance_schedules` or `InstanceSchedule` references)

**Step 1: Check for linked report**

When the schedule form loads, query `report_templates` where `form_template_id` matches and `is_active = true`.

**Step 2: Show informational notice**

If a linked report exists, show below the schedule form:
"This form has a linked report ([Report Name]). Auto-generate is currently [ON/OFF]."
Include a link: "Manage in report settings" -> `/reports/$reportTemplateId/edit`

**Step 3: Type-check and lint**

Run: `npx tsc -b && npm run lint`

**Step 4: Commit**

```
feat(forms): show linked report auto-generate notice in schedule UI
```

---

## Task 14: Final verification and build

**Step 1: Full type-check**

Run: `npx tsc -b`

**Step 2: Full lint**

Run: `npm run lint`

**Step 3: Production build**

Run: `npm run build`

**Step 4: Reset DB and verify migrations**

Run: `npx supabase db reset`

**Step 5: Regenerate types**

Run: `supabase gen types typescript --local 2>/dev/null > src/types/database.ts`

**Step 6: Run security advisors**

Run: `supabase_get_advisors` (security + performance)

**Step 7: Commit any fixes**

```
chore(reports): final verification fixes
```
