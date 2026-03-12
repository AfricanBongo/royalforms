# Public Shareable Report Links — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow report instances to be publicly viewable by anyone with the link, with root_admin control over the public/private toggle.

**Architecture:** Add `is_public` column to `report_instances` and `is_public_default` to `report_templates`. Move the report instance viewer outside the `_authenticated` layout so it can do a soft auth check — rendering full UI for authenticated users and a stripped-down read-only view for public visitors. Modify the `export-report` Edge Function to allow unauthenticated exports for public reports.

**Tech Stack:** PostgreSQL (RLS), Supabase Edge Functions (Deno), React + TanStack Router, Shadcn UI (Switch, Tooltip)

---

### Task 1: Database Migration — Add `is_public` columns and RLS

**Files:**
- Create: `supabase/migrations/20260312200008_public_report_links.sql`

**Step 1: Write the migration**

```sql
-- Add is_public_default to report_templates (controls default for new instances)
ALTER TABLE public.report_templates
  ADD COLUMN is_public_default BOOLEAN NOT NULL DEFAULT true;

-- Add is_public to report_instances (controls public access per instance)
ALTER TABLE public.report_instances
  ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT true;

-- Allow anonymous users to SELECT public, ready report instances
CREATE POLICY report_instances_public_select ON public.report_instances
  FOR SELECT TO anon
  USING (is_public = true AND status = 'ready');

-- Allow root_admin to UPDATE is_public on report instances
CREATE POLICY report_instances_update_public ON public.report_instances
  FOR UPDATE TO authenticated
  USING (
    is_active_user() = true
    AND get_current_user_role() = 'root_admin'
  )
  WITH CHECK (
    is_active_user() = true
    AND get_current_user_role() = 'root_admin'
  );

-- Allow root_admin to UPDATE is_public_default on report templates
-- (report_templates already has update policies; verify they cover root_admin)
```

**Step 2: Apply migration**

Run: `npx supabase db reset`
Verify: No errors, migration applies cleanly.

**Step 3: Regenerate TypeScript types**

Run: `npx supabase gen types typescript --local 2>/dev/null > src/types/database.ts`
Verify: `is_public` appears in the `report_instances` type, `is_public_default` in `report_templates`.

**Step 4: Commit**

```
feat(db): add is_public columns and RLS for public report links
```

---

### Task 2: Update `generate-report` Edge Function

**Files:**
- Modify: `supabase/functions/generate-report/index.ts`

**Step 1: Add `is_public_default` to the template SELECT query**

At the template fetch (around line 243), change:
```typescript
.select("id, name")
```
to:
```typescript
.select("id, name, is_public_default")
```

**Step 2: Pass `is_public` when inserting the report instance**

At the `.insert()` call (around line 329), add `is_public`:
```typescript
.insert({
  readable_id: readableId,
  report_template_version_id: latestVersion.id,
  status: "generating",
  created_by: createdBy,
  form_instances_included: form_instance_ids,
  data_snapshot: null,
  is_public: reportTemplate.is_public_default ?? true,
})
```

**Step 3: Commit**

```
feat(edge-functions): copy is_public_default to report instances on generation
```

---

### Task 3: Update `export-report` Edge Function for Public Access

**Files:**
- Modify: `supabase/functions/export-report/index.ts` (lines 549-601)

**Step 1: Modify the auth section**

Replace the hard 401 on missing Authorization header with a fallback check. The new logic:

1. If `Authorization` header is present → validate as today (getUser, check active)
2. If no `Authorization` header → extract `instance_id` from the request body, look up the instance, check `is_public = true`
   - If public → proceed (set a flag like `isPublicAccess = true`)
   - If not public → return 401

Pseudo-code for the new auth block:
```typescript
let isPublicAccess = false;
const authHeader = req.headers.get("Authorization");

if (authHeader) {
  // Existing auth validation...
} else {
  // Check if the requested instance is public
  const body = await req.clone().json();
  const { data: inst } = await supabaseAdmin
    .from("report_instances")
    .select("is_public")
    .eq("id", body.instance_id)
    .single();

  if (!inst?.is_public) {
    return new Response(
      JSON.stringify({ success: false, error: "Authentication required" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  isPublicAccess = true;
}
```

**Step 2: Commit**

```
feat(edge-functions): allow unauthenticated export for public report instances
```

---

### Task 4: Update Service Layer — Types and Functions

**Files:**
- Modify: `src/services/reports.ts`

**Step 1: Add `is_public` to relevant types**

Add to `ReportInstanceListRow` (around line 83):
```typescript
is_public: boolean
```

Add to `ReportInstanceDetail` (around line 96):
```typescript
is_public: boolean
```

Add to `ReportTemplateDetail` (around line 39):
```typescript
is_public_default: boolean
```

**Step 2: Update SELECT queries to include `is_public`**

In `fetchReportInstances`, `fetchReportInstanceById`, and `fetchReportInstanceByReadableId` — add `is_public` to the `.select()` strings and the return mappings.

**Step 3: Add `toggleReportInstancePublic` function**

```typescript
export async function toggleReportInstancePublic(
  instanceId: string,
  isPublic: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('report_instances')
    .update({ is_public: isPublic })
    .eq('id', instanceId)
  if (error) throw error
}
```

**Step 4: Add `updateTemplatePublicDefault` function**

```typescript
export async function updateTemplatePublicDefault(
  templateId: string,
  isPublicDefault: boolean,
  applyToExisting: boolean,
): Promise<void> {
  const { error: tErr } = await supabase
    .from('report_templates')
    .update({ is_public_default: isPublicDefault })
    .eq('id', templateId)
  if (tErr) throw tErr

  if (applyToExisting) {
    const { error: iErr } = await supabase
      .from('report_instances')
      .update({ is_public: isPublicDefault })
      .in(
        'report_template_version_id',
        supabase
          .from('report_template_versions')
          .select('id')
          .eq('report_template_id', templateId),
      )
    // Note: .in() with a subquery may not work with the JS client.
    // Alternative: use a raw RPC or two-step fetch.
    if (iErr) throw iErr
  }
}
```

**Step 5: Add `fetchPublicReportInstance` function for the anon path**

```typescript
export async function fetchPublicReportInstance(
  readableId: string,
): Promise<ReportInstanceDetail | null> {
  // Uses the anon key (default supabase client) — RLS allows anon SELECT on public+ready
  const { data, error } = await supabase
    .from('report_instances')
    .select('id, readable_id, status, error_message, short_url, is_public, data_snapshot, form_instances_included, export_pdf_path, export_docx_path, created_at, report_template_versions!inner(report_template_id, report_templates!inner(name))')
    .eq('readable_id', readableId)
    .single()

  if (error || !data) return null

  // Map to ReportInstanceDetail...
}
```

**Step 6: Commit**

```
feat(reports): add is_public to service types and toggle functions
```

---

### Task 5: Move Report Instance Viewer Route Outside `_authenticated`

**Files:**
- Create: `src/routes/reports/$templateId/instances/$readableId.tsx`
- Delete: `src/routes/_authenticated/reports/$templateId/instances/$readableId.tsx`
- Create: `src/routes/reports.tsx` (layout route for the `/reports` non-authenticated path)

**Step 1: Create a passthrough layout for `/reports`**

`src/routes/reports.tsx`:
```typescript
import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/reports')({
  component: () => <Outlet />,
})
```

Create matching directory structure: `src/routes/reports/$templateId/instances/`

**Step 2: Move and rewrite the viewer page**

Move the viewer to `src/routes/reports/$templateId/instances/$readableId.tsx`.

The component does a soft auth check:
- Uses `useAuth()` to check if there's a session
- If authenticated: renders the full view (sidebar chrome injected via the authenticated layout hooks, or inline)
- If not authenticated: fetches via `fetchPublicReportInstance`, renders stripped-down view

Since this route is outside `_authenticated`, it won't have sidebar/breadcrumbs automatically. For authenticated users, we need to either:
- Import and render the sidebar ourselves
- Or redirect authenticated users to the `_authenticated` version

**Simpler approach:** Keep the `_authenticated` route AND add a new public-only route. Use a redirect:
- `/reports/:tid/instances/:rid` → If authenticated, redirect to `/_authenticated/reports/:tid/instances/:rid`. If not, render public view.

Actually the **simplest approach** per the design: create a new route at `/public/reports/$readableId` that is public-only (no auth, no sidebar). Keep the authenticated route as-is. Update the Copy Link button to copy the public URL when `is_public = true`.

Wait — we decided against `/public/` to keep one URL for Shlink. Let me follow the agreed design.

**Revised approach:** Create a new layout `_soft-auth.tsx` that does NOT redirect on missing session. Move the report instance viewer under it.

`src/routes/_soft-auth.tsx`:
```typescript
import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_soft-auth')({
  component: () => <Outlet />,
})
```

Then the route lives at: `src/routes/_soft-auth/reports/$templateId/instances/$readableId.tsx`

But TanStack Router pathless layouts don't add path segments, so the URL stays `/reports/$templateId/instances/$readableId`.

**Conflict:** The `_authenticated` layout already owns `/reports/...` routes (list, detail, new, edit). We need the instance viewer to be under `_soft-auth` while the rest stay under `_authenticated`.

**Resolution:** Only the instance viewer route moves. The `_authenticated/reports/` routes for list, detail, new, edit remain. TanStack Router resolves routes by specificity — the more specific `/reports/$templateId/instances/$readableId` under `_soft-auth` takes precedence.

Actually, TanStack Router file-based routing doesn't allow two different layouts to claim the same path segment. We need a different approach.

**Final approach:** Keep the route at the same path. Remove it from `_authenticated` and place it at the root level with its own `beforeLoad` that does soft auth:

`src/routes/reports/$templateId/instances/$readableId.tsx`

This creates route `/reports/$templateId/instances/$readableId` at the root (no layout prefix). For the other `/reports/` routes under `_authenticated`, they continue to work because TanStack Router's `_authenticated` is a pathless layout — it doesn't add `/authenticated/` to the URL. The router matches the most specific route.

**Implementation:**
1. Create `src/routes/reports/` directory structure
2. Create `src/routes/reports/$templateId/instances/$readableId.tsx` with soft auth logic
3. Delete `src/routes/_authenticated/reports/$templateId/instances/$readableId.tsx`
4. The new component checks auth and renders accordingly

**Step 3: Commit**

```
feat(reports): move instance viewer to soft-auth route for public access
```

---

### Task 6: Implement the Dual-Mode Report Instance Viewer

**Files:**
- Modify: `src/routes/reports/$templateId/instances/$readableId.tsx` (created in Task 5)

**Step 1: Implement the component**

The component:
1. Calls `useAuth()` to check session state
2. If authenticated:
   - Fetches via `fetchReportInstanceByReadableId` (existing function, uses user JWT)
   - Renders full layout: imports `SidebarProvider`, `AppSidebar`, `SidebarInset`, breadcrumbs
   - Header actions: Copy Link, Public toggle (root_admin only), Export dropdown
3. If not authenticated:
   - Fetches via `fetchPublicReportInstance` (uses anon key, RLS allows public+ready)
   - If null → render "This report is not available" message
   - If found → render minimal layout: simple header (report title + Export dropdown), `<ReportDocument />`

**Step 2: Implement the public toggle for root_admin**

In the authenticated header actions, add a Switch next to the Copy Link button:
```tsx
{currentUser?.role === 'root_admin' && (
  <div className="flex items-center gap-2">
    <Switch
      checked={instance.is_public}
      onCheckedChange={(checked) => void handleTogglePublic(checked)}
    />
    <span className="text-sm text-muted-foreground">Public</span>
  </div>
)}
```

Handler:
```typescript
async function handleTogglePublic(isPublic: boolean) {
  try {
    await toggleReportInstancePublic(instance.id, isPublic)
    setInstance(prev => prev ? { ...prev, is_public: isPublic } : prev)
    toast.success(isPublic ? 'Report is now public' : 'Report is now private')
  } catch { toast.error('Failed to update visibility') }
}
```

**Step 3: Commit**

```
feat(reports): implement dual-mode viewer with public toggle
```

---

### Task 7: Template-Level Public Default Toggle

**Files:**
- Modify: `src/routes/_authenticated/reports/new.tsx` (around lines 338-349)
- Modify: `src/routes/_authenticated/reports/$templateId/edit.tsx` (around lines 375-386)
- Modify: `src/features/reports/editor/serialization.ts` (around line 49 and 373)
- Modify: `src/routes/_authenticated/reports/$templateId/index.tsx` (template detail page)

**Step 1: Add `isPublicDefault` to `ReportMetadata`**

In `src/features/reports/editor/serialization.ts`, add to the interface:
```typescript
export interface ReportMetadata {
  name: string
  abbreviation: string
  description: string | null
  linkedFormTemplateId: string
  autoGenerate: boolean
  isPublicDefault: boolean
}
```

Map it in `editorToCreateInput`:
```typescript
is_public_default: metadata.isPublicDefault,
```

**Step 2: Add toggle to new.tsx**

After the auto-generate Switch (around line 349), add:
```tsx
<div className="flex items-center gap-3">
  <Switch
    id="public-default"
    checked={metadata.isPublicDefault}
    onCheckedChange={(checked) =>
      setMetadata((m) => ({ ...m, isPublicDefault: checked }))
    }
  />
  <Label htmlFor="public-default" className="text-sm">
    Reports are publicly accessible by default
  </Label>
</div>
```

Update initial metadata state to include `isPublicDefault: true`.

**Step 3: Add toggle to edit.tsx**

Same Switch as above. Load value from `data.is_public_default` when setting metadata from the fetched template.

**Step 4: Add cascade confirmation dialog to template detail page**

In `src/routes/_authenticated/reports/$templateId/index.tsx`, add a toggle in the stat cards area and a confirmation dialog when toggling off:
- "Apply to existing instances too?"
- "New instances only" / "All instances"
- Calls `updateTemplatePublicDefault(templateId, false, applyToExisting)`

**Step 5: Commit**

```
feat(reports): add public-default toggle to report template builder
```

---

### Task 8: Update Report Instances Table — Public Badge

**Files:**
- Modify: `src/routes/_authenticated/reports/$templateId/index.tsx`

**Step 1: Add a Public/Private badge to each instance row**

In the instances table, add a column or badge showing public status. A simple approach: add a small lock/globe icon next to the status badge.

**Step 2: Commit**

```
feat(reports): show public/private badge on report instance rows
```

---

### Task 9: Update `exportReport` Service for Public Access

**Files:**
- Modify: `src/services/reports.ts`

**Step 1: Modify `exportReport` to optionally skip auth**

The current `exportReport` function calls `supabase.functions.invoke('export-report', ...)` which automatically sends the user's JWT. For public (unauthenticated) access, we need to invoke without the Authorization header.

Add a parameter:
```typescript
export async function exportReport(
  instanceId: string,
  format: 'pdf' | 'docx',
  options?: { publicAccess?: boolean },
): Promise<string> {
```

When `publicAccess` is true, use `fetch()` directly instead of `supabase.functions.invoke()` to avoid sending the JWT.

**Step 2: Commit**

```
feat(reports): support public export without auth header
```

---

### Task 10: Final Verification

**Step 1: Run full build**

Run: `npm run build`
Expected: Exit 0, no type errors.

**Step 2: Run lint**

Run: `npm run lint`
Expected: No new errors from our changes.

**Step 3: Test locally**

1. Create a report instance → verify `is_public = true` in DB
2. Open instance viewer while logged in → see full UI with public toggle
3. Open same URL in incognito → see stripped-down view with report + export
4. Toggle public off → incognito shows "Report not available"
5. Toggle public on → incognito shows report again
6. Export PDF from incognito → works

**Step 4: Commit any fixes, then final commit if needed**
