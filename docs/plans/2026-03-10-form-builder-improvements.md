# Form Builder Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance the form builder with auto-abbreviation, save draft, editable field subtitles, field-type-specific previews/config, and field limits via the "More" button.

**Architecture:** Two DB migrations (add `description` to `template_fields`, add `status` to `form_templates` + update view). Then incremental frontend changes to the builder hook, field card component, and builder pages. All field limits stored in `validation_rules` JSON.

**Tech Stack:** PostgreSQL migrations, React, TypeScript, Shadcn UI components, TanStack Router

---

## Task 1: Migration — Add `description` to `template_fields`

**Files:**
- Create: `supabase/migrations/20260311000001_add_description_to_template_fields.sql`

**Step 1: Write and apply the migration**

```sql
-- Add description (subtitle) column to template_fields
ALTER TABLE public.template_fields
  ADD COLUMN IF NOT EXISTS description TEXT;

COMMENT ON COLUMN public.template_fields.description IS
  'Optional subtitle/description shown below the field label.';
```

Apply via `supabase_apply_migration`, then verify with `supabase_list_tables` (verbose) and `supabase_get_advisors` (security).

**Step 2: Write the migration file locally**

Save the same SQL to `supabase/migrations/20260311000001_add_description_to_template_fields.sql`.

**Step 3: Regenerate TypeScript types**

Run `supabase gen types typescript --local 2>/dev/null > src/types/database.ts`.

**Step 4: Commit**

```
chore(db): add description column to template_fields
```

---

## Task 2: Migration — Add `status` to `form_templates` and update view

**Files:**
- Create: `supabase/migrations/20260311000002_add_status_to_form_templates.sql`

**Step 1: Write and apply the migration**

```sql
-- Add status column to form_templates (draft | published)
ALTER TABLE public.form_templates
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft'
  CHECK (status IN ('draft', 'published'));

-- Backfill: all existing templates are published
UPDATE public.form_templates SET status = 'published' WHERE status = 'draft';

-- Update the templates_with_stats view to include status
CREATE OR REPLACE VIEW public.templates_with_stats AS
SELECT
  ft.id,
  ft.name,
  ft.abbreviation,
  ft.description,
  ft.sharing_mode,
  ft.status,
  ft.is_active,
  ft.created_at,
  ft.updated_at,
  COALESCE(lv.version_number, 0)  AS latest_version,
  COALESCE(ic.submitted_count, 0) AS submitted_count,
  COALESCE(ic.pending_count, 0)   AS pending_count
FROM public.form_templates ft
LEFT JOIN LATERAL (
  SELECT tv.version_number
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
  'Template list with status, latest version number and instance counts.';
```

Apply, verify, regenerate types.

**Step 2: Commit**

```
feat(db): add status column to form_templates for draft support
```

---

## Task 3: Update `useFormBuilder` hook — add `description` field, auto-abbreviation

**Files:**
- Modify: `src/hooks/use-form-builder.ts`

**Changes:**

1. Add `description: string` to `BuilderField` interface (field subtitle)
2. Update `makeDefaultField()` to include `description: ''`
3. Add auto-abbreviation logic: a `generateAbbreviation(name: string): string` function that takes the first letter of each significant word (skip "a", "an", "the", "of", "for", "and", "or", "in", "on", "at", "to"), lowercased, max 10 chars
4. Update `setName` to also auto-set abbreviation if the current abbreviation is empty or was auto-generated (track with a `isAbbreviationManual` boolean in state)
5. Update `toCreateInput()` to include `description` in field output
6. Update `validate()` — no change needed (subtitle is optional)

**Step 1: Implement changes**

Add to `BuilderState`:
```typescript
isAbbreviationManual: boolean
```

Add helper:
```typescript
const SKIP_WORDS = new Set(['a', 'an', 'the', 'of', 'for', 'and', 'or', 'in', 'on', 'at', 'to'])

function generateAbbreviation(name: string): string {
  const words = name.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const significant = words.filter((w) => !SKIP_WORDS.has(w))
  const source = significant.length > 0 ? significant : words
  return source.map((w) => w[0]).join('').slice(0, 10)
}
```

Update `setName`:
```typescript
const setName = useCallback((name: string) => {
  setState((s) => {
    const updates: Partial<BuilderState> = { name }
    if (!s.isAbbreviationManual) {
      updates.abbreviation = generateAbbreviation(name)
    }
    return { ...s, ...updates }
  })
}, [])
```

Update `setAbbreviation` to mark manual:
```typescript
const setAbbreviation = useCallback((abbreviation: string) => {
  setState((s) => ({ ...s, abbreviation, isAbbreviationManual: true }))
}, [])
```

Add `description` to `BuilderField`:
```typescript
export interface BuilderField {
  clientId: string
  label: string
  description: string   // <-- NEW: field subtitle
  field_type: FieldType
  sort_order: number
  is_required: boolean
  options: string[]
  validation_rules: Record<string, unknown> | null
  isEditing: boolean
}
```

Update `makeDefaultField`:
```typescript
function makeDefaultField(sortOrder: number, fieldType: FieldType): BuilderField {
  return {
    clientId: makeId(),
    label: '',
    description: '',  // <-- NEW
    field_type: fieldType,
    ...
  }
}
```

Update `toCreateInput` field mapping to include `description: f.description || null`.

**Step 2: Commit**

```
feat(forms): add field description and auto-abbreviation to builder hook
```

---

## Task 4: Update service layer — pass `description` through

**Files:**
- Modify: `src/services/form-templates.ts`

**Changes:**

1. Add `description: string | null` to `CreateFieldInput` interface
2. Add `description` to field insert rows in `createTemplate()` and `createTemplateVersion()`
3. Add `description` to `LoadedField` interface
4. Update `fetchTemplateForEditing()` to select `description` from template_fields
5. Add `status` to `TemplateListRow` and `TemplateDetail` types
6. Update `fetchTemplates()` and `fetchTemplateDetail()` to include `status`
7. Add `saveDraft()` function — same as `createTemplate()` but with `status: 'draft'`
8. Add `updateDraft()` function — updates existing draft template's version in-place
9. Update `createTemplate()` to set `status: 'published'`

**Step 1: Implement changes**

New service functions:

```typescript
export async function saveDraft(input: CreateTemplateInput): Promise<string> {
  // Same as createTemplate but status='draft'
}

export async function updateDraft(
  templateId: string,
  input: { name: string; abbreviation: string; description: string | null; sections: CreateSectionInput[] },
): Promise<void> {
  // Update template name/abbreviation/description
  // Delete existing sections+fields for the latest version
  // Re-insert sections+fields
}

export async function publishDraft(templateId: string): Promise<void> {
  // Set status='published' on the template
}
```

**Step 2: Commit**

```
feat(forms): add draft save/update and field description to service layer
```

---

## Task 5: Update `BuilderFieldCard` — editable subtitle, type-specific previews, "More" limits

**Files:**
- Modify: `src/components/builder-field-card.tsx`

**Changes:**

### 5a. Editable subtitle
Show a `Textarea` for ALL field types (not just choice) bound to `field.description`, below the label input.

### 5b. Type-specific previews
Replace `AnswerPreview` with type-aware previews:
- **Rating**: 5 disabled star icons (use lucide `StarIcon`)
- **Range**: A disabled Shadcn `Slider` with min/max labels
- **Date**: Disabled `Input` with type="date"
- **File**: A dashed-border upload zone with "Upload a file" text and accepted types
- **Checkbox**: A disabled Shadcn `Checkbox` with "Check this box" label
- **Number**: Disabled `Input` with type="number"
- **Text/Textarea**: Keep current disabled Input/Textarea

### 5c. "More" button -> collapsible limits section
Add `showMore` local state to field card. When "More" is clicked, toggle a section below the action bar with type-specific inputs:

| Field type | Inputs | `validation_rules` keys |
|---|---|---|
| Text/Long Text | Min chars (number), Max chars (number) | `min_length`, `max_length` |
| Number | Min value (number), Max value (number) | `min_value`, `max_value` |
| Date | Min date (date input), Max date (date input) | `min_date`, `max_date` |
| File | Accepted types (text input, comma-sep), Max size MB (number) | `accepted_types`, `max_size_mb` |
| Range | Min value (number), Max value (number), Step (number) | `min_value`, `max_value`, `step` |
| Rating | No config (fixed 5 stars) | — |
| Choice/Multi | No extra config | — |
| Checkbox | No extra config | — |

Each input updates `field.validation_rules` via `onUpdate`.

**Step 1: Implement changes**

**Step 2: Commit**

```
feat(forms): add field subtitle, type previews, and limits config to builder
```

---

## Task 6: Update builder pages — Save Draft button, smarter blocker

**Files:**
- Modify: `src/routes/_authenticated/forms/new.tsx`
- Modify: `src/routes/_authenticated/forms.$templateId.edit.tsx`

**Changes for `new.tsx`:**

1. Header buttons: **Save Draft** (outline) + **Publish** (primary)
2. Save Draft calls `saveDraft()` then navigates to `/forms/$templateId/edit` (opens edit mode for the draft)
3. `useBlocker` only blocks when form has been modified (track `isDirty` — any field touched)
4. On successful publish, call `blocker.proceed?.()` before navigating

**Changes for `edit.tsx`:**

1. If template `status === 'draft'`: show **Save Draft** + **Publish** in header. Save Draft calls `updateDraft()`, Publish calls `updateDraft()` then `publishDraft()`.
2. If template `status === 'published'`: keep current **Publish New Version** button.
3. Add `useBlocker` with confirmation dialog (same pattern as `new.tsx`).

**Step 1: Implement changes**

**Step 2: Commit**

```
feat(forms): add save draft flow and smart navigation blocker
```

---

## Task 7: Update templates list — Draft badge, route to edit for drafts

**Files:**
- Modify: `src/routes/_authenticated/forms/index.tsx`

**Changes:**

1. Show "Draft" badge next to template name when `status === 'draft'`
2. Clicking a draft row navigates to `/forms/$templateId/edit` instead of `/forms/$templateId`
3. Add a "Drafts" count to stats cards (or filter option)

**Step 1: Implement changes**

**Step 2: Commit**

```
feat(forms): show draft badge and route drafts to edit page
```

---

## Task 8: Update `toBuilderState` in edit page — load field descriptions

**Files:**
- Modify: `src/routes/_authenticated/forms.$templateId.edit.tsx`

**Changes:**

1. Update `toBuilderState()` to map `f.description ?? ''` into `BuilderField.description`
2. Map `validation_rules` into the builder field for existing fields so limits are preserved on edit

**Step 1: Implement changes**

**Step 2: Commit**

```
fix(forms): load field descriptions and validation rules in edit builder
```

---

## Task 9: Update TODO.md, verify build

**Step 1: Run `npx tsc -b` and `npm run lint` to verify**

**Step 2: Check off completed items in `docs/TODO.md`**

**Step 3: Commit**

```
docs(todo): check off form builder improvements
```

---

## Execution Order

Tasks 1-2 (DB migrations) must come first. Tasks 3-4 (hook + service) depend on migrations. Task 5 (field card UI) depends on Task 3. Tasks 6-7 (pages) depend on Tasks 3-5. Task 8 depends on Task 4. Task 9 is last.

```
1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9
```
