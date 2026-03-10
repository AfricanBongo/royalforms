# Form System

[Back to System Design Index](./index.md)

---

## 1. Overview

Root Admin creates form templates using a visual form builder. Templates contain sections (each rendered as a page), and sections contain fields. Templates are versioned on edit, shared to all groups by default (restrictable), and support scheduled or one-time instance creation. Admins and Editors fill fields. Only Admins can submit instances. All field changes are audited.

---

## 2. Core Concepts

| Concept | Description |
|---|---|
| **Form Template** | Structure definition: title, description, sections, fields, field types, validation. Created by Root Admin only. Versioned on edit. |
| **Template Version** | Snapshot of template at a point in time. Existing instances stay pinned to their version. New instances use the latest. Restoring a version creates a new version with the old content (full history preserved). |
| **Form Section** | A grouping of fields within a template version. Each section is its own page when viewed/filled. Has a title and description. New templates start with one default section. |
| **Form Instance** | A runtime copy of a template version, owned by a group. Has a human-readable ID: `{abbreviation}-{sequential-number}` (e.g., `epr-001`). |
| **Field Assignment** | Optional lock of a field on an instance to a specific Editor. Unassigned fields are open to all Admins/Editors on the group. Stored directly on the `field_values` row. |
| **Field Change Log** | Append-only audit trail stored as a JSONB array on the `field_values` row: who, when, old value, new value. Visible to all group members. |
| **Instance Schedule** | Automated recurring instance creation for shared groups. One schedule per template. Managed by Root Admin. Executed by pg_cron. |

---

## 3. Template Management

- Only Root Admin can create, edit, delete, and restore templates.
- Templates have a **name**, **description**, and an **abbreviation** (short form of the name, used in instance IDs and short URLs, e.g., "Employee Performance Review" -> `epr`).
- New templates start with one default section (titled "Section 1").
- Editing a published template creates a new version. Existing instances stay on their version.
- **Version restore:** Restoring a previous version creates a new version with the old version's content. Full history is preserved -- nothing is overwritten.
- **Version viewing:** Root Admin can view any previous version of a template.
- Deleting a template is a **soft-delete** (template marked inactive). All existing instances are **archived** (read-only, moved to an archive view).

---

## 4. Form Sections

- A section has a **title**, **description**, and **sort_order**.
- Each section renders as its own page when filling or viewing a form instance.
- Fields belong to a section.
- Sections are defined per template version (versioned with the template).
- When a new template is created, it has one default section.

---

## 5. Field Types

| Field Type | Storage | Notes |
|---|---|---|
| `text` | TEXT | Single-line text input |
| `textarea` | TEXT | Multi-line text input |
| `number` | NUMERIC | Numeric input with optional min/max |
| `date` | DATE | Date picker |
| `select` | TEXT | Single-select dropdown (UI label: "Choice") |
| `multi_select` | JSONB | Multi-select, stored as array (UI label: "Choice" with multi toggle) |
| `checkbox` | BOOLEAN | Single checkbox |
| `rating` | INTEGER | Star/number rating. Configurable max (e.g., 5 or 10) via `validation_rules` |
| `range` | NUMERIC | Numeric range slider. Min/max/step configured via `validation_rules` |
| `file` | TEXT (storage path) | File upload via Supabase Storage. Compressed before upload (see [Storage Policy](./index.md#storage-policy)). |

---

## 6. Form Instance Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Draft: Instance created
    Draft --> Submitted: Admin submits
    Submitted --> [*]
```

- **Draft**: Admins and Editors fill fields. Changes are saved and tracked in the change log.
- **Submitted**: Instance is locked. No further edits. Visible to Viewers. Only an **Admin** of the owning group can submit.

---

## 7. Human-Readable Instance IDs & Short URLs

### Instance ID Format

Each form instance gets a human-readable ID combining the template abbreviation and a sequential number:

- Format: `{abbreviation}-{NNN}` (e.g., `epr-001`, `sc-042`)
- The abbreviation is derived from the template name (e.g., "Employee Performance Review" -> `epr`, "Safety Checklist" -> `sc`).
- Sequential counter is per-template, stored on `form_templates.instance_counter`.

### Short URLs

Short URLs are generated via **Shlink JS SDK** called from an **Edge Function** (keeps API key server-side):

- View: `https://short.domain/f/epr-001-view` -> `https://app.domain/forms/epr-001?mode=view`
- Edit: `https://short.domain/f/epr-001-edit` -> `https://app.domain/forms/epr-001?mode=edit`

Shlink slugs use the `f/` prefix to namespace form short URLs (reports will use `r/`). The `-view`/`-edit` suffix is flat (no nested paths). The app route uses `?mode=view|edit` query param -- a single route component handles both modes. Short URLs are stored on the `form_instances` row.

---

## 8. Field Assignment

- All fields are **open by default** -- any Admin or Editor on the owning group can fill them.
- An Admin can optionally **assign** a field to a specific Editor, locking that field so only the assigned Editor can edit it.
- Assignment is stored directly on the `field_values` row (`assigned_to` and `assigned_by` columns). When both are null, the field is open.
- Admins can reassign or unassign fields at any time while the instance is in draft.

### Field Values: Lazy Creation

- `field_values` rows are **not pre-created** when a form instance is created. They are created on first interaction:
  - **On first edit**: When a user fills a field for the first time, the `field_values` row is inserted with the value, `updated_by` set to the editing user, and the first `change_log` entry.
  - **On assignment**: When an Admin assigns a field before anyone edits it, the `field_values` row is created with `value = null`, `updated_by = assigned_by` (the Admin), `assigned_to` set, and an empty `change_log`.
- When rendering a form, if no `field_values` row exists for a template field, it is treated as **empty and open to all** Admins/Editors on the group.

---

## 9. Audit Trail (Field Change Log)

Every field value change is logged in a JSONB array (`change_log`) on the `field_values` row. Each entry:

```json
{
  "old_value": "previous value or null",
  "new_value": "new value",
  "changed_by": "user-uuid",
  "changed_at": "2026-03-05T10:30:00Z"
}
```

- The array is **append-only** in practice. New entries are added to the end.
- Visible to all group members on the form instance.
- First entry has `old_value: null`.
- Eliminates the need for a separate `field_change_log` table and avoids joins when viewing a field's history.

---

## 10. Instance Creation & Scheduling

### One-Time Instance

- Root Admin creates a one-time instance for a specific group (or all shared groups).
- Can be done during template creation or later from the template management screen.
- Instance is created immediately.
- Root Admin can create additional one-time instances at any time, even if a schedule exists.

### Scheduled Instances

- Root Admin sets up a schedule for a template: start date, repeat interval, and which groups receive instances.
- **One schedule per template.** Cannot create a second schedule, but can edit the existing one.
- Supported intervals: `daily`, `weekly` (with specific days of week), `bi_weekly`, `monthly`.
- "Repeat every N" multiplier (e.g., every 2 weeks, every 3 months).
- A **pg_cron** job runs periodically, checks `instance_schedules.next_run_at`, and creates instances automatically for all target groups.
- Groups can be added to an existing schedule later.
- Root Admin can edit schedule settings (interval, groups, dates) but cannot create a second schedule for the same template.
- Root Admin can still create one-time instances for a template that has a schedule.

### Database Trigger: `on_form_instance_created`

A PostgreSQL trigger on the `form_instances` table fires **after every INSERT**. This trigger invokes an Edge Function (`on-instance-created`) via `pg_net` (Supabase's HTTP extension) to handle post-creation tasks:

1. Generate short URLs via Shlink JS SDK (view + edit).
2. Store the short URLs back on the `form_instances` row.
3. Any future post-creation logic (e.g., notifications) is added here.

This single trigger handles all instance creation sources uniformly -- one-time instances created via Client SDK and scheduled instances created by pg_cron both go through the same path.

```mermaid
flowchart TD
    subgraph Creation Sources
        OT[One-time instance<br/>via Client SDK]
        SC[Scheduled instance<br/>via pg_cron]
    end

    OT --> INS[INSERT into form_instances]
    SC --> INS
    INS --> TRG[Database trigger fires<br/>AFTER INSERT]
    TRG --> EF[Edge Function: on-instance-created<br/>called via pg_net]
    EF --> SH[Generate short URLs via Shlink SDK]
    SH --> UPD[Update form_instances row<br/>with short_url_view + short_url_edit]
    UPD --> DONE([Done])
```

### Scheduling Flow

```mermaid
flowchart TD
    A([Root Admin]) --> B{Schedule or one-time?}
    B -->|One-time| C[Select group or all shared groups]
    C --> D[Insert form_instances via Client SDK]
    D --> E[DB trigger handles short URL generation]
    E --> F([Done])
    B -->|Schedule| G{Schedule already exists?}
    G -->|Yes| H[Edit existing schedule via Client SDK]
    G -->|No| I[Create instance_schedule via Client SDK]
    H --> F
    I --> J[Add target groups to schedule_group_targets]
    J --> F
```

### pg_cron Execution Flow

```mermaid
flowchart TD
    A([pg_cron fires]) --> B[Query instance_schedules<br/>WHERE next_run_at <= now AND is_active = true]
    B --> C{Schedules found?}
    C -->|No| D([Done])
    C -->|Yes| E[For each schedule]
    E --> F[For each group in schedule_group_targets]
    F --> G[Insert form_instance<br/>with latest template_version]
    G --> H[Increment form_templates.instance_counter]
    H --> I[DB trigger fires for each new instance<br/>Edge Function generates short URLs]
    I --> J[Update schedule: last_run_at, compute next_run_at]
    J --> D
```

---

## 11. Template Sharing & Access Control

- Templates are shared to **all groups by default** (`sharing_mode = 'all'`).
- Root Admin can restrict to specific groups (`sharing_mode = 'restricted'` + `template_group_access` rows).
- If access is revoked from a group, their existing instances are **archived** (read-only) but they cannot create new instances.

---

## 12. Database Schema

### Entity Relationship Diagram

```mermaid
erDiagram
    FORM_TEMPLATES {
        uuid id PK
        text name "not null"
        text abbreviation "not null, unique"
        text description "nullable"
        uuid created_by "references profiles.id"
        boolean is_active "default true"
        text sharing_mode "all | restricted"
        integer instance_counter "default 0"
        timestamptz created_at
        timestamptz updated_at
    }

    TEMPLATE_VERSIONS {
        uuid id PK
        uuid template_id "references form_templates.id"
        integer version_number "auto-increment per template"
        boolean is_latest "default true"
        uuid restored_from "references template_versions.id, nullable"
        uuid created_by "references profiles.id"
        timestamptz created_at
    }

    TEMPLATE_SECTIONS {
        uuid id PK
        uuid template_version_id "references template_versions.id"
        text title "not null"
        text description "nullable"
        integer sort_order "not null"
        timestamptz created_at
    }

    TEMPLATE_FIELDS {
        uuid id PK
        uuid template_section_id "references template_sections.id"
        text label "not null"
        text field_type "text | textarea | number | date | select | multi_select | checkbox | rating | range | file"
        integer sort_order "not null"
        boolean is_required "default false"
        jsonb options "nullable, for select/multi_select"
        jsonb validation_rules "nullable"
        timestamptz created_at
    }

    TEMPLATE_GROUP_ACCESS {
        uuid id PK
        uuid template_id "references form_templates.id"
        uuid group_id "references groups.id"
        timestamptz created_at
    }

    FORM_INSTANCES {
        uuid id PK
        text readable_id "unique, e.g. epr-001"
        uuid template_version_id "references template_versions.id"
        uuid group_id "references groups.id"
        text status "draft | submitted"
        boolean is_archived "default false"
        text short_url_view "nullable"
        text short_url_edit "nullable"
        uuid created_by "references profiles.id"
        uuid submitted_by "references profiles.id, nullable"
        timestamptz submitted_at "nullable"
        timestamptz created_at
        timestamptz updated_at
    }

    FIELD_VALUES {
        uuid id PK
        uuid form_instance_id "references form_instances.id"
        uuid template_field_id "references template_fields.id"
        text value "nullable"
        uuid updated_by "references profiles.id"
        uuid assigned_to "references profiles.id, nullable"
        uuid assigned_by "references profiles.id, nullable"
        jsonb change_log "append-only audit trail"
        timestamptz updated_at
    }

    INSTANCE_SCHEDULES {
        uuid id PK
        uuid template_id "unique, references form_templates.id"
        date start_date "not null"
        text repeat_interval "daily | weekly | bi_weekly | monthly"
        integer repeat_every "default 1"
        jsonb days_of_week "nullable, for weekly"
        boolean is_active "default true"
        timestamptz last_run_at "nullable"
        timestamptz next_run_at "not null"
        uuid created_by "references profiles.id"
        timestamptz created_at
        timestamptz updated_at
    }

    SCHEDULE_GROUP_TARGETS {
        uuid id PK
        uuid schedule_id "references instance_schedules.id"
        uuid group_id "references groups.id"
        timestamptz created_at
    }

    FORM_TEMPLATES ||--o{ TEMPLATE_VERSIONS : "has versions"
    TEMPLATE_VERSIONS ||--o{ TEMPLATE_SECTIONS : "has sections"
    TEMPLATE_SECTIONS ||--o{ TEMPLATE_FIELDS : "has fields"
    FORM_TEMPLATES ||--o{ TEMPLATE_GROUP_ACCESS : "shared with"
    TEMPLATE_VERSIONS ||--o{ FORM_INSTANCES : "instances of"
    FORM_INSTANCES ||--o{ FIELD_VALUES : "has values"
    TEMPLATE_FIELDS ||--o{ FIELD_VALUES : "value for"
    FORM_TEMPLATES ||--|| INSTANCE_SCHEDULES : "has schedule"
    INSTANCE_SCHEDULES ||--o{ SCHEDULE_GROUP_TARGETS : "targets groups"
```

### Table Details

#### `form_templates`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | |
| `name` | TEXT | NOT NULL | Display name |
| `abbreviation` | TEXT | NOT NULL, UNIQUE | Short form for IDs/URLs (e.g., `epr`) |
| `description` | TEXT | NULLABLE | |
| `created_by` | UUID | NOT NULL, FK -> `profiles.id` | Root Admin |
| `is_active` | BOOLEAN | NOT NULL, DEFAULT true | Soft-delete |
| `sharing_mode` | TEXT | NOT NULL, DEFAULT 'all' | `all` or `restricted` |
| `instance_counter` | INTEGER | NOT NULL, DEFAULT 0 | Sequential counter for instance IDs |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

#### `template_versions`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | |
| `template_id` | UUID | NOT NULL, FK -> `form_templates.id` | |
| `version_number` | INTEGER | NOT NULL | Auto-incrementing per template |
| `is_latest` | BOOLEAN | NOT NULL, DEFAULT true | Only one version per template is latest |
| `restored_from` | UUID | NULLABLE, FK -> `template_versions.id` | If restored from another version |
| `created_by` | UUID | NOT NULL, FK -> `profiles.id` | |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

Unique constraint on (`template_id`, `version_number`).

#### `template_sections`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | |
| `template_version_id` | UUID | NOT NULL, FK -> `template_versions.id` | |
| `title` | TEXT | NOT NULL | Section title |
| `description` | TEXT | NULLABLE | Section description |
| `sort_order` | INTEGER | NOT NULL | Position in the form |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

#### `template_fields`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | |
| `template_section_id` | UUID | NOT NULL, FK -> `template_sections.id` | Which section |
| `label` | TEXT | NOT NULL | Field display label |
| `field_type` | TEXT | NOT NULL, CHECK | `text`, `textarea`, `number`, `date`, `select`, `multi_select`, `checkbox`, `rating`, `range`, `file` |
| `sort_order` | INTEGER | NOT NULL | Position within the section |
| `is_required` | BOOLEAN | NOT NULL, DEFAULT false | |
| `options` | JSONB | NULLABLE | For `select` / `multi_select` |
| `validation_rules` | JSONB | NULLABLE | min, max, pattern, etc. |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

#### `template_group_access`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | |
| `template_id` | UUID | NOT NULL, FK -> `form_templates.id` | |
| `group_id` | UUID | NOT NULL, FK -> `groups.id` | |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

Unique constraint on (`template_id`, `group_id`).

#### `form_instances`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | Internal ID |
| `readable_id` | TEXT | NOT NULL, UNIQUE | e.g., `epr-001` |
| `template_version_id` | UUID | NOT NULL, FK -> `template_versions.id` | Pinned version |
| `group_id` | UUID | NOT NULL, FK -> `groups.id` | Owning group |
| `status` | TEXT | NOT NULL, CHECK, DEFAULT 'draft' | `draft` or `submitted` |
| `is_archived` | BOOLEAN | NOT NULL, DEFAULT false | True if template deleted or access revoked |
| `short_url_view` | TEXT | NULLABLE | Shlink short URL for view |
| `short_url_edit` | TEXT | NULLABLE | Shlink short URL for edit |
| `created_by` | UUID | NOT NULL, FK -> `profiles.id` | |
| `submitted_by` | UUID | NULLABLE, FK -> `profiles.id` | Admin who submitted |
| `submitted_at` | TIMESTAMPTZ | NULLABLE | |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

#### `field_values`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | |
| `form_instance_id` | UUID | NOT NULL, FK -> `form_instances.id` | |
| `template_field_id` | UUID | NOT NULL, FK -> `template_fields.id` | |
| `value` | TEXT | NULLABLE | Current field value |
| `updated_by` | UUID | NOT NULL, FK -> `profiles.id` | Last editor |
| `assigned_to` | UUID | NULLABLE, FK -> `profiles.id` | Assigned Editor (null = open to all) |
| `assigned_by` | UUID | NULLABLE, FK -> `profiles.id` | Admin who assigned (null = unassigned) |
| `change_log` | JSONB | NOT NULL, DEFAULT '[]' | Append-only array of `{old_value, new_value, changed_by, changed_at}` |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

Unique constraint on (`form_instance_id`, `template_field_id`).

#### `instance_schedules`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | |
| `template_id` | UUID | NOT NULL, UNIQUE, FK -> `form_templates.id` | One schedule per template |
| `start_date` | DATE | NOT NULL | When the schedule begins |
| `repeat_interval` | TEXT | NOT NULL, CHECK | `daily`, `weekly`, `bi_weekly`, `monthly` |
| `repeat_every` | INTEGER | NOT NULL, DEFAULT 1 | Multiplier |
| `days_of_week` | JSONB | NULLABLE | For weekly: array of day numbers (0=Sun, 6=Sat) |
| `is_active` | BOOLEAN | NOT NULL, DEFAULT true | |
| `last_run_at` | TIMESTAMPTZ | NULLABLE | |
| `next_run_at` | TIMESTAMPTZ | NOT NULL | Precomputed next execution |
| `created_by` | UUID | NOT NULL, FK -> `profiles.id` | Root Admin |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

#### `schedule_group_targets`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | |
| `schedule_id` | UUID | NOT NULL, FK -> `instance_schedules.id` | |
| `group_id` | UUID | NOT NULL, FK -> `groups.id` | |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

Unique constraint on (`schedule_id`, `group_id`).

---

## 13. Activity Diagrams

### 13.1 Template Creation

```mermaid
flowchart TD
    A([Root Admin]) --> B[Enter template name, description, abbreviation]
    B --> C[Add sections and fields via form builder]
    C --> D[Submit via Supabase Client SDK]
    D --> E{RLS: Is caller Root Admin?}
    E -->|No| F[RLS rejects]
    E -->|Yes| G[Insert form_templates row]
    G --> H[Insert template_versions row - version 1]
    H --> I[Insert template_sections rows]
    I --> J[Insert template_fields rows]
    J --> K{Create instance now?}
    K -->|Yes| L[Create one-time instance flow]
    K -->|No| M{Set up schedule?}
    M -->|Yes| N[Create schedule flow]
    M -->|No| O([Done])
    L --> O
    N --> O
```

### 13.2 Template Edit (New Version)

```mermaid
flowchart TD
    A([Root Admin]) --> B[Edit template via form builder]
    B --> C[Submit via Supabase Client SDK]
    C --> D{RLS: Is caller Root Admin?}
    D -->|No| E[RLS rejects]
    D -->|Yes| F[Set current version is_latest = false]
    F --> G[Insert new template_versions row<br/>version_number incremented, is_latest = true]
    G --> H[Copy and insert updated template_sections]
    H --> I[Copy and insert updated template_fields]
    I --> J([Done - existing instances unchanged])
```

### 13.3 Template Version Restore

```mermaid
flowchart TD
    A([Root Admin]) --> B[Select previous version to restore]
    B --> C[Submit via Supabase Client SDK]
    C --> D{RLS: Is caller Root Admin?}
    D -->|No| E[RLS rejects]
    D -->|Yes| F[Set current version is_latest = false]
    F --> G[Insert new template_versions row<br/>is_latest = true, restored_from = old version ID]
    G --> H[Copy sections and fields from old version]
    H --> I([Done - new version created with old content])
```

### 13.4 Form Instance Filling

```mermaid
flowchart TD
    A([Admin / Editor]) --> B[Open form instance in edit mode]
    B --> C[Navigate to section/page]
    C --> D[Edit field value]
    D --> E{field_values row exists?}
    E -->|No| F{Field assigned via another check?}
    F -->|No - open field| G{Current user is Admin or Editor of group?}
    G -->|No| H[Field is read-only for this user]
    G -->|Yes| I[Allow edit]
    E -->|Yes| J{assigned_to is set?}
    J -->|Yes| K{Current user is assigned Editor?}
    K -->|No| H
    K -->|Yes| I
    J -->|No| G
    I --> L[Save via Supabase Client SDK]
    L --> M{field_values row exists?}
    M -->|No| N[INSERT field_values row<br/>value, updated_by, change_log with first entry]
    M -->|Yes| O[UPDATE field_values<br/>value, updated_by, append to change_log]
    N --> P([Saved])
    O --> P
```

### 13.5 Form Instance Submission

```mermaid
flowchart TD
    A([Admin]) --> B[Review form instance]
    B --> C{All required fields filled?}
    C -->|No| D[Show validation errors]
    C -->|Yes| E[Submit via Supabase Client SDK]
    E --> F{RLS: Is caller Admin of owning group?}
    F -->|No| G[RLS rejects]
    F -->|Yes| H[Set status = submitted]
    H --> I[Set submitted_by and submitted_at]
    I --> J([Instance locked - read-only])
```

### 13.6 Template Deletion

```mermaid
flowchart TD
    A([Root Admin]) --> B[Select template to delete]
    B --> C[Submit via Supabase Client SDK]
    C --> D{RLS: Is caller Root Admin?}
    D -->|No| E[RLS rejects]
    D -->|Yes| F[Set form_templates.is_active = false]
    F --> G[Set all form_instances.is_archived = true]
    G --> H[Deactivate instance_schedule if exists]
    H --> I([Done - template inactive, instances archived read-only])
```

---

## 14. Access Rules Summary

| Action | Who |
|---|---|
| Create/edit/delete/restore template | Root Admin only |
| View template versions | Root Admin only |
| Restrict template to groups | Root Admin only |
| Create one-time instance | Root Admin |
| Create/edit schedule | Root Admin |
| Fill unassigned fields (draft) | Admin or Editor of owning group |
| Fill assigned fields (draft) | Only the assigned Editor |
| Assign/reassign/unassign fields | Admin of owning group |
| Submit form instance | Admin of owning group |
| View submitted form | Admin, Editor, or Viewer of owning group |
| View field change log | Any member of owning group |
