# Instance Page Bug Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 5 bugs on the form instance page: broken select field, missing subtitle/character feedback, real-time sync, instance click navigation, and breadcrumb context.

**Architecture:** Fixes span frontend components (InstanceFieldInput, instance page, template detail page, authenticated layout) and backend (new Postgres function for atomic change_log append, Supabase Realtime subscription). No new tables or columns needed.

**Tech Stack:** React 19, Supabase Realtime (Postgres Changes CDC), Shadcn UI Select, TanStack Router

---

## Task 1: Fix Select Field (Bug #1)

The Shadcn `Select` component is likely broken because `field.options` from the DB comes as a JSONB array but may be cast incorrectly. Also verify all field types render their title/label correctly.

**Files:**
- Modify: `src/features/instances/InstanceFieldInput.tsx`
- Check: `src/services/form-templates.ts:1559-1570` (field mapping)

**Step 1:** Check how `options` is stored in `template_fields` table (JSONB column). Verify the cast at line 1568 of `form-templates.ts` produces a proper `string[]`.

**Step 2:** In `InstanceFieldInput.tsx`, the `select` case (line 85-107) looks correct structurally. The issue may be:
- `field.options` is `null` or empty array — add a fallback
- The `SelectTrigger` may need explicit sizing or the `SelectContent` may need a portal/z-index fix
- The `value=""` (empty string) passed to `Select` may prevent the placeholder from showing — Shadcn Select treats `""` as a selected value. Use `undefined` instead.

**Step 3:** Fix the Select by:
1. Pass `value={value || undefined}` instead of `value={value ?? ''}` so the placeholder shows when no value is set
2. Add `options` null guard with fallback empty state
3. Verify other field types (text, textarea, number, date, multi_select, checkbox, rating, range) render titles correctly — titles are rendered in the parent `$readableId.tsx` (line 560-562), not in `InstanceFieldInput`, so they should be fine.

**Step 4:** Verify in the browser that the select field shows its title, displays the placeholder, and opens on click.

---

## Task 2: Field Description + Character Limit Feedback (Bug #2)

Ensure subtitle/description is shown for all fields. Add real-time character count feedback when min/max character limits are configured.

**Files:**
- Modify: `src/features/instances/InstanceFieldInput.tsx`
- Modify: `src/routes/_authenticated/instances/$readableId.tsx`

**Step 1:** The field description is already rendered in `$readableId.tsx` (line 589-594). The issue is whether `field.description` is populated from the DB. Check the query in `fetchInstanceByReadableId` — line 1545 selects `description` from `template_fields`. This should work if the field has a description set in the builder. No code change needed here unless the description is not showing — debug with console.log.

**Step 2:** Add character count feedback to text and textarea fields in `InstanceFieldInput.tsx`:
- Read `validation_rules.min_chars` and `validation_rules.max_chars`
- Show a character counter below the input: `{currentLength}/{maxChars}` or `{currentLength} (min {minChars})`
- Color the counter red when under min or over max
- For textarea, also show the counter

The counter should be rendered inside `InstanceFieldInput` below the input element, not in the parent.

---

## Task 3: Real-Time Sync via Supabase Realtime (Bug #3)

### Task 3a: Create Postgres function for atomic field value upsert

**Files:**
- Create: `supabase/migrations/2026MMDD_create_upsert_field_value_fn.sql`

**Step 1:** Write a Postgres function `upsert_field_value` that:
1. Uses `INSERT ... ON CONFLICT (form_instance_id, template_field_id) DO UPDATE`
2. Atomically appends to `change_log` using `|| jsonb_build_array(...)`
3. Returns the full row
4. Is callable via `supabase.rpc('upsert_field_value', {...})`

```sql
CREATE OR REPLACE FUNCTION public.upsert_field_value(
  p_instance_id UUID,
  p_field_id UUID,
  p_value TEXT,
  p_old_value TEXT,
  p_user_id UUID
) RETURNS SETOF field_values
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  INSERT INTO field_values (form_instance_id, template_field_id, value, updated_by, change_log)
  VALUES (
    p_instance_id,
    p_field_id,
    p_value,
    p_user_id,
    jsonb_build_array(jsonb_build_object(
      'old_value', p_old_value,
      'new_value', p_value,
      'changed_by', p_user_id::text,
      'changed_at', now()::text
    ))
  )
  ON CONFLICT (form_instance_id, template_field_id) DO UPDATE SET
    value = EXCLUDED.value,
    updated_by = EXCLUDED.updated_by,
    change_log = field_values.change_log || jsonb_build_array(jsonb_build_object(
      'old_value', p_old_value,
      'new_value', p_value,
      'changed_by', p_user_id::text,
      'changed_at', now()::text
    ))
  RETURNING *;
END;
$$;
```

**Step 2:** Apply migration via `supabase db reset` and verify.

### Task 3b: Update `upsertFieldValue` to use the RPC

**Files:**
- Modify: `src/services/form-templates.ts` (upsertFieldValue function, ~line 1630)

Replace the manual check-then-insert/update logic with a single `supabase.rpc('upsert_field_value', {...})` call.

### Task 3c: Add Supabase Realtime subscription to instance page

**Files:**
- Modify: `src/routes/_authenticated/instances/$readableId.tsx`

**Step 1:** After data loads successfully, subscribe to a Realtime channel:

```typescript
const channel = supabase.channel(`instance-${data.instance.id}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'field_values',
    filter: `form_instance_id=eq.${data.instance.id}`,
  }, (payload) => {
    // Update fieldValues state from payload.new
    // Skip if the change was made by the current user (they already have it locally)
  })
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'form_instances',
    filter: `id=eq.${data.instance.id}`,
  }, (payload) => {
    // Update instance status if it changed (e.g. submitted by another admin)
  })
  .subscribe()
```

**Step 2:** Clean up the channel on unmount: `supabase.removeChannel(channel)`

**Step 3:** In the `postgres_changes` handler for `field_values`:
- Parse `payload.new` as a `FieldValue`
- Update the `fieldValues` Map state
- Clear any local value for that field (if the change came from another user)
- Skip self-updates to avoid overwriting optimistic local state

**Step 4:** In the `postgres_changes` handler for `form_instances`:
- If status changed to `'submitted'`, update local state and show a toast

---

## Task 4: Instance Click Navigation (Bug #4)

Clicking a row in the instances table on the template detail page should navigate to the instance page with the correct mode based on the user's role.

**Files:**
- Modify: `src/routes/_authenticated/forms/$templateId/index.tsx`

**Step 1:** Add an `onClick` handler to each `<TableRow>` (line 393):

Navigation rules:
- **Root Admin**: always `mode=view` (Root Admin never edits instances directly)
- **Admin**: `mode=edit` if instance is `pending`, `mode=view` if `submitted`
- **Editor**: `mode=edit` if instance is `pending`, `mode=view` if `submitted`
- **Viewer**: `mode=view` (only sees submitted instances anyway per RLS)

```typescript
function getInstanceMode(status: string, role: string): 'view' | 'edit' {
  if (role === 'root_admin' || role === 'viewer') return 'view'
  if (status === 'submitted') return 'view'
  return 'edit'
}
```

**Step 2:** Wire up the `onClick`:
```tsx
<TableRow
  key={instance.id}
  className="cursor-pointer"
  onClick={() => void navigate({
    to: '/instances/$readableId',
    params: { readableId: instance.readable_id },
    search: { mode: getInstanceMode(instance.status, currentUser?.role ?? 'viewer') },
  })}
>
```

---

## Task 5: Breadcrumb Context for Instance Page (Bug #5)

The instance page should show: `Forms > [Template Name] > [readable_id]`

**Files:**
- Modify: `src/routes/_authenticated/instances/$readableId.tsx`
- Modify: `src/routes/_authenticated.tsx` (add `instances` to SEGMENT_LABELS — or use `setBreadcrumbs` instead)

**Step 1:** Switch from `setPageTitle` to `setBreadcrumbs` in the instance page. After data loads:

```typescript
const { setBreadcrumbs } = usePageTitle()

// After data loads:
setBreadcrumbs([
  { label: data.template.name, path: `/forms/${data.template.id}` },
  { label: data.instance.readable_id, path: `/instances/${readableId}` },
])

// Cleanup:
return () => setBreadcrumbs([])
```

**Step 2:** Add `instances: 'Forms'` (not "Instances") to `SEGMENT_LABELS` so the URL-based first crumb shows "Forms" for the `/instances/...` path. Actually — this won't work cleanly because `/instances` is not under `/forms`. Instead, do NOT add to SEGMENT_LABELS. Just use `setBreadcrumbs` with the full trail including a "Forms" link:

```typescript
setBreadcrumbs([
  { label: 'Forms', path: '/forms' },
  { label: data.template.name, path: `/forms/${data.template.id}` },
  { label: data.instance.readable_id, path: `/instances/${readableId}` },
])
```

But wait — the breadcrumb builder in `HeaderBar` already adds URL-based crumbs first, then appends context crumbs. Since `/instances` is not in SEGMENT_LABELS, the URL produces zero crumbs, and then our 3-crumb array gets appended directly. This gives us: `Forms > Template Name > readable_id`. Exactly right.

---

## Commit Strategy

- **Commit 1:** `fix(instances): fix select field value handling and add character limit feedback` (Tasks 1 + 2)
- **Commit 2:** `feat(instances): add real-time sync via Supabase Realtime CDC` (Task 3)
- **Commit 3:** `fix(instances): add instance row click navigation with role-based mode` (Task 4)
- **Commit 4:** `fix(instances): update breadcrumb to show template and instance context` (Task 5)
