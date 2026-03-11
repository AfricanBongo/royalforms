# Reports Frontend Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the complete reports frontend — template CRUD (list, detail, builder with visual formula editor), instance viewer with document-style rendering, export, and realtime generation notifications.

**Architecture:** Mirrors the existing form templates frontend pattern exactly. Routes under `/_authenticated/reports/`, shared Shadcn UI components, service layer already exists (`src/services/reports.ts`). New custom components for report-specific UIs (formula block builder, document renderer). Realtime subscription hook for generation status.

**Tech Stack:** React 19, TanStack Router (file-based), Shadcn UI, Tailwind, Supabase client SDK, Supabase Realtime

---

## Dependencies

Before starting, install these Shadcn components:

```bash
npx shadcn@latest add command
npx shadcn@latest add progress
```

- **Command** (combobox pattern) — needed for field pickers in formula/table config
- **Progress** — for generation status indication

---

## Task 1: Route Scaffolding

**Files:**
- Create: `src/routes/_authenticated/reports/$templateId/route.tsx`
- Create: `src/routes/_authenticated/reports/$templateId/index.tsx`
- Create: `src/routes/_authenticated/reports/$templateId/edit.tsx`
- Create: `src/routes/_authenticated/reports/new.tsx`
- Create: `src/routes/_authenticated/reports/$templateId/instances/$readableId.tsx`
- Modify: `src/routes/_authenticated/reports/index.tsx`

**Step 1: Create layout wrapper**

Create `src/routes/_authenticated/reports/$templateId/route.tsx`:

```tsx
import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute(
  '/_authenticated/reports/$templateId',
)({
  component: () => <Outlet />,
})
```

**Step 2: Create placeholder pages**

Create minimal placeholder components for each route (same pattern as forms):
- `$templateId/index.tsx` — `ReportTemplateDetailPage` placeholder
- `$templateId/edit.tsx` — `ReportTemplateEditPage` placeholder
- `new.tsx` — `NewReportTemplatePage` placeholder
- `$templateId/instances/$readableId.tsx` — `ReportInstanceViewerPage` placeholder

Each placeholder:
```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/reports/$templateId/')({
  component: ReportTemplateDetailPage,
})

function ReportTemplateDetailPage() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <p className="text-sm text-muted-foreground">Report template detail — TODO</p>
    </div>
  )
}
```

**Step 3: Run the dev server to verify routes register**

Run: `npm run dev`
Expected: No errors, all routes accessible.

**Step 4: Commit**

```
feat(reports): scaffold report frontend routes
```

---

## Task 2: Report Template List Page

**Files:**
- Modify: `src/routes/_authenticated/reports/index.tsx`

**Reference:** `src/routes/_authenticated/forms/index.tsx` — follow the same structure exactly.

**Step 1: Implement the full list page**

Replace the placeholder with the full implementation:

- **Data loading:** `useEffect` calls `fetchReportTemplates()` from `src/services/reports.ts`. State: `templates`, `loading`, `activeTab` (`'active'` | `'archived'`).
- **Stat cards (4):** Total Templates, Auto-Generate On (count where `auto_generate`), Total Reports Generated (sum of `instance_count`), Failed Reports (need to add to service — or compute client-side if available).
- **Tabs:** `active` / `archived`. Filter by `is_active` === true/false.
- **Toolbar:** Search input (320px, `SearchIcon`), Filter button (outline, placeholder), "New Report Template" button (Root Admin only, navigates to `/reports/new`).
- **Table columns:** Checkbox, Report Name, Linked Form (`form_template_name`), Version (`latest_version_number`), Auto-Generate (Badge: On/Off), Reports Generated (`instance_count`), Updated On, Created On.
- **Pagination:** `PAGE_SIZE = 15`, client-side. Pin to bottom with `mt-auto`. Use same `getPageNumbers` pattern.
- **Row click:** Navigate to `/reports/$templateId`.
- **Search:** Client-side filter on `name` and `form_template_name`.

Key differences from forms list:
- No "Draft"/"Editing" badges (report templates don't have draft status yet — may add later)
- Auto-Generate column with On/Off badge
- "Linked Form" column

**Step 2: Type-check**

Run: `npx tsc -b`
Expected: No errors.

**Step 3: Commit**

```
feat(reports): implement report template list page
```

---

## Task 3: Report Template Detail Page

**Files:**
- Modify: `src/routes/_authenticated/reports/$templateId/index.tsx`

**Reference:** `src/routes/_authenticated/forms/$templateId/index.tsx`

**Step 1: Implement detail page**

- **Data loading:** `useCallback` wrapping `fetchReportTemplateById(templateId)` + `fetchReportInstances(templateId)`. State: `template`, `instances`, `loading`.
- **Page title:** `usePageTitle().setPageTitle(template.name)` with cleanup.
- **Stat cards (4):** Version (`latest_version.version_number`), Reports Generated (instances with `status === 'ready'` count), Failed (instances with `status === 'failed'` count), Auto-Generate (On/Off — with toggle).
- **Auto-generate toggle:** Clicking the stat card calls `toggleAutoGenerate(templateId, newValue)` and reloads.
- **Toolbar:** Search + Filter (left), Edit Template button (navigate to edit), Generate Report button (opens dialog), More dropdown (Versions, Delete) — Root Admin only.
- **Instance table columns:** Report ID (`readable_id`), Status (badge: `generating` yellow + spinner, `ready` green, `failed` red), Short URL (clickable or "—"), Created By (`created_by_name`), Created On, Actions column.
- **Actions column:** View button (navigate to instance viewer), Export dropdown (PDF/DOCX — disabled unless `status === 'ready'`).
- **Pagination:** Same pattern as forms.
- **Delete:** AlertDialog for archive (`deactivateReportTemplate`).

**Step 2: Type-check**

Run: `npx tsc -b`
Expected: No errors.

**Step 3: Commit**

```
feat(reports): implement report template detail page with instance table
```

---

## Task 4: Version History Sheet

**Files:**
- Create: `src/features/reports/VersionHistorySheet.tsx`

**Reference:** `src/features/forms/VersionHistorySheet.tsx`

**Step 1: Implement version history sheet**

Same structure as forms version history:
- Shadcn `Sheet` with `sm:max-w-xl`, flex column.
- Date range filter with two `Popover`/`Calendar` pickers.
- Table: Version number, Created By, Date, Restore button.
- Restore flow: `AlertDialog` confirmation, calls `restoreReportTemplateVersion(templateId, versionId)`, then `onRestored()` callback.
- Props: `open`, `onOpenChange`, `templateId: string`, `onRestored: () => void`.
- Data: `fetchReportTemplateVersions(templateId)`.

**Step 2: Wire up to detail page**

Add `versionsOpen` state and `VersionHistorySheet` to the detail page's More menu.

**Step 3: Type-check and commit**

```
feat(reports): add version history sheet for report templates
```

---

## Task 5: Generate Report Dialog

**Files:**
- Create: `src/features/reports/GenerateReportDialog.tsx`

**Step 1: Implement the dialog**

Shadcn `Sheet` (side panel, `sm:max-w-xl`):
- **Header:** "Generate Report" title, description text.
- **Form instance selection:** Load form instances for the linked form template via `fetchFormInstances(formTemplateId)` (import from `src/services/form-templates.ts`). Filter to `status === 'submitted'` only.
- **Checkbox table:** Instance readable_id, Group, Submitted date. Select all / deselect all.
- **Search** in the sheet to filter instances.
- **Generate button:** Disabled when no instances selected. Calls `generateReport(reportTemplateId, selectedInstanceIds)`.
- **On success:** Close dialog, show toast "Report generation started", trigger realtime watch (pass to parent callback with `report_instance_id` and `readable_id`).
- **Props:** `open`, `onOpenChange`, `reportTemplateId: string`, `formTemplateId: string`, `onGenerated: (instanceId: string, readableId: string) => void`.

**Step 2: Wire to detail page**

Add `generateOpen` state and `GenerateReportDialog` to the detail page toolbar. Connect `onGenerated` to the realtime watch hook (Task 8).

**Step 3: Type-check and commit**

```
feat(reports): add generate report dialog with form instance selection
```

---

## Task 6: Report Builder Hook

**Files:**
- Create: `src/hooks/use-report-builder.ts`

**Reference:** `src/hooks/use-form-builder.ts`

**Step 1: Define types and implement the hook**

Report builder types (not form builder types):

```typescript
const REPORT_FIELD_TYPE = {
  FORMULA: 'formula',
  DYNAMIC_VARIABLE: 'dynamic_variable',
  TABLE: 'table',
  STATIC_TEXT: 'static_text',
} as const
type ReportFieldType = (typeof REPORT_FIELD_TYPE)[keyof typeof REPORT_FIELD_TYPE]
```

**FormulaBlock type:**
```typescript
type FormulaBlock =
  | { kind: 'aggregate'; fn: 'SUM' | 'AVERAGE' | 'MIN' | 'MAX' | 'COUNT' | 'MEDIAN'; fieldId: string }
  | { kind: 'operator'; op: '+' | '-' | '*' | '/' }
  | { kind: 'literal'; value: number }
```

**ReportBuilderField:**
```typescript
interface ReportBuilderField {
  clientId: string
  label: string
  field_type: ReportFieldType
  sort_order: number
  isEditing: boolean
  // Type-specific config
  formulaBlocks: FormulaBlock[]          // formula
  dynamicVariableFieldId: string | null  // dynamic_variable
  tableColumns: { fieldId: string; label: string }[]  // table
  tableGroupBy: boolean                  // table
  staticTextContent: string              // static_text
}
```

**ReportBuilderSection / ReportBuilderState:**
```typescript
interface ReportBuilderSection {
  clientId: string
  title: string
  description: string
  sort_order: number
  fields: ReportBuilderField[]
  insertingAtIndex: number | null
}

interface ReportBuilderState {
  name: string
  description: string
  linkedFormTemplateId: string | null
  autoGenerate: boolean
  sections: ReportBuilderSection[]
}
```

**Hook returns:** Same pattern as `useFormBuilder` — `state`, `setState`, section CRUD (`addSection`, `updateSection`, `removeSection`), field CRUD (`insertField`, `updateField`, `removeField`, `duplicateField`, `moveField`, `setFieldEditing`), field type picker (`showFieldTypePicker`, `cancelFieldTypePicker`), `validate()`, `toCreateInput()`.

**`toCreateInput()` must serialize config:**
- formula → `{ expression: "SUM(fieldId) + 100", referenced_fields: [...] }` from `formulaBlocks`
- dynamic_variable → `{ template_field_id: "...", template_version_id: "..." }`
- table → `{ columns: [...], group_by: "group" | null }`
- static_text → `{ content: "...", format: "text" }`

**`toBuilderState()` static method** to convert loaded `ReportTemplateDetail` back to builder state.

**Step 2: Type-check**

Run: `npx tsc -b`
Expected: No errors.

**Step 3: Commit**

```
feat(reports): add report builder state management hook
```

---

## Task 7: Report Builder UI Components

**Files:**
- Create: `src/components/report-field-type-picker.tsx`
- Create: `src/components/report-builder-section.tsx`
- Create: `src/components/report-builder-field-card.tsx`
- Create: `src/components/formula-block-builder.tsx`
- Create: `src/components/dynamic-variable-picker.tsx`
- Create: `src/components/table-column-config.tsx`

**Reference components:** `src/components/field-type-picker.tsx`, `src/components/builder-section.tsx`, `src/components/builder-field-card.tsx`

### Step 1: Report Field Type Picker

Same pattern as `field-type-picker.tsx` but with 4 types:
- Formula (CalculatorIcon)
- Dynamic Variable (VariableIcon or BookmarkIcon)
- Table (TableIcon)
- Static Text (TypeIcon)

Plus "Section" add button at end. Grid layout: `grid-cols-4 gap-2` (or `grid-cols-3` with section as full row).

### Step 2: Formula Block Builder

The most complex component. Visual row of blocks:

```
[SUM ▾] [Form Field ▾] [+] [AVG ▾] [Form Field ▾] [× ] [100]  [+Block]
```

- Each block is a small card/pill inline.
- Aggregate block: Two dropdowns side by side — function (SUM/AVG/MIN/MAX/COUNT/MEDIAN) + form field (Combobox from `Command` component, showing field label grouped by section).
- Operator block: Select dropdown (+, -, *, /).
- Literal block: Number input.
- Add block button: Dropdown to pick block type (Aggregate, Operator, Number).
- Remove block: X button on each block.
- **Props:** `blocks: FormulaBlock[]`, `onChange: (blocks: FormulaBlock[]) => void`, `formFields: FormFieldOption[]` (loaded from linked form template).

### Step 3: Dynamic Variable Picker

Single Combobox (shadcn Command pattern):
- Lists all fields from the linked form template, grouped by section.
- Shows field label and section name.
- **Props:** `selectedFieldId: string | null`, `onChange: (fieldId: string) => void`, `formFields: FormFieldOption[]`.

### Step 4: Table Column Config

Repeatable rows:
- Each row: Form field dropdown (Combobox) + custom label input + remove button.
- "Add Column" button at bottom.
- "Group by" toggle switch.
- **Props:** `columns`, `onChange`, `groupBy`, `onGroupByChange`, `formFields`.

### Step 5: Report Builder Section

Same structure as `builder-section.tsx`:
- Section badge, editable title/description.
- Delete with confirmation when fields exist.
- Maps fields to `ReportBuilderFieldCard`.
- Field type picker toggle at insertion point.
- Props: section data + all callbacks.

### Step 6: Report Builder Field Card

Collapsible card with:
- Header: field type badge, label, expand/collapse, move up/down, duplicate, delete.
- Expanded body: label input + type-specific config component:
  - formula → `FormulaBlockBuilder`
  - dynamic_variable → `DynamicVariablePicker`
  - table → `TableColumnConfig`
  - static_text → `Textarea`

### Step 7: Type-check and commit

```
feat(reports): add report builder UI components with formula block builder
```

---

## Task 8: Report Builder Pages (New + Edit)

**Files:**
- Modify: `src/routes/_authenticated/reports/new.tsx`
- Modify: `src/routes/_authenticated/reports/$templateId/edit.tsx`

**Reference:** `src/routes/_authenticated/forms/new.tsx`, `src/routes/_authenticated/forms/$templateId/edit.tsx`

### Step 1: Edit page

- Load `fetchReportTemplateById(templateId)` on mount.
- Convert to builder state via `toBuilderState()`.
- Load linked form template fields for formula/variable/table pickers.
- **Header actions:** Save status badge, Discard Draft button, Publish button.
- **Auto-save:** Reuse `useAutoSave` pattern — adapt for report service calls.
- **Version-on-edit:** Same pattern as form builder.
- **Builder layout:** Muted background, centered max-w-[816px].
  - Template name (ContentEditable)
  - Linked Form (Select dropdown — disabled on edit since 1:1)
  - Description (ContentEditable)
  - Auto-generate toggle (Switch)
  - Sections → `ReportBuilderSection` components
  - "Add Section" button
- **Publish:** Flush auto-save, then navigate to detail page.

### Step 2: New page

- Same as edit but starts with empty state.
- Linked Form dropdown is enabled (required, pick from `fetchFormTemplates()`).
- URL swap after first auto-save (same pattern as forms/new).

### Step 3: Type-check and commit

```
feat(reports): implement report template builder pages with auto-save
```

---

## Task 9: Report Instance Viewer

**Files:**
- Modify: `src/routes/_authenticated/reports/$templateId/instances/$readableId.tsx`
- Create: `src/components/report-document.tsx`

### Step 1: Report Document component

Renders `data_snapshot` as a document:

```tsx
interface ReportDocumentProps {
  templateName: string
  readableId: string
  createdAt: string
  createdByName: string
  dataSnapshot: {
    sections: Array<{
      title: string
      description?: string
      fields: Array<{
        label: string
        field_type: string
        value: unknown  // number for formula/variable, array for table, string for static
      }>
    }>
  }
  formInstancesIncluded: string[]
}
```

Rendering rules:
- Title: h1 with template name, subtitle with readable_id
- Metadata: "Generated on {date}" and "Created by {name}" in muted text
- Sections: `h2` title, muted description paragraph, then fields
- Formula / Dynamic Variable: flex row — label on left (font-medium), value on right (text-right)
- Table: Shadcn `Table` with column headers from field config, data rows from value array
- Static Text: paragraph with preserved whitespace
- Form instances included: `Collapsible` section at bottom with list of readable IDs

### Step 2: Instance viewer page

- Load `fetchReportInstanceByReadableId(readableId)`.
- **Header breadcrumbs:** `setBreadcrumbs([{ label: templateName, path: /reports/$templateId }, { label: readableId, path: current }])`.
- **Header actions:** Export dropdown button (PDF / DOCX) — calls `exportReport()` and opens download URL.
- **Status handling:**
  - `generating` → Centered `Loader2Icon` with "Generating report..." text, auto-refresh via Realtime subscription on the instance row.
  - `failed` → `Alert` (destructive variant) with error_message. "Try Again" button that re-triggers generation.
  - `ready` → Render `<ReportDocument>` with data from `data_snapshot`.

### Step 3: Type-check and commit

```
feat(reports): add report instance viewer with document renderer
```

---

## Task 10: Realtime Generation Watch Hook

**Files:**
- Create: `src/hooks/use-report-generation-watch.ts`
- Modify: `src/routes/_authenticated.tsx` (mount the hook)

### Step 1: Implement the hook

```typescript
import { useEffect, useRef, useCallback, useState } from 'react'
import { supabase } from '../services/supabase'
import { toast } from 'sonner'
import { useNavigate } from '@tanstack/react-router'

interface WatchedReport {
  instanceId: string
  readableId: string
  templateId: string
}

function useReportGenerationWatch() {
  const [watching, setWatching] = useState<WatchedReport[]>([])
  const navigate = useNavigate()

  const watch = useCallback((report: WatchedReport) => {
    setWatching(prev => [...prev, report])
  }, [])

  useEffect(() => {
    if (watching.length === 0) return

    const channels = watching.map(report => {
      const channel = supabase
        .channel(`report-watch-${report.instanceId}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'report_instances',
          filter: `id=eq.${report.instanceId}`,
        }, (payload) => {
          const status = payload.new.status
          if (status === 'ready') {
            toast.success(`Report ${report.readableId} is ready`, {
              action: {
                label: 'View Report',
                onClick: () => navigate({
                  to: '/reports/$templateId/instances/$readableId',
                  params: { templateId: report.templateId, readableId: report.readableId },
                }),
              },
            })
            setWatching(prev => prev.filter(r => r.instanceId !== report.instanceId))
          } else if (status === 'failed') {
            toast.error(`Report ${report.readableId} failed`, {
              action: {
                label: 'View Details',
                onClick: () => navigate({
                  to: '/reports/$templateId/instances/$readableId',
                  params: { templateId: report.templateId, readableId: report.readableId },
                }),
              },
            })
            setWatching(prev => prev.filter(r => r.instanceId !== report.instanceId))
          }
        })
        .subscribe()
      return channel
    })

    return () => {
      channels.forEach(ch => supabase.removeChannel(ch))
    }
  }, [watching, navigate])

  return { watch, watchCount: watching.length }
}
```

### Step 2: Mount in authenticated layout

Add `useReportGenerationWatch()` to `src/routes/_authenticated.tsx` layout. Pass `watch` function down via context or prop drilling through detail page → generate dialog.

Alternative (simpler): Export a standalone `reportGenerationWatcher` module-level store (like a tiny event emitter) that the hook subscribes to and `GenerateReportDialog` writes to. Avoids prop drilling.

### Step 3: Type-check and commit

```
feat(reports): add realtime report generation watch with toast notifications
```

---

## Task 11: Export Functionality

**Files:**
- Modify: `src/routes/_authenticated/reports/$templateId/index.tsx` (instance table actions)
- Modify: `src/routes/_authenticated/reports/$templateId/instances/$readableId.tsx` (header action)

### Step 1: Export dropdown in instance table

In the detail page instance table Actions column:
- `DropdownMenu` with two items: "Export PDF" and "Export DOCX"
- Disabled when `status !== 'ready'`
- On click: call `exportReport(instanceId, format)`, then open the returned signed URL in a new tab (`window.open(url, '_blank')`)
- Show loading spinner in dropdown while exporting

### Step 2: Export dropdown in instance viewer header

Same `DropdownMenu` in the header actions area:
- "Export PDF" and "Export DOCX"
- Same flow: call service, open signed URL

### Step 3: Type-check and commit

```
feat(reports): add PDF and DOCX export with download
```

---

## Task 12: Auto-Save Adaptation for Reports

**Files:**
- Create: `src/hooks/use-report-auto-save.ts`

**Reference:** `src/hooks/use-auto-save.ts`

### Step 1: Adapt auto-save for report templates

The existing `useAutoSave` is tightly coupled to form template service calls (`saveDraft`, `updateDraft`). Create a report-specific version:

- Same debounce (3s), same state machine (`idle`/`dirty`/`saving`/`saved`/`error`)
- Same fingerprinting and meaningful content check
- Calls `createReportTemplate(input)` for first save (returns template id)
- Calls `updateReportTemplate(templateId, input)` for subsequent saves
- Same `flush()` for pre-publish save
- Same `persistedTemplateId` for URL swap on new templates

### Step 2: Wire into builder pages

Connect to new.tsx and edit.tsx builder pages.

### Step 3: Type-check and commit

```
feat(reports): add auto-save hook for report template builder
```

---

## Task 13: Update TODO.md

**Files:**
- Modify: `docs/TODO.md`

### Step 1: Check off completed items

Cross off all reports frontend items as they're implemented.

### Step 2: Commit

```
docs(todo): check off completed report frontend items
```

---

## Task 14: Final Verification

### Step 1: Type-check the full project

Run: `npx tsc -b`
Expected: No errors.

### Step 2: Lint

Run: `npm run lint`
Expected: No errors.

### Step 3: Build

Run: `npm run build`
Expected: Clean build.

### Step 4: Manual smoke test

Run: `npm run dev` and verify:
1. `/reports` — list page loads, shows templates
2. `/reports/new` — builder creates new template
3. `/reports/$templateId` — detail page shows instances
4. `/reports/$templateId/edit` — builder edits existing
5. Version history sheet works
6. Generate report dialog works
7. Instance viewer renders data_snapshot
8. Export downloads work
9. Realtime toast fires on generation completion

### Step 5: Commit any fixes

If any fixes needed during verification, commit each individually.
