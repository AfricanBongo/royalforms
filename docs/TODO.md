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
- [ ] `invite-user` Edge Function -- invite new user via Supabase Auth admin API
- [ ] `bootstrap-root-admin` Edge Function -- create first Root Admin from env vars
- [ ] `update-user-role` Edge Function -- sync role/group/active to JWT metadata

### Frontend
- [ ] Supabase client initialization (`src/services/supabase.ts`)
- [ ] Auth context / `useAuth` hook
- [ ] `useCurrentUser` hook (role, group, active from JWT metadata)
- [ ] Login page (`/login`)
- [ ] Forgot password page (`/forgot-password`)
- [ ] Reset password page (`/reset-password`)
- [ ] Invite acceptance page (`/invite/accept`)
- [ ] Protected route wrapper (auth + active + role check)
- [ ] Sidebar layout component
- [ ] Role-filtered navigation links
- [ ] User info + sign out in sidebar
- [ ] Page header with breadcrumbs

## Feature: Groups

### Backend
(tables already created in Foundation)

### Frontend
- [ ] Group list page (`/groups`)
- [ ] Group detail page (`/groups/:groupId`)
- [ ] Member request side sheet (create request, approve/reject)

## Feature: Form Templates

### Backend
- [ ] `form_templates` table + RLS policies
- [ ] `template_versions` table + RLS policies
- [ ] `template_sections` table + RLS policies
- [ ] `template_fields` table + RLS policies
- [ ] `template_group_access` table + RLS policies
- [ ] Apply `update_updated_at` trigger to form template tables

### Frontend
- [ ] Template list page (`/forms`)
- [ ] Template detail page (`/forms/:templateId`) with instance table
- [ ] Form builder page (`/forms/new` and `/forms/:templateId/edit`)
- [ ] Field type picker (text, choice, checkbox, date, rating, range, file, section)
- [ ] Section management in builder
- [ ] Version history side sheet (view, restore)
- [ ] Sharing settings side sheet (all vs restricted groups)

## Feature: Form Instances

### Backend
- [ ] `form_instances` table + RLS policies
- [ ] `field_values` table + RLS policies
- [ ] `instance_schedules` table + RLS policies
- [ ] `schedule_group_targets` table + RLS policies
- [ ] Apply `update_updated_at` trigger to form instance tables
- [ ] `trigger_on_form_instance_created` (pg_net -> Edge Function)
- [ ] `trigger_on_form_instance_submitted` (AFTER UPDATE, auto-report)
- [ ] `on-instance-created` Edge Function -- generate short URLs (Shlink)
- [ ] `create_scheduled_instances` pg_cron job

### Frontend
- [ ] Form instance fill page (`/forms/:readableId/fill`)
- [ ] Form instance view page (`/forms/:readableId/view`)
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
