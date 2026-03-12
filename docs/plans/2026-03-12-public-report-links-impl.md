# Public Shareable Report Links — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow report instances to be publicly viewable via a shareable link, with a toggle for root admins to control visibility, and unauthenticated export support.

**Architecture:** Same URL serves both authenticated (full sidebar UI) and unauthenticated (stripped-down viewer) users. Soft auth check at route level determines rendering mode. RLS policy on `report_instances` for `anon` role enables public access. `data_snapshot` JSONB column contains the full rendered report — public route needs ONLY `report_instances` table access (no template joins).

**Tech Stack:** Supabase RLS, TanStack Router, React, Shadcn UI (Switch, Badge), Supabase Edge Functions (Deno)

**Design doc:** `docs/plans/2026-03-12-public-report-links-design.md`

---

## Task 1: Database Migration — Add `is_public` columns + RLS

**Files:**
- Create: `supabase/migrations/20260312200008_public_report_links.sql`

**Step 1: Write the migration**

```sql
-- Add is_public_default to report_templates (controls default for new instances)
ALTER TABLE public.report_templates
  ADD COLUMN is_public_default BOOLEAN NOT NULL DEFAULT true;

-- Add is_public to report_instances
ALTER TABLE public.report_instances
  ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT true;

-- Anon SELECT policy: only public, ready instances
CREATE POLICY report_instances_public_select ON public.report_instances
  FOR SELECT TO anon
  USING (is_public = true AND status = 'ready');

-- Root admin can toggle is_public on instances
CREATE POLICY report_instances_toggle_public ON public.report_instances
  FOR UPDATE TO authenticated
  USING (
    is_active_user() = true
    AND get_current_user_role() = 'root_admin'
  )
  WITH CHECK (
    is_active_user() = true
    AND get_current_user_role() = 'root_admin'
  );
```

**Step 2: Apply and verify migration**

Run: `supabase db reset`

Verify with `supabase_list_tables` (verbose) that `report_templates` has `is_public_default` and `report_instances` has `is_public`.

Run `supabase_get_advisors` (security) to check for any issues.

**Step 3: Regenerate TypeScript types**

Run: `supabase gen types typescript --local 2>/dev/null > src/types/database.ts`

**Step 4: Commit**

```
chore(db): add is_public columns and anon RLS for public report links
```

---

## Task 2: Update `generate-report` Edge Function — Copy `is_public_default`

**Files:**
- Modify: `supabase/functions/generate-report/index.ts`

**Step 1: Add `is_public_default` to template SELECT query**

At line ~243, change the template query from:
```ts
.select("id, name")
```
to:
```ts
.select("id, name, is_public_default")
```

**Step 2: Include `is_public` in the instance INSERT**

At line ~328, add `is_public` to the insert object:
```ts
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
feat(edge-functions): copy is_public_default when generating report instances
```

---

## Task 3: Update `export-report` Edge Function — Allow Public Exports

**Files:**
- Modify: `supabase/functions/export-report/index.ts`

**Step 1: Restructure auth logic**

Replace the current auth block (lines ~549-600) with a two-path approach:

```ts
const authHeader = req.headers.get("Authorization");
let isPublicAccess = false;

if (authHeader) {
  // Authenticated path — validate token as before
  const token = authHeader.replace("Bearer ", "");
  const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);

  if (authError || !caller) {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid or expired token" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_active")
    .eq("id", caller.id)
    .single();

  if (!profile?.is_active) {
    return new Response(
      JSON.stringify({ success: false, error: "User account is not active" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
} else {
  // Unauthenticated — mark as public access (will verify is_public below)
  isPublicAccess = true;
}
```

**Step 2: After parsing body, verify public access is allowed**

After the body parsing block that extracts `report_instance_id` and `format`, add:

```ts
if (isPublicAccess) {
  // Verify the instance is public
  const { data: publicCheck, error: publicErr } = await supabaseAdmin
    .from("report_instances")
    .select("is_public, status")
    .eq("id", report_instance_id)
    .single();

  if (publicErr || !publicCheck || !publicCheck.is_public || publicCheck.status !== 'ready') {
    return new Response(
      JSON.stringify({ success: false, error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
}
```

**Step 3: Commit**

```
feat(edge-functions): allow unauthenticated export for public report instances
```

---

## Task 4: Update Service Layer — Add `is_public` to Types and Queries

**Files:**
- Modify: `src/services/reports.ts`
- Modify: `src/features/reports/editor/serialization.ts`

**Step 1: Add `is_public` to `ReportInstanceDetail` interface**

In `src/services/reports.ts`, add `is_public: boolean` to the `ReportInstanceDetail` interface (around line ~94).

**Step 2: Add `is_public` to `ReportInstanceListRow` interface**

Add `is_public: boolean` to the `ReportInstanceListRow` interface (around line ~83).

**Step 3: Update `fetchReportInstanceByReadableId` query**

Add `is_public` to the SELECT string (line ~406):
```
id, readable_id, status, error_message, short_url, is_public,
```

And map it in the return object (line ~424):
```ts
is_public: data.is_public,
```

**Step 4: Create `fetchPublicReportInstance` function**

Add a new function for the public route that doesn't join through template tables (anon can't read them):

```ts
export async function fetchPublicReportInstance(
  readableId: string,
): Promise<ReportInstanceDetail | null> {
  const { data, error } = await supabase
    .from('report_instances')
    .select('id, readable_id, status, is_public, short_url, data_snapshot, form_instances_included, export_pdf_path, export_docx_path, created_at')
    .eq('readable_id', readableId)
    .eq('is_public', true)
    .eq('status', 'ready')
    .single()

  if (error || !data) return null

  return {
    id: data.id,
    readable_id: data.readable_id,
    status: data.status,
    error_message: null,
    short_url: data.short_url,
    is_public: data.is_public,
    data_snapshot: data.data_snapshot as Record<string, unknown> | null,
    form_instances_included: data.form_instances_included as string[],
    export_pdf_path: data.export_pdf_path,
    export_docx_path: data.export_docx_path,
    report_template_name: (data.data_snapshot as Record<string, unknown> | null)?.templateName as string ?? 'Report',
    version_number: 0,
    created_at: data.created_at,
  }
}
```

Note: The `report_template_name` is extracted from `data_snapshot.templateName` since the public route cannot join template tables. If `data_snapshot` doesn't store the template name, we'll need to check and add it during implementation.

**Step 5: Update `fetchReportInstances` query**

Add `is_public` to the list query SELECT (around line ~318) and map it in the return.

**Step 6: Add `is_public_default` to `ReportMetadata` and `CreateReportTemplateInput`**

In `src/features/reports/editor/serialization.ts`, add `isPublicDefault: boolean` to `ReportMetadata` (line ~44).

In `src/services/reports.ts`, add `is_public_default: boolean` to `CreateReportTemplateInput` (line ~110).

**Step 7: Update `editorToCreateInput` to include `is_public_default`**

In the serialization function, pass through `metadata.isPublicDefault` as `is_public_default`.

**Step 8: Update `createReportTemplate` and `updateReportTemplate`**

In `createReportTemplate`, add `is_public_default: input.is_public_default` to the insert.
In `updateReportTemplate`, add `is_public_default` to the optional updates object.

**Step 9: Update `exportReport` to support unauthenticated calls**

Create a variant function `exportReportPublic` that invokes the Edge Function without the session token:

```ts
export async function exportReportPublic(
  reportInstanceId: string,
  format: 'pdf' | 'docx',
): Promise<string> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  const res = await fetch(`${supabaseUrl}/functions/v1/export-report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': anonKey,
    },
    body: JSON.stringify({ report_instance_id: reportInstanceId, format }),
  })

  const data = await res.json()
  if (!data?.success) throw new Error(data?.error ?? 'Failed to export report')
  return data.download_url
}
```

**Step 10: Commit**

```
feat(reports): add is_public support to service layer and types
```

---

## Task 5: Create Public Report Route

**Files:**
- Create: `src/routes/reports/$templateId/instances/$readableId.tsx`
- The `_authenticated` version at `src/routes/_authenticated/reports/$templateId/instances/$readableId.tsx` will remain for authenticated users

**Important decision:** Rather than moving the route outside `_authenticated`, we create a **parallel public route** at `/reports/$templateId/instances/$readableId` (no `_authenticated` prefix). The TanStack Router will resolve the non-prefixed path for unauthenticated visitors. The authenticated path continues to work as-is through the `_authenticated` layout. We need to also create the necessary parent layout routes.

**Step 1: Create parent route files**

Create `src/routes/reports/route.tsx`:
```tsx
import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/reports')({
  component: () => <Outlet />,
})
```

Create `src/routes/reports/$templateId/route.tsx`:
```tsx
import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/reports/$templateId')({
  component: () => <Outlet />,
})
```

Create `src/routes/reports/$templateId/instances/route.tsx`:
```tsx
import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/reports/$templateId/instances')({
  component: () => <Outlet />,
})
```

**Step 2: Create the public viewer route**

Create `src/routes/reports/$templateId/instances/$readableId.tsx`:

This component:
1. Tries to get session from auth context
2. If authenticated → redirects to `/_authenticated/reports/$templateId/instances/$readableId`
3. If not authenticated → fetches via `fetchPublicReportInstance`, renders stripped-down view

```tsx
import { useState, useEffect, useCallback } from 'react'

import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { DownloadIcon, FileTextIcon, Loader2Icon, LockIcon } from 'lucide-react'

import { Button } from '../../../../components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../../components/ui/dropdown-menu'
import { ReportDocument } from '../../../../components/report-document'
import { useAuth } from '../../../../hooks/use-auth'
import {
  fetchPublicReportInstance,
  exportReportPublic,
} from '../../../../services/reports'
import type { ReportInstanceDetail } from '../../../../services/reports'

export const Route = createFileRoute('/reports/$templateId/instances/$readableId')({
  component: PublicReportViewerPage,
})

function PublicReportViewerPage() {
  const { templateId, readableId } = Route.useParams()
  const navigate = useNavigate()
  const { session, isLoading: authLoading } = useAuth()

  const [instance, setInstance] = useState<ReportInstanceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [notAvailable, setNotAvailable] = useState(false)

  // If authenticated, redirect to the full authenticated route
  useEffect(() => {
    if (!authLoading && session) {
      void navigate({
        to: '/_authenticated/reports/$templateId/instances/$readableId',
        params: { templateId, readableId },
        replace: true,
      })
    }
  }, [authLoading, session, navigate, templateId, readableId])

  const loadInstance = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchPublicReportInstance(readableId)
      if (!data) {
        setNotAvailable(true)
      } else {
        setInstance(data)
      }
    } catch {
      setNotAvailable(true)
    } finally {
      setLoading(false)
    }
  }, [readableId])

  useEffect(() => {
    if (!authLoading && !session) {
      void loadInstance()
    }
  }, [authLoading, session, loadInstance])

  async function handleExport(format: 'pdf' | 'docx') {
    if (!instance || exporting) return
    setExporting(true)
    try {
      const url = await exportReportPublic(instance.id, format)
      window.open(url, '_blank')
    } catch {
      // Silently fail for public users
    } finally {
      setExporting(false)
    }
  }

  // Still checking auth
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Authenticated user — will redirect, show loading
  if (session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Loading public instance
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Not available
  if (notAvailable || !instance) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
        <LockIcon className="size-10 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Report not available</h1>
        <p className="text-sm text-muted-foreground">
          This report is either private or does not exist.
        </p>
        <Button variant="outline" onClick={() => void navigate({ to: '/login' })}>
          Sign in
        </Button>
      </div>
    )
  }

  // Public viewer — stripped-down UI
  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      {/* Minimal header */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-background px-4 py-3">
        <div>
          <h1 className="text-sm font-semibold">
            {instance.report_template_name}
          </h1>
          <p className="text-xs text-muted-foreground">{instance.readable_id}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={exporting}>
              {exporting ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <DownloadIcon className="size-4" />
              )}
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => void handleExport('pdf')}>
              <FileTextIcon className="size-4" />
              Export as PDF
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void handleExport('docx')}>
              <FileTextIcon className="size-4" />
              Export as Word
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* Report document */}
      <main className="flex flex-1 flex-col gap-4 overflow-auto p-4">
        <ReportDocument
          templateName={instance.report_template_name}
          readableId={instance.readable_id}
          createdAt={instance.created_at}
          createdByName=""
          dataSnapshot={instance.data_snapshot ?? {}}
          formInstancesIncluded={instance.form_instances_included ?? []}
        />
      </main>
    </div>
  )
}
```

**Step 3: Regenerate route tree**

Run: `npx tsr generate`

**Step 4: Commit**

```
feat(reports): add public report viewer route for unauthenticated access
```

---

## Task 6: Add `is_public` Toggle to Report Instance Viewer (Authenticated)

**Files:**
- Modify: `src/routes/_authenticated/reports/$templateId/instances/$readableId.tsx`

**Step 1: Add `is_public` toggle for root admin**

Import `Switch` and `Label` from Shadcn. Import `useCurrentUser` hook.

Add state: `const [isPublic, setIsPublic] = useState(instance?.is_public ?? true)`

Add toggle handler:
```ts
async function handleTogglePublic(checked: boolean) {
  if (!instance) return
  setIsPublic(checked)
  try {
    const { error } = await supabase
      .from('report_instances')
      .update({ is_public: checked })
      .eq('id', instance.id)
    if (error) throw error
    toast.success(checked ? 'Report is now public' : 'Report is now private')
  } catch {
    setIsPublic(!checked) // revert on failure
    toast.error('Failed to update visibility')
  }
}
```

**Step 2: Add toggle to header actions (root admin only)**

In the `useEffect` that sets header actions, add the toggle before the Copy Link button:

```tsx
{currentUser?.role === 'root_admin' && (
  <div className="flex items-center gap-2">
    <Switch
      id="public-toggle"
      checked={isPublic}
      onCheckedChange={(checked) => void handleTogglePublic(checked)}
    />
    <Label htmlFor="public-toggle" className="text-sm">
      Public
    </Label>
  </div>
)}
```

**Step 3: Sync `isPublic` state when instance loads**

Add effect: `useEffect(() => { if (instance) setIsPublic(instance.is_public) }, [instance?.is_public])`

**Step 4: Commit**

```
feat(reports): add public/private toggle for root admin on report instance viewer
```

---

## Task 7: Add `is_public_default` Toggle to Report Template Builder

**Files:**
- Modify: `src/routes/_authenticated/reports/new.tsx`
- Modify: `src/routes/_authenticated/reports/$templateId/edit.tsx`
- Modify: `src/features/reports/editor/serialization.ts`

**Step 1: Update `ReportMetadata` interface**

In `src/features/reports/editor/serialization.ts`, add `isPublicDefault: boolean` to the interface.

**Step 2: Update `editorToCreateInput`**

Add `is_public_default: metadata.isPublicDefault` to the return object.

**Step 3: Add toggle to `new.tsx`**

Initialize `isPublicDefault: true` in the metadata state.

Add below the auto-generate switch:
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
    Make generated reports publicly accessible by default
  </Label>
</div>
```

Add `isPublicDefault: metadata.isPublicDefault` to the `contentState` object for auto-save fingerprinting.

**Step 4: Add toggle to `edit.tsx`**

Same toggle UI as `new.tsx`. Initialize from loaded template data.

When toggling OFF from ON, show a confirmation dialog with two options:
- "New instances only" — just update the template default
- "All instances" — also batch-update existing instances via:
  ```ts
  await supabase
    .from('report_instances')
    .update({ is_public: false })
    .in('report_template_version_id',
      (await supabase
        .from('report_template_versions')
        .select('id')
        .eq('report_template_id', templateId)
      ).data?.map(v => v.id) ?? []
    )
  ```

**Step 5: Update `fetchReportTemplateById` to include `is_public_default`**

Add `is_public_default` to the template SELECT and return it.

**Step 6: Commit**

```
feat(reports): add is_public_default toggle to report template builder
```

---

## Task 8: Add Public Badge to Report Instances Table

**Files:**
- Modify: `src/routes/_authenticated/reports/$templateId/index.tsx`

**Step 1: Add "Visibility" column to instances table**

Add a column after "Status" that shows a badge:
- Public: green `Globe` icon badge
- Private: muted `Lock` icon badge

**Step 2: Commit**

```
feat(reports): show public/private badge on report instances table
```

---

## Task 9: Update `docs/TODO.md`

**Files:**
- Modify: `docs/TODO.md`

**Step 1: Add public report links items and cross off completed ones**

Add a new section under "Feature: Reports" in TODO.md:

```markdown
## Feature: Public Report Links

### Backend
- [x] `is_public_default` column on `report_templates`
- [x] `is_public` column on `report_instances`
- [x] Anon SELECT RLS policy on `report_instances`
- [x] Root admin UPDATE RLS policy for `is_public` toggle
- [x] `generate-report` copies `is_public_default` to new instances
- [x] `export-report` allows unauthenticated export for public instances

### Frontend
- [x] Public report viewer route (outside `_authenticated`)
- [x] Public/private toggle on report instance viewer (root admin)
- [x] `is_public_default` toggle on report template builder
- [x] Public/private badge on report instances table
```

**Step 2: Commit**

```
docs: update TODO with public report links
```

---

## Task 10: Verify and Test

**Step 1: Run build**

```bash
npm run build
```

Fix any type errors.

**Step 2: Run lint**

```bash
npm run lint
```

Fix any lint errors.

**Step 3: Manual verification checklist**

- [ ] Authenticated user can view report instance at `/_authenticated/reports/:tid/instances/:rid`
- [ ] Root admin sees public/private toggle on report instance viewer
- [ ] Toggling public/private updates the database
- [ ] Unauthenticated user visiting `/reports/:tid/instances/:rid` sees stripped-down viewer for public instances
- [ ] Unauthenticated user sees "not available" for private instances
- [ ] Unauthenticated user can export public instance as PDF/Word
- [ ] New report template builder has "Public by default" toggle
- [ ] Edit report template builder has "Public by default" toggle with cascade dialog
- [ ] Report instances table shows public/private badge
- [ ] `generate-report` Edge Function copies `is_public_default` when creating instances
- [ ] Short URLs still work correctly for both public and authenticated access

**Step 4: Final commit if needed**

```
fix(reports): address any issues found during testing
```
