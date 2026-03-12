# Report Generation & Template Lifecycle Redesign

Date: 2026-03-12

## Context

Several UX and architectural changes to how report templates are created, edited, and how report instances are generated. Also includes a fix to the form template creation flow that applies to both forms and reports.

## Changes

### 1. Template Creation via Dialog (Forms + Reports)

**Problem:** When creating a new template, the first auto-save creates the DB record while the user is typing. This causes a page stutter and can lose in-progress work.

**Solution:** Collect required info in a dialog first, create the draft in the DB, then navigate to the editor with an existing template ID. Every subsequent save is an in-place update.

**Form templates:**
- Dialog collects: name
- Checks name uniqueness before proceeding
- Creates template with `status: 'draft'`, version 1, empty sections
- Navigates to `/forms/$templateId/edit`

**Report templates:**
- Dialog collects: name, linked form template
- Checks name uniqueness before proceeding
- Creates template with `status: 'draft'`, version 1, empty sections
- Navigates to `/reports/$templateId/edit`
- Description and auto-generate toggle remain on the editor page

### 2. Report Template Draft/Published Lifecycle

Report templates gain the same status workflow as form templates.

**State transitions:**
1. Create (via dialog) -> `status = 'draft'`, version 1
2. Edit (auto-save) -> updates in-place on current draft version
3. Publish -> marks template and version as `published`
4. Edit a published template -> creates new draft version (N+1), previous published version stays intact
5. Discard draft of published template -> deletes draft version, restores previous published version as latest
6. Generate report instance -> only available on published templates

**Migration:** All existing report templates treated as `published`.

**DB changes:**
- Add `status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published'))` to `report_templates`
- Add `status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published'))` to `report_template_versions`
- Migration sets all existing rows to `'published'`

### 3. Rounds (Semantic Concept)

A "round" = all form instances for the same form template created on the same `created_at::date`. Includes both scheduled and manually dispatched instances. No DB schema changes needed -- this is a query-time grouping.

### 4. Auto-Generate Trigger Scope Change

**Current:** `trigger_on_form_instance_submitted` checks if all instances in the **same group + same day** are submitted.

**New:** Check if all instances across **all groups** for that form template on the same day are submitted. The entire round must be complete before auto-generating.

**Change location:** `trigger_on_form_instance_submitted()` function in the reports migration.

**Auto-generate toggle** lives on the report template only. The form schedule UI shows an informational notice when a linked report exists, with a link to the report template settings. No cross-concern coupling.

### 5. Generate Report Dialog -- Round-Based

Replace the current flat instance-checkbox list with a round-based selection.

**UI structure:**
- List of rounds grouped by date (e.g., "March 12, 2026 -- 5/5 groups submitted")
- Latest round pre-selected by default
- User can select multiple rounds
- Each round is expandable (secondary/advanced) to filter by specific groups within it
- Group names shown as identifiers, not form instance IDs

**Data flow:**
- Query form instances grouped by `created_at::date` for the linked form template
- For each date, show group count (submitted vs total)
- Selected rounds + optional group filters determine which `form_instance_ids` are sent to the generate-report Edge Function

### 6. Data Table Improvements

**Row identity:** Each row = one group's submission, labeled with the group name (not form instance ID).

**Column values can be:**
- A direct field reference (show that group's value for a form field)
- A formula expression (using the existing aggregate + arithmetic system)
- Formulas in table columns are scoped per-group (per-row), not cross-group

**Custom column labels:** Already supported in the builder, no change needed.

**Builder UI changes:**
- Column config gains a toggle or picker: "Field value" vs "Formula"
- When "Formula" is selected, show the same formula builder used in standalone FormulaBlocks

### 7. Formula Field Type Validation

Aggregate functions must respect form field types:

| Aggregate | Allowed field types |
|-----------|-------------------|
| SUM | `number`, `rating`, `range` |
| AVERAGE | `number`, `rating`, `range` |
| MIN | `number`, `rating`, `range` |
| MAX | `number`, `rating`, `range` |
| MEDIAN | `number`, `rating`, `range` |
| COUNT | All field types |

**Applied in:**
- Standalone FormulaBlock field picker in the WYSIWYG editor
- Table column formula builder
- Edge Function validation (reject or warn on incompatible types)

### 8. Auto-Generate Indicator

When creating/editing a report template and selecting a linked form template, show schedule info:

- If form has a schedule: "Scheduled [weekly on Wednesdays]. Reports will auto-generate after each round is fully submitted." (when auto-generate is on)
- If no schedule: "No schedule configured -- reports can only be generated manually."

In the **form template schedule UI**, when saving/editing a schedule for a form that has a linked report:
- Show an informational notice: "This form has a linked report ([Report Name]). Auto-generate is currently [ON/OFF]."
- Include a link to the report template settings

### 9. Breaking Change Detection (Form -> Report)

When editing a form template that has a linked report template:

**While editing (inline):**
- On form field removal: if the field is referenced by the linked report, show a subtle warning banner (e.g., "Removing [Field Name] will break the linked report [Report Name]")
- On field type change to an incompatible type: same warning

**At publish time:**
- If breaking changes exist: confirmation dialog listing all breaking references. User can publish anyway.
- If non-breaking additions exist: notice that the report template may need updating to include new fields, with a button linking to the report editor.

**Detection logic:**
- On form editor load, fetch linked report template's latest version
- Extract all referenced form field IDs from report field configs (formulas, dynamic variables, table columns)
- Compare against current form fields as edits happen
- Breaking = referenced field removed or type changed incompatibly
- Addition = new fields added (not breaking, but report may want them)

### 10. WYSIWYG Editor Min-Height

The BlockNote editor container should fill the remaining vertical space on the page by default, then expand if content overflows.

**Implementation:** CSS `min-height: calc(100vh - [header + metadata height])` on the editor wrapper, with `flex-grow` for expansion.

**Applies to:** Both new and edit pages for report templates.

## Files Affected

**Migrations (new):**
- Add `status` column to `report_templates` and `report_template_versions`
- Add DELETE RLS policies for report sections/fields (already done)
- Update `trigger_on_form_instance_submitted` to check all groups in round

**Edge Function:**
- `supabase/functions/generate-report/index.ts` -- data table row-per-group with group name, formula column support, field type validation

**Services:**
- `src/services/reports.ts` -- draft/published lifecycle functions, round-based instance queries
- `src/services/form-templates.ts` -- name uniqueness check, linked report detection

**Components (new/modified):**
- Create template dialogs for forms and reports
- Generate report dialog (round-based)
- Form editor breaking change warnings
- Report editor schedule indicator
- Form schedule UI report notice
- Data table block column formula support
- Formula field picker filtering by field type
- Editor container min-height CSS

**Pages:**
- `src/routes/_authenticated/forms/new.tsx` -- dialog-first flow
- `src/routes/_authenticated/forms/$templateId/edit.tsx` -- breaking change detection
- `src/routes/_authenticated/reports/new.tsx` -- dialog-first flow
- `src/routes/_authenticated/reports/$templateId/edit.tsx` -- lifecycle, min-height
