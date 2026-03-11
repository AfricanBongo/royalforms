# Reports Backend — Design Document

**Date:** 2026-03-11
**Scope:** Backend only (database schema, RLS, triggers, Edge Functions, service layer, TypeScript types)
**Frontend:** Deferred to guided session (no Figma designs; follow existing design system)
**Base spec:** `docs/system-design/reporting.md`

---

## Approach

Layered bottom-up implementation:

1. Migrations (tables + RLS + indexes + storage bucket)
2. Triggers (auto-report, short URLs, version management)
3. Edge Functions (generate-report, on-report-instance-ready, export-report)
4. Service layer (client SDK operations for frontend)
5. TypeScript types (regenerate database.ts)

---

## 1. Database Schema

### Additions to the spec

The reporting.md spec is implemented as-is with two additions:

- **`report_instances.status`**: `TEXT NOT NULL DEFAULT 'generating' CHECK (status IN ('generating', 'ready', 'failed'))` — allows the frontend to show generation progress
- **`report_instances.error_message`**: `TEXT` nullable — populated on generation failure

No `updated_at` on `report_instances` — status transitions happen once (generating -> ready/failed).

### Tables

**`report_templates`**
- `id` UUID PK
- `form_template_id` UUID NOT NULL UNIQUE FK -> form_templates.id
- `name` TEXT NOT NULL
- `abbreviation` TEXT NOT NULL UNIQUE
- `description` TEXT nullable
- `created_by` UUID NOT NULL FK -> profiles.id
- `is_active` BOOLEAN NOT NULL DEFAULT true
- `auto_generate` BOOLEAN NOT NULL DEFAULT false
- `instance_counter` INTEGER NOT NULL DEFAULT 0
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()
- `updated_at` TIMESTAMPTZ NOT NULL DEFAULT now()
- Trigger: `update_updated_at`

**`report_template_versions`**
- `id` UUID PK
- `report_template_id` UUID NOT NULL FK -> report_templates.id
- `version_number` INTEGER NOT NULL
- `is_latest` BOOLEAN NOT NULL DEFAULT true
- `restored_from` UUID nullable FK -> report_template_versions.id (self-ref)
- `created_by` UUID NOT NULL FK -> profiles.id
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()
- UNIQUE (`report_template_id`, `version_number`)
- Trigger: BEFORE INSERT set previous versions `is_latest = false`

**`report_template_sections`**
- `id` UUID PK
- `report_template_version_id` UUID NOT NULL FK -> report_template_versions.id
- `title` TEXT NOT NULL
- `description` TEXT nullable
- `sort_order` INTEGER NOT NULL
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()

**`report_template_fields`**
- `id` UUID PK
- `report_template_section_id` UUID NOT NULL FK -> report_template_sections.id
- `label` TEXT NOT NULL
- `field_type` TEXT NOT NULL CHECK (field_type IN ('formula', 'dynamic_variable', 'table', 'static_text'))
- `sort_order` INTEGER NOT NULL
- `config` JSONB NOT NULL
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()

**`report_instances`**
- `id` UUID PK
- `readable_id` TEXT NOT NULL UNIQUE
- `report_template_version_id` UUID NOT NULL FK -> report_template_versions.id
- `status` TEXT NOT NULL DEFAULT 'generating' CHECK (status IN ('generating', 'ready', 'failed'))
- `error_message` TEXT nullable
- `short_url` TEXT nullable
- `created_by` UUID NOT NULL FK -> profiles.id
- `data_snapshot` JSONB nullable (null while generating, populated on ready)
- `form_instances_included` JSONB NOT NULL
- `export_pdf_path` TEXT nullable
- `export_docx_path` TEXT nullable
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()

### RLS Policies

All policies follow the existing pattern: `TO authenticated, service_role`, `is_active_user()` guard.

| Table | SELECT | INSERT | UPDATE |
|---|---|---|---|
| report_templates | Root Admin only | Root Admin only | Root Admin only |
| report_template_versions | Root Admin only | Root Admin only | Root Admin only (is_latest) |
| report_template_sections | Root Admin only | Root Admin only | — |
| report_template_fields | Root Admin only | Root Admin only | — |
| report_instances | Any authenticated active user | — (service role) | — (service role) |

### Indexes

- `report_templates(form_template_id)` — unique index (1:1 lookup)
- `report_template_versions(report_template_id, is_latest)` — latest version lookup
- `report_instances(report_template_version_id)` — instances by template version
- `report_instances(status)` — filter by generation status

### Storage

- Bucket: `report-exports`
- Path pattern: `{instance_id}/report.{pdf|docx}`
- Access: Any authenticated user can download (public read for authenticated)

---

## 2. Triggers

### `set_report_version_not_latest` (BEFORE INSERT on `report_template_versions`)

Sets `is_latest = false` for all existing versions of the same report template when a new version is inserted.

### `trigger_on_form_instance_submitted` (AFTER UPDATE on `form_instances`)

Fires when `NEW.status = 'submitted' AND OLD.status != 'submitted'`:
1. Join through `template_versions` -> `form_templates` -> `report_templates`
2. Check `report_templates.auto_generate = true`
3. For one-time instances: call `generate-report` Edge Function via pg_net
4. For scheduled instances: check if all sibling instances in the same batch are submitted, then call with all batch IDs

### `trigger_on_report_instance_ready` (AFTER UPDATE on `report_instances`)

Fires when `NEW.status = 'ready' AND OLD.status = 'generating'`:
- Calls `on-report-instance-ready` Edge Function via pg_net
- Edge Function generates Shlink short URL and updates `short_url`

---

## 3. Edge Functions

### `generate-report`

**Called by:** Root Admin (direct HTTP) or pg_net (auto-generation trigger)
**CORS:** Yes (direct HTTP calls from SPA)
**Auth:** Root Admin check for direct HTTP; service role for pg_net

**Input:**
```json
{
  "report_template_id": "uuid",
  "form_instance_ids": ["uuid", ...],
  "auto_generated": false
}
```

**Flow:**
1. Validate caller (Root Admin for HTTP, shared secret for pg_net)
2. Fetch latest report template version with sections + fields
3. INSERT report_instances row with `status = 'generating'`
4. Increment `report_templates.instance_counter`
5. Query `field_values` across specified form instances (service role)
6. Resolve each field type:
   - **formula**: Parse expression, apply aggregates (SUM, AVERAGE, MIN, MAX, COUNT, MEDIAN), evaluate arithmetic
   - **dynamic_variable**: Pull single value from specified form field
   - **table**: Collect column values per form instance
   - **static_text**: Pass through
7. Build `data_snapshot` JSONB
8. UPDATE report instance: `status = 'ready'`, `data_snapshot = computed`
9. On error: UPDATE `status = 'failed'`, `error_message = details`

### `on-report-instance-ready`

**Called by:** pg_net trigger (AFTER UPDATE when status='ready')
**CORS:** No (not called from browser)
**Auth:** None (trigger-based, fire-and-forget)

**Flow:**
1. Parse payload for report instance ID and readable_id
2. Query report template for abbreviation
3. Generate Shlink short URL
4. Update `report_instances.short_url`
5. Always return 200

### `export-report`

**Called by:** Any authenticated user (direct HTTP from SPA)
**CORS:** Yes
**Auth:** Any authenticated active user

**Input:**
```json
{
  "report_instance_id": "uuid",
  "format": "pdf" | "docx"
}
```

**Flow:**
1. Validate auth (any active user)
2. Fetch report instance
3. Check if export already exists (cached path)
4. If cached: generate signed download URL, return
5. If not: read `data_snapshot`, generate document
   - PDF via `pdf-lib`
   - DOCX via `docx` library
6. Upload to `report-exports/{instance_id}/report.{format}`
7. Update instance with storage path
8. Return signed download URL

---

## 4. Service Layer

`src/services/reports.ts` — follows `form-templates.ts` patterns.

### Query Functions (Client SDK)

- `fetchReportTemplates()` — list all with stats
- `fetchReportTemplateById(id)` — full detail with latest version + sections + fields
- `fetchReportTemplateVersions(templateId)` — version history
- `fetchReportInstances(templateId?)` — list instances
- `fetchReportInstanceById(id)` — full instance with data_snapshot
- `fetchReportInstanceByReadableId(readableId)` — for short URL resolution

### Mutation Functions (Client SDK)

- `createReportTemplate(data)` — multi-step insert (template + version + sections + fields)
- `updateReportTemplate(templateId, data)` — version-on-edit
- `restoreReportTemplateVersion(templateId, versionId)` — copy old version as new
- `toggleAutoGenerate(templateId, value)` — toggle flag
- `deactivateReportTemplate(templateId)` — soft-delete

### Edge Function Callers

- `generateReport(templateId, formInstanceIds)` — calls `generate-report` via `supabase.functions.invoke()`
- `exportReport(instanceId, format)` — calls `export-report`, returns download URL

---

## 5. No Conflict with Form Instances Agent

The reports backend touches completely separate files:
- Own tables (`report_*`)
- Own Edge Functions (`generate-report`, `on-report-instance-ready`, `export-report`)
- Own service file (`src/services/reports.ts`)
- Own migrations (new files with later timestamps)

The only shared touchpoint is `trigger_on_form_instance_submitted` on the `form_instances` table, which we own since it's purely for auto-report generation. The other agent's plan does not include this trigger.
