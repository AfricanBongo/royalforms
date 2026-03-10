# Create & Schedule Instance Dialogs — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the Create Instance and Schedule Instance UIs on the template detail page — dropdown button, 4 dialog/sheet components, and backing service functions.

**Architecture:** The "Create instance" button becomes a dropdown with two options: instant creation and scheduling. Each opens a right-side Sheet for configuration, then shows a centered success Dialog. Service functions use the Supabase client SDK (not Edge Functions) for all writes. Group selection reuses the pattern from `ShareFormSheet`.

**Tech Stack:** React 19, Shadcn UI (Sheet, Dialog, ToggleGroup, Calendar, Select, Checkbox, Table, ScrollArea, AlertDialog), Tailwind CSS, Supabase client SDK.

---

## Task 1: Install Shadcn ToggleGroup component

**Files:**
- Create: `src/components/ui/toggle.tsx` (Shadcn auto-generates)
- Create: `src/components/ui/toggle-group.tsx` (Shadcn auto-generates)

**Step 1: Install via CLI**

Run: `npx shadcn@latest add toggle-group`

**Step 2: Verify files exist**

Run: `ls src/components/ui/toggle*.tsx`
Expected: `toggle.tsx` and `toggle-group.tsx`

**Step 3: Commit**

```
chore(ui): install shadcn toggle-group component
```

---

## Task 2: Add service functions for form instances

**Files:**
- Modify: `src/services/form-templates.ts`

Add these functions to the service file:

### Step 1: Add `generateReadableId` helper

A client-side function that generates a random 8-char alphanumeric string (matching the DB cron function pattern).

```typescript
function generateReadableId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 8; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}
```

### Step 2: Add `fetchActiveGroups` function

Fetches all active groups for the group selection table (simpler than `fetchGroupsWithAccess` since we don't need access status).

```typescript
export interface SimpleGroup {
  id: string
  name: string
}

export async function fetchActiveGroups(): Promise<SimpleGroup[]> {
  const { data, error } = await supabase
    .from('groups')
    .select('id, name')
    .eq('is_active', true)
    .order('name')

  if (error) throw error
  return data ?? []
}
```

### Step 3: Add `createFormInstances` function

Creates one form instance per selected group, using the latest published template version. Returns the created instances (needed for the success dialog to show the link).

```typescript
export interface CreatedInstance {
  id: string
  readable_id: string
  group_id: string
  short_url_edit: string | null
}

export async function createFormInstances(
  templateId: string,
  groupIds: string[],
): Promise<CreatedInstance[]> {
  const user = await getCurrentAuthUser()

  // Get latest published version
  const { data: version, error: vErr } = await supabase
    .from('template_versions')
    .select('id')
    .eq('template_id', templateId)
    .eq('status', 'published')
    .order('version_number', { ascending: false })
    .limit(1)
    .single()

  if (vErr || !version) throw vErr ?? new Error('No published version found')

  // Build insert rows — one per group
  const rows = groupIds.map((groupId) => ({
    readable_id: generateReadableId(),
    template_version_id: version.id,
    group_id: groupId,
    created_by: user.id,
  }))

  const { data, error } = await supabase
    .from('form_instances')
    .insert(rows)
    .select('id, readable_id, group_id, short_url_edit')

  if (error) throw error
  return data ?? []
}
```

### Step 4: Add `fetchTemplateSchedule` function

Fetches the existing schedule for a template (one-to-one relationship), including its group targets.

```typescript
export interface ScheduleData {
  id: string
  start_date: string
  repeat_interval: string
  repeat_every: number
  days_of_week: string[] | null
  is_active: boolean
  next_run_at: string
  group_ids: string[]
}

export async function fetchTemplateSchedule(
  templateId: string,
): Promise<ScheduleData | null> {
  const { data, error } = await supabase
    .from('instance_schedules')
    .select('id, start_date, repeat_interval, repeat_every, days_of_week, is_active, next_run_at')
    .eq('template_id', templateId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  // Fetch group targets
  const { data: targets, error: tErr } = await supabase
    .from('schedule_group_targets')
    .select('group_id')
    .eq('schedule_id', data.id)

  if (tErr) throw tErr

  return {
    ...data,
    days_of_week: data.days_of_week as string[] | null,
    group_ids: (targets ?? []).map((t) => t.group_id),
  }
}
```

### Step 5: Add `createInstanceSchedule` function

Creates a new schedule with group targets.

```typescript
export interface CreateScheduleInput {
  templateId: string
  startDate: string
  repeatInterval: string
  repeatEvery: number
  daysOfWeek: string[] | null
  groupIds: string[]
}

export async function createInstanceSchedule(
  input: CreateScheduleInput,
): Promise<void> {
  const user = await getCurrentAuthUser()

  const { data: schedule, error: sErr } = await supabase
    .from('instance_schedules')
    .insert({
      template_id: input.templateId,
      start_date: input.startDate,
      repeat_interval: input.repeatInterval,
      repeat_every: input.repeatEvery,
      days_of_week: input.daysOfWeek,
      next_run_at: input.startDate,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (sErr || !schedule) throw sErr ?? new Error('Failed to create schedule')

  // Insert group targets
  if (input.groupIds.length > 0) {
    const targets = input.groupIds.map((groupId) => ({
      schedule_id: schedule.id,
      group_id: groupId,
    }))

    const { error: tErr } = await supabase
      .from('schedule_group_targets')
      .insert(targets)

    if (tErr) throw tErr
  }
}
```

### Step 6: Add `updateInstanceSchedule` function

Updates an existing schedule and replaces group targets.

```typescript
export interface UpdateScheduleInput {
  scheduleId: string
  startDate: string
  repeatInterval: string
  repeatEvery: number
  daysOfWeek: string[] | null
  groupIds: string[]
}

export async function updateInstanceSchedule(
  input: UpdateScheduleInput,
): Promise<void> {
  const { error: sErr } = await supabase
    .from('instance_schedules')
    .update({
      start_date: input.startDate,
      repeat_interval: input.repeatInterval,
      repeat_every: input.repeatEvery,
      days_of_week: input.daysOfWeek,
      next_run_at: input.startDate,
    })
    .eq('id', input.scheduleId)

  if (sErr) throw sErr

  // Replace group targets: delete all, then re-insert
  const { error: dErr } = await supabase
    .from('schedule_group_targets')
    .delete()
    .eq('schedule_id', input.scheduleId)

  if (dErr) throw dErr

  if (input.groupIds.length > 0) {
    const targets = input.groupIds.map((groupId) => ({
      schedule_id: input.scheduleId,
      group_id: groupId,
    }))

    const { error: tErr } = await supabase
      .from('schedule_group_targets')
      .insert(targets)

    if (tErr) throw tErr
  }
}
```

### Step 7: Add `deleteInstanceSchedule` function

Deletes a schedule (CASCADE deletes group targets).

```typescript
export async function deleteInstanceSchedule(
  scheduleId: string,
): Promise<void> {
  const { error } = await supabase
    .from('instance_schedules')
    .delete()
    .eq('id', scheduleId)

  if (error) throw error
}
```

### Step 8: Commit

```
feat(services): add form instance and schedule service functions
```

---

## Task 3: Build CreateInstanceSheet component

**Files:**
- Create: `src/features/forms/CreateInstanceSheet.tsx`

Right-side Sheet matching Figma "Create Instance Initial" dialog. Follows the exact pattern from `ShareFormSheet`:
- Props: `{ open, onOpenChange, templateId, templateName, onCreated }`
- Loads groups on open via `fetchActiveGroups`
- "All groups" / "Selected groups" radio toggle
- Searchable group table with checkboxes
- Cancel + "Create instance" footer buttons
- On submit: calls `createFormInstances`, passes result to `onCreated`

Key differences from ShareFormSheet:
- Radio toggle for "All groups" vs "Selected groups" (not just checkboxes)
- Info banner at top showing template name
- On success, calls `onCreated(instances)` instead of closing directly

**Step 1: Create the component file**

See `src/components/share-form-sheet.tsx` for the exact pattern to follow (Sheet + search + checkbox table + ScrollArea + footer).

**Step 2: Commit**

```
feat(forms): add CreateInstanceSheet component
```

---

## Task 4: Build CreateInstanceSuccessDialog component

**Files:**
- Create: `src/features/forms/CreateInstanceSuccessDialog.tsx`

Centered Dialog matching Figma "Create Instance Success" dialog:
- Props: `{ open, onOpenChange, instances }`
- Green check icon (lucide `FileCheck2`)
- "Form Instance Created" title
- Description text
- Link field with copy button (shows first instance's `short_url_edit` or app URL fallback)
- "Close" primary button

**Step 1: Create the component file**

Uses Shadcn `Dialog` (not Sheet). Copy-to-clipboard via `navigator.clipboard.writeText`.

**Step 2: Commit**

```
feat(forms): add CreateInstanceSuccessDialog component
```

---

## Task 5: Build ScheduleInstanceSheet component

**Files:**
- Create: `src/features/forms/ScheduleInstanceSheet.tsx`

Right-side Sheet matching Figma "Schedule Instance Initial" dialog:
- Props: `{ open, onOpenChange, templateId, templateName, existingSchedule, onSaved, onDeleted }`
- Info banner showing template name ("scheduling" / "editing schedule of")
- "Send On" date picker (Shadcn Calendar + Popover)
- "Should repeat" checkbox card:
  - When checked: "Repeat On" day-of-week ToggleGroup (multi-select), "Repeat Every" Select (daily/weekly/bi_weekly/monthly)
- Group selection (same "All groups" / "Selected groups" + table pattern)
- Footer:
  - Left: "Delete schedule" destructive button (only when editing existing schedule)
  - Right: Cancel + "Create instance" / "Save changes" button
- Delete triggers AlertDialog confirmation

Pre-fills all fields when `existingSchedule` is provided.

**Step 1: Create the component file**

**Step 2: Commit**

```
feat(forms): add ScheduleInstanceSheet component
```

---

## Task 6: Build ScheduleInstanceSuccessDialog component

**Files:**
- Create: `src/features/forms/ScheduleInstanceSuccessDialog.tsx`

Centered Dialog matching Figma "Schedule Instance Success" dialog:
- Props: `{ open, onOpenChange }`
- Green clock icon (lucide `FileClock`)
- "Form Instance Scheduled" title
- Description text
- "Close" primary button

Nearly identical structure to CreateInstanceSuccessDialog but without the link field.

**Step 1: Create the component file**

**Step 2: Commit**

```
feat(forms): add ScheduleInstanceSuccessDialog component
```

---

## Task 7: Wire dropdown button and dialogs into template detail page

**Files:**
- Modify: `src/routes/_authenticated/forms/$templateId/index.tsx`

### Step 1: Add imports

Import all 4 new components + `fetchTemplateSchedule` + `ChevronDownIcon` from lucide.

### Step 2: Add state variables

```typescript
const [createOpen, setCreateOpen] = useState(false)
const [createSuccessOpen, setCreateSuccessOpen] = useState(false)
const [createdInstances, setCreatedInstances] = useState<CreatedInstance[]>([])
const [scheduleOpen, setScheduleOpen] = useState(false)
const [scheduleSuccessOpen, setScheduleSuccessOpen] = useState(false)
const [schedule, setSchedule] = useState<ScheduleData | null>(null)
```

### Step 3: Fetch schedule on load

Add `fetchTemplateSchedule(templateId)` to the `loadTemplate` callback alongside existing fetches.

### Step 4: Replace "Create instance" Button with DropdownMenu

Replace the single `<Button>` (lines 292-295) with a split dropdown:

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button>
      <FilePlus className="size-4" />
      Create instance
      <ChevronDownIcon className="size-4" />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuItem onClick={() => setCreateOpen(true)}>
      Create instance
    </DropdownMenuItem>
    <DropdownMenuItem onClick={() => setScheduleOpen(true)}>
      {schedule ? 'Edit schedule' : 'Schedule instance'}
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

### Step 5: Add dialog/sheet components to JSX

Wire all 4 components at the bottom of the component's JSX (same position as ShareFormSheet and VersionHistorySheet).

Handle the create flow:
- `CreateInstanceSheet.onCreated` → set `createdInstances`, open success dialog, refresh instances table
- `CreateInstanceSuccessDialog.onOpenChange` → close and clear

Handle the schedule flow:
- `ScheduleInstanceSheet.onSaved` → open success dialog, refresh schedule state
- `ScheduleInstanceSheet.onDeleted` → clear schedule state, close sheet
- `ScheduleInstanceSuccessDialog.onOpenChange` → close

### Step 6: Commit

```
feat(forms): wire create/schedule instance dropdown and dialogs
```

---

## Task 8: Verify build and lint

**Step 1: Run type check**

Run: `npx tsc -b`
Expected: No errors

**Step 2: Run lint**

Run: `npm run lint`
Expected: No errors

**Step 3: Fix any issues**

**Step 4: Commit if fixes needed**

```
fix(forms): resolve lint/type errors in instance dialogs
```

---

## Task 9: Add `TO authenticated, service_role` to ALL RLS policies + add instance_schedules DELETE policy

**Files:**
- Create: `supabase/migrations/TIMESTAMP_add_role_targets_to_all_rls_policies.sql`

**Context:** All 41 existing RLS policies on application tables are missing `TO authenticated, service_role` role targets. Without this, policies default to `TO public`, which is overly permissive. This migration drops and recreates every policy with the correct role targets, and adds the missing DELETE policy for `instance_schedules`.

### Step 1: Create the migration file

The migration drops all existing policies and recreates them with `TO authenticated, service_role`. The logic inside each USING/WITH CHECK clause stays identical.

**Tables covered (41 existing + 1 new = 42 policies):**

| Table | Policies |
|---|---|
| `profiles` | SELECT, UPDATE |
| `groups` | SELECT, INSERT, UPDATE |
| `member_requests` | SELECT, INSERT, UPDATE, DELETE |
| `form_templates` | SELECT, INSERT, UPDATE, DELETE |
| `template_versions` | SELECT, INSERT, UPDATE, DELETE |
| `template_sections` | SELECT, INSERT, DELETE |
| `template_fields` | SELECT, INSERT, DELETE |
| `template_group_access` | SELECT, INSERT, DELETE |
| `form_instances` | SELECT, INSERT, UPDATE (×2) |
| `field_values` | SELECT, INSERT, UPDATE (×3) |
| `instance_schedules` | SELECT, INSERT, UPDATE, **DELETE (NEW)** |
| `schedule_group_targets` | SELECT, INSERT, DELETE |

**Note:** Storage policies (avatars bucket) already have `TO authenticated` — skip those.

### Step 2: Apply migration

Run: `supabase db reset`

### Step 3: Run security advisors

Run: `supabase_get_advisors` (security) to verify no remaining issues.

### Step 4: Regenerate types

Run: `supabase gen types typescript --local 2>/dev/null > src/types/database.ts`

### Step 5: Commit

```
feat(db): add TO authenticated/service_role to all RLS policies and instance_schedules DELETE policy
```
