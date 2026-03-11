# Remaining TODOs Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete all non-reports remaining TODOs: archive/delete with instances, builder preview, notification emails, adaptive dashboard, and deployment checklist.

**Architecture:** Each task is a self-contained vertical. Archive/delete extends existing form template service + UI. Notifications is a new Edge Function. Dashboard is a new feature module with role-based widget composition. No new database tables needed (except potentially a Postgres function for cascade delete).

**Tech Stack:** React 19, TypeScript, Shadcn UI, TailwindCSS, Supabase (Client SDK for reads/writes, Edge Functions for Resend email), Resend SDK (`npm:resend` in Deno).

---

## Task 1: Cross Off Already-Completed TODOs

**Files:**
- Modify: `docs/TODO.md`

**Step 1:** Mark these items as done in `docs/TODO.md`:
- `[x] Schedule management (create/edit schedule, add groups)` — all 4 components + 7 service functions already implemented
- `[x] trigger_on_form_instance_submitted` — already created by reports agent in migration `20260312100005`

**Step 2: Commit**
```bash
git add docs/TODO.md
git commit -m "docs(todo): mark schedule management and submitted trigger as complete"
```

---

## Task 2: Archive/Hard-Delete for Templates WITH Instances

**Files:**
- Create: `supabase/migrations/YYYYMMDDHHMMSS_create_hard_delete_template_fn.sql`
- Modify: `src/services/form-templates.ts` (~lines 630-657)
- Modify: `src/routes/_authenticated/forms/$templateId/index.tsx` (~lines 219-239, 341-349, 498-522)

### Step 1: Create Postgres function for cascade hard-delete

The hard-delete needs to remove in order: field_values, form_instances, schedule_group_targets, instance_schedules, template_group_access, template_fields, template_sections, template_versions, then form_templates. Use a Postgres function to do this in a single transaction.

```sql
CREATE OR REPLACE FUNCTION public.hard_delete_template(p_template_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete field values for all instances of this template
  DELETE FROM public.field_values
  WHERE form_instance_id IN (
    SELECT fi.id FROM public.form_instances fi
    INNER JOIN public.template_versions tv ON tv.id = fi.template_version_id
    WHERE tv.template_id = p_template_id
  );

  -- Delete form instances
  DELETE FROM public.form_instances
  WHERE template_version_id IN (
    SELECT tv.id FROM public.template_versions tv
    WHERE tv.template_id = p_template_id
  );

  -- Delete schedule group targets (CASCADE from instance_schedules handles this,
  -- but be explicit)
  DELETE FROM public.schedule_group_targets
  WHERE schedule_id IN (
    SELECT id FROM public.instance_schedules
    WHERE template_id = p_template_id
  );

  -- Delete instance schedules
  DELETE FROM public.instance_schedules
  WHERE template_id = p_template_id;

  -- Delete template group access
  DELETE FROM public.template_group_access
  WHERE template_id = p_template_id;

  -- Delete template (CASCADE handles versions → sections → fields)
  DELETE FROM public.form_templates
  WHERE id = p_template_id;
END;
$$;
```

Apply migration via MCP, then also write the file to `supabase/migrations/`.

### Step 2: Add service functions

In `src/services/form-templates.ts`, add:

```typescript
/**
 * Archive a form template (soft-delete).
 * Sets is_active = false. Template and instances remain in DB.
 */
export async function archiveTemplate(templateId: string): Promise<void> {
  // Also deactivate any active schedule
  const { error: schedErr } = await supabase
    .from('instance_schedules')
    .update({ is_active: false })
    .eq('template_id', templateId)

  if (schedErr) throw schedErr

  const { error } = await supabase
    .from('form_templates')
    .update({ is_active: false })
    .eq('id', templateId)

  if (error) throw error
}

/**
 * Restore an archived form template.
 */
export async function restoreTemplate(templateId: string): Promise<void> {
  const { error } = await supabase
    .from('form_templates')
    .update({ is_active: true })
    .eq('id', templateId)

  if (error) throw error
}

/**
 * Hard-delete a template and ALL its instances, field values, schedules.
 * Uses a Postgres function for transactional cascade.
 */
export async function hardDeleteTemplate(templateId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.rpc as any)('hard_delete_template', {
    p_template_id: templateId,
  })

  if (error) throw error
}
```

### Step 3: Update the template detail page UI

Replace the existing delete dialog logic with a choice dialog when instances exist:

- When `instances.length === 0`: keep current hard-delete behavior (existing `AlertDialog`)
- When `instances.length > 0`: show a new dialog with two options:
  1. **Archive (recommended)** — sets `is_active = false`, navigates to `/forms`
  2. **Permanently delete** — cascade delete everything, requires typing the template name to confirm

The dropdown menu item should always be enabled (remove `disabled={instances.length > 0}`). Change label to just "Delete Form" always.

### Step 4: Add "Restore" action to archived tab

In the forms list page (`src/routes/_authenticated/forms/index.tsx`), when `tab === 'archived'`, add a restore button in each row or a row action menu. On click, call `restoreTemplate(id)`, toast success, and reload the list.

### Step 5: Commit
```bash
git commit -m "feat(templates): archive and hard-delete for templates with instances"
```

---

## Task 3: Form Builder Preview Button

**Files:**
- Modify: `src/routes/_authenticated/forms/$templateId/edit.tsx` (or wherever the builder header actions are)

### Step 1: Add Preview button

In the form builder header (next to Cancel and Publish), add a "Preview" button that:
- Is only visible when the template has at least one published version
- Opens a new tab to `/instances/preview?templateId=<id>&versionId=<latest_published_version_id>`
- Uses `window.open()` with `_blank` target

Actually — simpler approach: The preview button should render the form fields in read-only mode in a Sheet (side panel) or Dialog, using the same `InstanceFieldInput` component with `disabled={true}`. This avoids needing a real instance in the database.

### Step 2: Build PreviewSheet component

Create a `PreviewSheet` component that:
- Accepts the current builder fields and sections
- Renders them using `InstanceFieldInput` in read-only mode
- Shows section navigation (simplified stepper)
- Opens from a "Preview" button in the builder header

### Step 3: Commit
```bash
git commit -m "feat(builder): add form preview side sheet"
```

---

## Task 4: `send-notification-email` Edge Function

**Files:**
- Create: `supabase/functions/send-notification-email/index.ts`
- Create: `supabase/functions/send-notification-email/deno.json`

### Step 1: Create the Edge Function

Follow the project's existing Edge Function pattern:
- `Deno.serve(async (req) => { ... })`
- Inline `corsHeaders` for browser-facing calls
- JWT validation via service role client
- Role check: caller must be `admin` or `root_admin`
- Use `npm:resend` SDK or direct `fetch` to Resend API
- Three email templates: `member_request_pending`, `member_request_approved`, `member_request_rejected`

```typescript
import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? ""
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SB_SECRET_KEY = Deno.env.get("SB_SECRET_KEY") ?? ""
const SB_PUBLISHABLE_KEY = Deno.env.get("SB_PUBLISHABLE_KEY") ?? ""
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "RoyalForms <noreply@royalforms.app>"

// Templates return { subject, html }
function renderTemplate(
  template: string,
  data: Record<string, string>,
): { subject: string; html: string } {
  switch (template) {
    case "member_request_pending":
      return {
        subject: `New member request from ${data.requester_name}`,
        html: `<p><strong>${data.requester_name}</strong> has requested to join <strong>${data.group_name}</strong> as <strong>${data.proposed_role}</strong>.</p><p>Please review this request in RoyalForms.</p>`,
      }
    case "member_request_approved":
      return {
        subject: `Your request to join ${data.group_name} was approved`,
        html: `<p>Your request to join <strong>${data.group_name}</strong> has been approved. You can now access the group's forms.</p>`,
      }
    case "member_request_rejected":
      return {
        subject: `Your request to join ${data.group_name} was not approved`,
        html: `<p>Your request to join <strong>${data.group_name}</strong> was not approved at this time.</p>`,
      }
    default:
      throw new Error(`Unknown template: ${template}`)
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    // Validate auth, extract caller role, validate request body,
    // render template, send via Resend API, return result
    // ... (follow invite-user pattern for auth validation)
  } catch (err) {
    console.error("[send-notification-email]", err)
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }
})
```

### Step 2: Create deno.json

```json
{
  "compilerOptions": {
    "strict": true,
    "lib": ["deno.ns", "deno.unstable"]
  }
}
```

### Step 3: Add caller service function

In `src/services/` (either a new `notifications.ts` or in an existing service file), add a function to invoke the Edge Function from the SPA:

```typescript
export async function sendNotificationEmail(
  to: string,
  template: string,
  data: Record<string, string>,
): Promise<void> {
  const { error } = await supabase.functions.invoke('send-notification-email', {
    body: { to, template, data },
  })
  if (error) throw error
}
```

### Step 4: Add to deployment checklist

Add `RESEND_API_KEY` and `FROM_EMAIL` to `supabase-changes.local`.

### Step 5: Commit
```bash
git commit -m "feat(notifications): add send-notification-email Edge Function via Resend"
```

---

## Task 5: Adaptive Dashboard

**Files:**
- Modify: `src/routes/_authenticated/index.tsx`
- Create: `src/features/dashboard/DashboardWidgets.tsx`
- Create: `src/services/dashboard.ts`

### Step 1: Create dashboard service

In `src/services/dashboard.ts`, add functions that query data for each widget. All queries use the Supabase Client SDK with RLS.

Functions needed:
- `fetchPendingRequestCount()` — count of pending member_requests (Root Admin sees all, Admin sees own group)
- `fetchRecentSubmissions(groupId?)` — recent submitted form_instances with template name, limited to 10
- `fetchActiveSchedules()` — count of active instance_schedules (Root Admin only)
- `fetchGroupActivity()` — summary per group: member count, instance count (Root Admin only)
- `fetchSystemStats()` — total users, groups, templates, instances (Root Admin only)
- `fetchGroupMembers(groupId)` — own group members (Admin)
- `fetchDraftInstances(groupId?)` — pending instances for own group
- `fetchAssignedFields(userId)` — field_values assigned to current user that are still pending (Editor)

### Step 2: Build widget components

Create `src/features/dashboard/DashboardWidgets.tsx` with individual widget components:

Each widget is a Shadcn Card with:
- Title in CardHeader
- Content in CardContent (stat number, small table, or list)
- Link to the full page in CardFooter

Widgets:
- `PendingRequestsWidget` — shows count badge + link to groups page
- `RecentSubmissionsWidget` — table of last 10 submissions (template name, group, date)
- `ActiveSchedulesWidget` — count + link to forms page
- `GroupActivityWidget` — small table (group name, members, instances)
- `SystemStatsWidget` — 4 stat cards (users, groups, templates, instances)
- `GroupMembersWidget` — member list for admin's group
- `DraftInstancesWidget` — list of pending instances
- `AssignedFieldsWidget` — fields awaiting the editor's input

### Step 3: Compose the dashboard page

In `src/routes/_authenticated/index.tsx`:
- Use `useCurrentUser()` to get role
- Render a responsive grid (`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4`)
- Conditionally render widgets based on role:
  - Root Admin: PendingRequests, RecentSubmissions, ActiveSchedules, GroupActivity, SystemStats
  - Admin: GroupMembers, PendingRequests, DraftInstances, RecentSubmissions
  - Editor: AssignedFields, DraftInstances, RecentSubmissions
  - Viewer: RecentSubmissions, (AvailableReports — show placeholder until reports frontend exists)

### Step 4: Commit
```bash
git commit -m "feat(dashboard): add role-adaptive dashboard with widgets"
```

---

## Task 6: Deployment Checklist

**Files:**
- Modify: `supabase-changes.local` (create if doesn't exist, gitignored)

### Step 1: Add external service config items

```
# Deployment Checklist — Manual Configuration
# These items must be configured on the remote Supabase project / external services
# before or during deployment. They cannot be pushed via migrations.

## Resend (Email)
- [ ] Set RESEND_API_KEY on Edge Functions environment variables
- [ ] Set FROM_EMAIL on Edge Functions environment variables (e.g. "RoyalForms <noreply@yourdomain.com>")
- [ ] Configure Resend SMTP in Supabase Auth settings (for auth emails like password reset, invite)
- [ ] Verify sending domain in Resend dashboard

## Shlink (Short URLs)
- [ ] Deploy Shlink instance (self-hosted or cloud)
- [ ] Set SHLINK_API_KEY on Edge Functions environment variables
- [ ] Set SHLINK_BASE_URL on Edge Functions environment variables
- [ ] Set APP_BASE_URL on Edge Functions environment variables

## Supabase Auth
- [ ] Set site_url to production URL
- [ ] Add production URL to redirect_urls allowlist
- [ ] Enable/disable signup as needed
```

### Step 2: Commit (if not gitignored — check first)

If the file is gitignored, no commit needed. If not, add it to `.gitignore`.

---

## Task 7: Update TODO.md with All Completed Items

After all tasks above are done, update `docs/TODO.md` to reflect the new state.
