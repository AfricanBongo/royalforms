# Form Instance Pages — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the full form instance filling, assignment, change log, and submission experience at `/instances/$readableId?mode=view|edit`.

**Architecture:** Wizard-style section navigation with auto-save on blur. Single route loads instance + template structure + field values. Field assignment via inline popovers (Admin only). Per-field change log popovers. Submission validates required fields, locks instance.

**Tech Stack:** React 19, TanStack Router, Supabase Client SDK, Shadcn UI (Input, Textarea, Select, Checkbox, Slider, Calendar, Popover, Badge, Card, Button, Separator, ScrollArea, Skeleton, Tooltip), Sonner toasts.

---

## Task 1: DB Migration — Rename `draft` to `pending` for form instances

**Files:**
- Create: `supabase/migrations/20260312000007_rename_instance_draft_to_pending.sql`

**Step 1: Write the migration**

The migration must:
1. ALTER the CHECK constraint on `form_instances.status` — drop old, add new with `('pending', 'submitted')`
2. UPDATE existing rows: `SET status = 'pending' WHERE status = 'draft'`
3. Recreate ALL 6 RLS policies that reference `fi.status = 'draft'` → `'pending'`:
   - `form_instances_update_submit`
   - `field_values_insert`
   - `field_values_update_open`
   - `field_values_update_assigned`
   - `field_values_update_admin_assign`
   (Note: `field_values_update_assigned` was also recreated in migration `...0007_fix_form_instance_performance_advisories.sql`)
4. Recreate `templates_with_stats` view — change `fi.status = 'draft'` → `fi.status = 'pending'` in the `pending_count` filter
5. Recreate `create_scheduled_instances` cron function — change INSERT value from `'draft'` to `'pending'`

All policies must keep `TO authenticated, service_role` target roles.

**Step 2: Apply migration**

Run: `npx supabase db reset`
Expected: All migrations apply cleanly, seed runs.

**Step 3: Regenerate TypeScript types**

Run: `npx supabase gen types typescript --local 2>/dev/null > src/types/database.ts`

**Step 4: Update frontend references**

Change `'draft'` → `'pending'` in:
- `src/routes/_authenticated/forms/$templateId/index.tsx` — `StatusBadge` component: rename `draft` key to `pending`, change label from `'Draft'` to `'Pending'`

Verify NO other frontend code references `'draft'` as a form instance status (all other `'draft'` references are for template/version status — leave those alone).

**Step 5: Type-check**

Run: `npx tsc -b`
Expected: Clean.

**Step 6: Commit**

```
fix(db): rename form instance status from 'draft' to 'pending'
```

---

## Task 2: Service functions — Instance data loading

**Files:**
- Modify: `src/services/form-templates.ts`

**Step 1: Add types**

```typescript
/** Full instance data loaded for the instance page. */
export interface InstancePageData {
  instance: {
    id: string
    readable_id: string
    status: 'pending' | 'submitted'
    group_id: string
    group_name: string
    created_at: string
    submitted_at: string | null
    submitted_by: string | null
    template_version_id: string
  }
  template: {
    id: string
    name: string
    description: string | null
    version_number: number
  }
  sections: InstanceSection[]
}

export interface InstanceSection {
  id: string
  title: string
  description: string | null
  sort_order: number
  fields: InstanceField[]
}

export interface InstanceField {
  id: string
  label: string
  description: string | null
  field_type: string
  sort_order: number
  is_required: boolean
  options: string[] | null
  validation_rules: Record<string, unknown> | null
}

export interface FieldValue {
  id: string
  template_field_id: string
  value: string | null
  assigned_to: string | null
  assigned_by: string | null
  change_log: ChangeLogEntry[]
  updated_by: string
  updated_at: string
}

export interface ChangeLogEntry {
  old_value: string | null
  new_value: string | null
  changed_by: string
  changed_by_name?: string
  changed_at: string
}

export interface GroupMember {
  id: string
  first_name: string
  last_name: string
  role: string
}
```

**Step 2: Add `fetchInstanceByReadableId`**

```typescript
export async function fetchInstanceByReadableId(
  readableId: string,
): Promise<InstancePageData> {
  // 1. Fetch instance with group name
  const { data: instance, error: iErr } = await supabase
    .from('form_instances')
    .select(`
      id, readable_id, status, group_id, created_at,
      submitted_at, submitted_by, template_version_id,
      groups!inner ( name )
    `)
    .eq('readable_id', readableId)
    .single()

  if (iErr || !instance) throw iErr ?? new Error('Instance not found')

  // 2. Fetch template version info
  const { data: version, error: vErr } = await supabase
    .from('template_versions')
    .select('id, version_number, template_id, form_templates!inner ( name, description )')
    .eq('id', instance.template_version_id)
    .single()

  if (vErr || !version) throw vErr ?? new Error('Version not found')

  // 3. Fetch sections with fields (ordered)
  const { data: sections, error: sErr } = await supabase
    .from('template_sections')
    .select('id, title, description, sort_order')
    .eq('template_version_id', instance.template_version_id)
    .order('sort_order')

  if (sErr) throw sErr

  // 4. Fetch all fields for these sections
  const sectionIds = (sections ?? []).map((s) => s.id)
  const { data: fields, error: fErr } = await supabase
    .from('template_fields')
    .select('id, template_section_id, label, description, field_type, sort_order, is_required, options, validation_rules')
    .in('template_section_id', sectionIds)
    .order('sort_order')

  if (fErr) throw fErr

  // 5. Group fields by section
  const fieldsBySection = new Map<string, InstanceField[]>()
  for (const f of fields ?? []) {
    const list = fieldsBySection.get(f.template_section_id) ?? []
    list.push({
      id: f.id,
      label: f.label,
      description: f.description,
      field_type: f.field_type,
      sort_order: f.sort_order,
      is_required: f.is_required,
      options: Array.isArray(f.options) ? f.options as string[] : null,
      validation_rules: f.validation_rules as Record<string, unknown> | null,
    })
    fieldsBySection.set(f.template_section_id, list)
  }

  const group = instance.groups as unknown as { name: string }
  const tmpl = version.form_templates as unknown as { name: string; description: string | null }

  return {
    instance: {
      id: instance.id,
      readable_id: instance.readable_id,
      status: instance.status as 'pending' | 'submitted',
      group_id: instance.group_id,
      group_name: group.name,
      created_at: instance.created_at,
      submitted_at: instance.submitted_at,
      submitted_by: instance.submitted_by,
      template_version_id: instance.template_version_id,
    },
    template: {
      id: version.template_id,
      name: tmpl.name,
      description: tmpl.description,
      version_number: version.version_number,
    },
    sections: (sections ?? []).map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      sort_order: s.sort_order,
      fields: fieldsBySection.get(s.id) ?? [],
    })),
  }
}
```

**Step 3: Add `fetchFieldValues`**

```typescript
export async function fetchFieldValues(
  instanceId: string,
): Promise<FieldValue[]> {
  const { data, error } = await supabase
    .from('field_values')
    .select('id, template_field_id, value, assigned_to, assigned_by, change_log, updated_by, updated_at')
    .eq('form_instance_id', instanceId)

  if (error) throw error
  return (data ?? []).map((row) => ({
    ...row,
    change_log: Array.isArray(row.change_log) ? row.change_log as ChangeLogEntry[] : [],
  }))
}
```

**Step 4: Add `upsertFieldValue`**

```typescript
export async function upsertFieldValue(
  instanceId: string,
  fieldId: string,
  value: string | null,
  oldValue: string | null,
): Promise<FieldValue> {
  const user = await getCurrentAuthUser()
  const now = new Date().toISOString()
  const newLogEntry: ChangeLogEntry = {
    old_value: oldValue,
    new_value: value,
    changed_by: user.id,
    changed_at: now,
  }

  // Try UPDATE first (existing row)
  const { data: existing } = await supabase
    .from('field_values')
    .select('id, change_log')
    .eq('form_instance_id', instanceId)
    .eq('template_field_id', fieldId)
    .maybeSingle()

  if (existing) {
    const updatedLog = [...(Array.isArray(existing.change_log) ? existing.change_log as ChangeLogEntry[] : []), newLogEntry]
    const { data, error } = await supabase
      .from('field_values')
      .update({
        value,
        updated_by: user.id,
        change_log: updatedLog as unknown as Json[],
      })
      .eq('id', existing.id)
      .select('id, template_field_id, value, assigned_to, assigned_by, change_log, updated_by, updated_at')
      .single()

    if (error) throw error
    return { ...data, change_log: updatedLog }
  }

  // INSERT new row
  const { data, error } = await supabase
    .from('field_values')
    .insert({
      form_instance_id: instanceId,
      template_field_id: fieldId,
      value,
      updated_by: user.id,
      change_log: [newLogEntry] as unknown as Json[],
    })
    .select('id, template_field_id, value, assigned_to, assigned_by, change_log, updated_by, updated_at')
    .single()

  if (error) throw error
  return { ...data!, change_log: [newLogEntry] }
}
```

**Step 5: Add `assignField`**

```typescript
export async function assignField(
  instanceId: string,
  fieldId: string,
  assignTo: string | null,
): Promise<void> {
  const user = await getCurrentAuthUser()

  // Check if field_values row exists
  const { data: existing } = await supabase
    .from('field_values')
    .select('id')
    .eq('form_instance_id', instanceId)
    .eq('template_field_id', fieldId)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('field_values')
      .update({
        assigned_to: assignTo,
        assigned_by: assignTo ? user.id : null,
      })
      .eq('id', existing.id)
    if (error) throw error
  } else {
    // Create row with null value but with assignment
    const { error } = await supabase
      .from('field_values')
      .insert({
        form_instance_id: instanceId,
        template_field_id: fieldId,
        value: null,
        updated_by: user.id,
        assigned_to: assignTo,
        assigned_by: assignTo ? user.id : null,
        change_log: [],
      })
    if (error) throw error
  }
}
```

**Step 6: Add `submitInstance`**

```typescript
export async function submitInstance(instanceId: string): Promise<void> {
  const user = await getCurrentAuthUser()
  const { error } = await supabase
    .from('form_instances')
    .update({
      status: 'submitted',
      submitted_by: user.id,
      submitted_at: new Date().toISOString(),
    })
    .eq('id', instanceId)

  if (error) throw error
}
```

**Step 7: Add `fetchGroupMembers`**

```typescript
export async function fetchGroupMembers(
  groupId: string,
): Promise<GroupMember[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, role')
    .eq('group_id', groupId)
    .in('role', ['admin', 'editor'])
    .order('first_name')

  if (error) throw error
  return data ?? []
}
```

**Step 8: Type-check**

Run: `npx tsc -b`

**Step 9: Commit**

```
feat(services): add instance page data loading and mutation functions
```

---

## Task 3: Instance field input component

**Files:**
- Create: `src/features/instances/InstanceFieldInput.tsx`

Build a component that renders the correct interactive input for each `field_type`. Props: `field: InstanceField`, `value: string | null`, `disabled: boolean`, `onChange: (value: string | null) => void`, `onBlur: () => void`.

**Field type mapping:**

| `field_type` | Component | Notes |
|---|---|---|
| `text` | `<Input>` | |
| `textarea` | `<Textarea>` | |
| `number` | `<Input type="number">` | Respect `min_value`, `max_value` from validation_rules |
| `date` | `<Input type="date">` | Respect `min_date`, `max_date` |
| `select` | `<Select>` | Options from `field.options` |
| `multi_select` | Multiple `<Checkbox>` | Options from `field.options`, store as comma-separated |
| `checkbox` | `<Checkbox>` | Store as `'true'` / `'false'` |
| `rating` | 5 star buttons | Store as `'1'` to `'5'` |
| `range` | `<Slider>` | `min_value`, `max_value`, `step` from validation_rules |
| `file` | Disabled placeholder | "File upload coming soon" |

All values stored as `string | null` in `field_values.value`.

**Step 1: Create the component**

Use a `switch` on `field.field_type` similar to `FieldPreview` in `builder-field-card.tsx`, but with live interactive inputs. Each input calls `onChange` on value change and `onBlur` on blur (which triggers auto-save).

**Step 2: Type-check**

Run: `npx tsc -b`

**Step 3: Commit**

```
feat(instances): add InstanceFieldInput component for all field types
```

---

## Task 4: Field assignment popover component

**Files:**
- Create: `src/features/instances/FieldAssignmentPopover.tsx`

A `<Popover>` triggered by a small user icon button next to the field label. Shows:
- Current assignment ("Open to all" or assigned member name)
- List of group members (Admin + Editor roles) as selectable options
- "Unassign" option if currently assigned

Props: `fieldId: string`, `instanceId: string`, `assignedTo: string | null`, `members: GroupMember[]`, `onAssigned: (memberId: string | null) => void`, `disabled: boolean`.

Calls `assignField()` service function on selection.

**Step 1: Create the component**

**Step 2: Type-check and commit**

```
feat(instances): add FieldAssignmentPopover component
```

---

## Task 5: Field change log popover component

**Files:**
- Create: `src/features/instances/FieldChangeLogPopover.tsx`

A `<Popover>` triggered by a small clock icon button. Shows change log entries in reverse chronological order:
- Each entry: timestamp, user name, old value → new value
- Empty state: "No changes yet"

Props: `changeLog: ChangeLogEntry[]`, `members: GroupMember[]` (to resolve `changed_by` UUIDs to names).

**Step 1: Create the component**

**Step 2: Type-check and commit**

```
feat(instances): add FieldChangeLogPopover component
```

---

## Task 6: Wizard section stepper component

**Files:**
- Create: `src/features/instances/SectionStepper.tsx`

Horizontal progress stepper showing section names. Current section highlighted, completed sections show a checkmark. Clickable to jump.

Props: `sections: { title: string; isComplete: boolean }[]`, `currentIndex: number`, `onStepClick: (index: number) => void`.

A section is "complete" when all its required fields have non-null, non-empty values.

**Step 1: Create the component**

Use Shadcn `Badge` or `Button` variants for step indicators. Connect with lines/separators.

**Step 2: Type-check and commit**

```
feat(instances): add SectionStepper wizard navigation component
```

---

## Task 7: Instance page — main route component

**Files:**
- Modify: `src/routes/_authenticated/instances/$readableId.tsx`

This is the main orchestration. Replace the placeholder with:

**Step 1: Data loading**

On mount, call `fetchInstanceByReadableId(readableId)` and `fetchFieldValues(instance.id)`. Also call `fetchGroupMembers(instance.group_id)` for assignment popovers.

**Step 2: Access control**

Check user role and mode:
- Viewer + `mode=edit` → redirect to `mode=view`
- Viewer + pending instance → show "This form is not available yet"
- Editor/Admin check group membership via `instance.group_id === currentUser.group_id`
- Root Admin has full access

**Step 3: Page layout**

```
Header:
  Left: readable_id · formatted created_at date · group name · version
  Right: Status badge + Submit button (Admin only, pending only, edit mode)

SectionStepper (sections, currentIndex, onStepClick)

Section content:
  Section title + description
  For each field:
    Label row: label (* if required) + assignment popover + change log popover
    Description (if any)
    InstanceFieldInput (disabled if view mode or submitted or field locked to another user)
    Save indicator ("Saved" briefly after blur-save)

Footer:
  Previous button (disabled on first section)
  Next button (or Submit on last section for Admin)
```

**Step 4: Auto-save on blur**

Track local field values in a `Map<string, string | null>` state. On blur, if value changed from the DB value, call `upsertFieldValue()`. Show "Saved" indicator. On error, show toast.

**Step 5: Submission flow**

On Submit click:
1. Validate all required fields have non-empty values
2. If validation fails: toast error with missing field count, jump to first incomplete section
3. Call `submitInstance(instanceId)`
4. On success: toast, reload data (status now `submitted`, all fields read-only)

**Step 6: Type-check**

Run: `npx tsc -b`

**Step 7: Commit**

```
feat(instances): build full instance page with wizard navigation and auto-save
```

---

## Task 8: Update TODO.md

**Files:**
- Modify: `docs/TODO.md`

Check off:
- [x] Form instance page (`/instances/:readableId?mode=view|edit`)
- [x] Section-as-page navigation
- [x] Field assignment side sheet (now inline popover)
- [x] Field change log display
- [x] Required field validation on submit

**Commit:**

```
docs: update TODO with completed form instance items
```

---

## Implementation Order & Dependencies

```
Task 1 (migration) → Task 2 (services) → Task 3-6 (components, parallel) → Task 7 (page assembly) → Task 8 (docs)
```

Tasks 3, 4, 5, 6 are independent components and can be built in parallel.
Task 7 assembles everything and depends on all prior tasks.
