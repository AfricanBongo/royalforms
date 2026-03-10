# TODO

Remaining implementation work derived from the system design docs in `docs/system-design/`.

An agent starting a new session should read this file to understand what's left to build. Cross off items when done. Add new items if scope changes.

**Execution strategy**: Foundation batch first (shared DB infrastructure), then feature-by-feature verticals (backend -> frontend per feature). See Option C rationale in commit history.

---

## Infrastructure Setup

- [x] Initialize Supabase CLI (`supabase init`)
- [x] Configure `supabase/config.toml` for local dev
- [x] Create `.env.local` with local Supabase credentials (gitignored)
- [x] Install frontend dependencies (TanStack Router, TanStack Query, Shadcn UI)

## Foundation (batch -- do all before any feature)

Write migration SQL files in `supabase/migrations/` with timestamped filenames. Run `supabase db reset` to verify.
After each migration, run `supabase_get_advisors` (security) and `supabase_list_tables` (verbose) to verify.

- [x] Enable pg_net extension
- [x] Enable pg_cron extension
- [x] `update_updated_at` trigger function
- [x] RLS helper functions (`get_current_user_role`, `get_current_user_group_id`, `is_active_user`)
- [x] `profiles` table + RLS policies
- [x] `groups` table + RLS policies
- [x] `member_requests` table + RLS policies
- [x] Apply `update_updated_at` trigger to foundation tables
- [x] Seed data: Root Admin bootstrap in `seed.sql`
- [x] Generate TypeScript types via `supabase_generate_typescript_types`

## Feature: Auth

### Backend
- [x] `invite-user` Edge Function -- invite new user via Supabase Auth admin API
- [x] `bootstrap-root-admin` Edge Function -- create first Root Admin from env vars
- [x] `update-user-role` Edge Function -- sync role/group/active to JWT metadata
- [x] `manage-invite` Edge Function -- resend invite, change email, delete invite (root admin)
- [x] `invite_status` column on profiles (invite_sent/completed lifecycle)
- [x] `last_invite_sent_at` column on profiles (1-hour resend rate limit)
- [x] `cancelled` status on member_requests + FK SET NULL changes

### Frontend
- [x] Supabase client initialization (`src/services/supabase.ts`)
- [x] Auth context / `useAuth` hook
- [x] `useCurrentUser` hook (role, group, active from JWT metadata)
- [x] Login page (`/login`)
- [x] Forgot password page (`/forgot-password`)
- [x] Reset password page (`/reset-password`)
- [x] Invite acceptance page (`/invite/accept`)
- [x] Protected route wrapper (auth + active + role check)
- [x] Sidebar layout component
- [x] Role-filtered navigation links
- [x] User info + sign out in sidebar
- [x] Page header with breadcrumbs
- [x] Invite lifecycle UI (Invite Sent badge, resend, change email, delete in members tab)
- [x] Cancelled request badge in requests tab

## Feature: Groups

### Backend
(tables already created in Foundation)

### Frontend
- [x] Group list page (`/groups`)
- [x] Group detail page (`/groups/:groupId`)
- [x] Member request side sheet (create request, approve/reject)

## Feature: Form Templates

### Backend
- [x] `form_templates` table + RLS policies
- [x] `template_versions` table + RLS policies
- [x] `template_sections` table + RLS policies
- [x] `template_fields` table + RLS policies
- [x] `template_group_access` table + RLS policies
- [x] Apply `update_updated_at` trigger to form template tables

### Frontend
- [x] Template list page (`/forms`)
- [x] Template detail page (`/forms/:templateId`) with instance table
- [x] Form builder page (`/forms/new` and `/forms/:templateId/edit`)
- [x] Field type picker (text, choice, checkbox, date, rating, range, file, section)
- [x] Section management in builder
- [x] Section delete with confirmation dialog
- [x] Header action buttons (Cancel, Publish) in breadcrumb bar
- [x] Navigation blocker on new form page (useBlocker)
- [x] Auto-generate abbreviation from form title
- [x] Remove abbreviation system (use random 8-char readable_id instead)
- [x] Save draft button (save without publishing)
- [x] Auto-save with debounced persistence (replaces manual Save Draft)
- [x] Draft version support for published template editing
- [x] Save status indicator in header (Draft/Published · vN · Saving.../Saved)
- [x] Discard Draft button (delete draft template or draft version)
- [x] "Editing" badge in templates list for published templates with draft versions
- [x] Field-type-specific configuration (range selector, rating stars preview, etc.)
- [x] Field limits via "More" button (min/max chars, date range, file types, etc.)
- [x] Editable field subtitle/description for all field types
- [x] Draft badge and routing in templates list
- [x] Version history side sheet (restore only; view deferred to form instances)
- [x] Sharing settings side sheet (all vs restricted groups)
- [x] More dropdown (Versions, Share, Delete) with ellipsis icon button
- [x] Hard delete form template (no instances)
- [x] Archived tab in forms list page
- [ ] Archive/hard-delete flow for templates WITH instances (see notes below)
- [ ] Form builder preview button in header (depends on form instances)

### Deferred: Delete form with instances

When deleting a form template that has existing instances, present two options:

1. **Archive (recommended)**: Set `is_active = false` on the template. The template and
   its instances remain in the DB but are hidden from the active list. Shown under the
   "Archived" tab in the forms list.

2. **Hard delete**: Delete all form instances, field values, the form template, and all
   versions (CASCADE). Keep already-existing reports but cancel any scheduled reports
   that depend on this template. Requires a confirmation dialog explaining the impact.

## Feature: Form Instances

### Backend
- [x] `form_instances` table + RLS policies
- [x] `field_values` table + RLS policies
- [x] `instance_schedules` table + RLS policies
- [x] `schedule_group_targets` table + RLS policies
- [x] Apply `update_updated_at` trigger to form instance tables
- [x] `trigger_on_form_instance_created` (pg_net -> Edge Function)
- [ ] `trigger_on_form_instance_submitted` (AFTER UPDATE, auto-report)
- [x] `on-instance-created` Edge Function -- generate short URLs (Shlink)
- [x] `create_scheduled_instances` pg_cron job

### Frontend
- [ ] Form instance page (`/forms/:readableId?mode=view|edit`)
- [ ] Section-as-page navigation
- [ ] Field assignment side sheet
- [ ] Field change log display
- [ ] Required field validation on submit
- [ ] Schedule management (create/edit schedule, add groups)

## Feature: Reports

### Backend
- [ ] `report_templates` table + RLS policies
- [ ] `report_template_versions` table + RLS policies
- [ ] `report_template_sections` table + RLS policies
- [ ] `report_template_fields` table + RLS policies
- [ ] `report_instances` table + RLS policies
- [ ] Apply `update_updated_at` trigger to report tables
- [ ] `trigger_on_report_instance_created` (pg_net -> Edge Function)
- [ ] `on-report-instance-created` Edge Function -- generate short URL (Shlink)
- [ ] `generate-report` Edge Function -- compute report data + create instance
- [ ] `export-report` Edge Function -- generate PDF/Word, cache in Storage

### Frontend
- [ ] Report template list page (`/reports/templates`)
- [ ] Report template detail page (`/reports/templates/:id`)
- [ ] Report template builder (`/reports/templates/new` and `edit`)
- [ ] Formula editor (aggregates + arithmetic)
- [ ] Dynamic variable field picker
- [ ] Table column configuration
- [ ] Static text editor
- [ ] Version history side sheet
- [ ] Report instance list page (`/reports`)
- [ ] Report instance viewer (`/reports/:readableId`)
- [ ] Manual report creation (select form instances, generate)
- [ ] Export buttons (PDF / Word) with download

## Feature: Notifications

### Backend
- [ ] `send-notification-email` Edge Function -- custom emails via Resend SDK

## Feature: Dashboard

- [ ] Adaptive dashboard (`/`)
- [ ] Root Admin widgets (pending requests, recent submissions, schedules, stats)
- [ ] Admin widgets (group members, draft instances, submissions)
- [ ] Editor widgets (assigned fields, draft instances)
- [ ] Viewer widgets (recent submissions, reports)

## External Services

- [ ] Shlink setup (self-hosted or cloud) + API key
- [ ] Resend SMTP configuration in Supabase Auth settings
- [ ] Resend SDK API key for Edge Functions
- [x] Supabase Storage buckets (form-uploads, report-exports)
