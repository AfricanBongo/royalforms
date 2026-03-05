# TODO

Remaining implementation work derived from the system design docs in `docs/system-design/`.

An agent starting a new session should read this file to understand what's left to build. Cross off items when done. Add new items if scope changes.

---

## Infrastructure Setup

- [ ] Initialize Supabase CLI (`supabase init`)
- [ ] Configure `supabase/config.toml` for local dev
- [ ] Create `.env.local` with local Supabase credentials (gitignored)
- [ ] Install frontend dependencies (TanStack Router, TanStack Query, Shadcn UI)

## Database Migrations (via Supabase MCP)

All migrations use `supabase_apply_migration`. Never write migration files manually.
After each migration, run `supabase_get_advisors` (security) and `supabase_list_tables` (verbose) to verify.

- [ ] Enable pg_net extension
- [ ] Enable pg_cron extension
- [ ] RLS helper functions (`get_current_user_role`, `get_current_user_group_id`, `is_active_user`)
- [ ] `update_updated_at` trigger function
- [ ] `profiles` table + RLS policies
- [ ] `groups` table + RLS policies
- [ ] `member_requests` table + RLS policies
- [ ] `form_templates` table + RLS policies
- [ ] `template_versions` table + RLS policies
- [ ] `template_sections` table + RLS policies
- [ ] `template_fields` table + RLS policies
- [ ] `template_group_access` table + RLS policies
- [ ] `form_instances` table + RLS policies
- [ ] `field_values` table + RLS policies
- [ ] `instance_schedules` table + RLS policies
- [ ] `schedule_group_targets` table + RLS policies
- [ ] `report_templates` table + RLS policies
- [ ] `report_template_versions` table + RLS policies
- [ ] `report_template_sections` table + RLS policies
- [ ] `report_template_fields` table + RLS policies
- [ ] `report_instances` table + RLS policies
- [ ] Apply `update_updated_at` trigger to all tables
- [ ] `trigger_on_form_instance_created` (pg_net -> Edge Function)
- [ ] `trigger_on_report_instance_created` (pg_net -> Edge Function)
- [ ] `trigger_on_form_instance_submitted` (AFTER UPDATE, auto-report)
- [ ] Create `create_scheduled_instances` pg_cron job
- [ ] Seed data: Root Admin bootstrap in `seed.sql`
- [ ] Generate TypeScript types via `supabase_generate_typescript_types`

## Edge Functions

- [ ] `invite-user` -- invite new user via Supabase Auth admin API
- [ ] `bootstrap-root-admin` -- create first Root Admin from env vars
- [ ] `update-user-role` -- sync role/group/active to JWT metadata
- [ ] `send-notification-email` -- custom emails via Resend SDK
- [ ] `on-instance-created` -- generate short URLs for form instances (Shlink)
- [ ] `on-report-instance-created` -- generate short URL for report instances (Shlink)
- [ ] `generate-report` -- compute report data + create report instance
- [ ] `export-report` -- generate PDF/Word, cache in Supabase Storage

## Frontend: Auth

- [ ] Supabase client initialization (`src/services/supabase.ts`)
- [ ] Auth context / `useAuth` hook
- [ ] `useCurrentUser` hook (role, group, active from JWT metadata)
- [ ] Login page (`/login`)
- [ ] Forgot password page (`/forgot-password`)
- [ ] Reset password page (`/reset-password`)
- [ ] Invite acceptance page (`/invite/accept`)
- [ ] Protected route wrapper (auth + active + role check)

## Frontend: Layout & Navigation

- [ ] Sidebar layout component
- [ ] Role-filtered navigation links
- [ ] User info + sign out in sidebar
- [ ] Page header with breadcrumbs

## Frontend: Dashboard

- [ ] Adaptive dashboard (`/`)
- [ ] Root Admin widgets (pending requests, recent submissions, schedules, stats)
- [ ] Admin widgets (group members, draft instances, submissions)
- [ ] Editor widgets (assigned fields, draft instances)
- [ ] Viewer widgets (recent submissions, reports)

## Frontend: Groups

- [ ] Group list page (`/groups`)
- [ ] Group detail page (`/groups/:groupId`)
- [ ] Member request side sheet (create request, approve/reject)

## Frontend: Form Templates

- [ ] Template list page (`/forms`)
- [ ] Template detail page (`/forms/:templateId`) with instance table
- [ ] Form builder page (`/forms/new` and `/forms/:templateId/edit`)
- [ ] Field type picker (text, choice, checkbox, date, rating, range, file, section)
- [ ] Section management in builder
- [ ] Version history side sheet (view, restore)
- [ ] Sharing settings side sheet (all vs restricted groups)
- [ ] Schedule management (create/edit schedule, add groups)

## Frontend: Form Instances

- [ ] Form instance fill page (`/forms/:readableId/fill`)
- [ ] Form instance view page (`/forms/:readableId/view`)
- [ ] Section-as-page navigation
- [ ] Field assignment side sheet
- [ ] Field change log display
- [ ] Required field validation on submit

## Frontend: Report Templates

- [ ] Report template list page (`/reports/templates`)
- [ ] Report template detail page (`/reports/templates/:id`)
- [ ] Report template builder (`/reports/templates/new` and `edit`)
- [ ] Formula editor (aggregates + arithmetic)
- [ ] Dynamic variable field picker
- [ ] Table column configuration
- [ ] Static text editor
- [ ] Version history side sheet

## Frontend: Report Instances

- [ ] Report instance list page (`/reports`)
- [ ] Report instance viewer (`/reports/:readableId`)
- [ ] Manual report creation (select form instances, generate)
- [ ] Export buttons (PDF / Word) with download

## External Services

- [ ] Shlink setup (self-hosted or cloud) + API key
- [ ] Resend SMTP configuration in Supabase Auth settings
- [ ] Resend SDK API key for Edge Functions
- [ ] Supabase Storage buckets (form-uploads, report-exports)
