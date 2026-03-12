# Reports Frontend Design

## Overview

Full frontend for the reporting feature: template CRUD (list, detail, builder), instance viewing, export, and realtime generation notifications. No Figma designs -- follows existing form template patterns exactly.

## Routing

All routes under `/_authenticated/`:

| Route | Page | Access |
|---|---|---|
| `/reports` | Report template list | Root Admin |
| `/reports/new` | Report template builder (create) | Root Admin |
| `/reports/$templateId` | Report template detail (instances) | Root Admin |
| `/reports/$templateId/edit` | Report template builder (edit) | Root Admin |
| `/reports/$templateId/instances/$readableId` | Report instance viewer | All authenticated |

Single "Reports" sidebar entry pointing to `/reports`.

## Report Template List Page

Mirrors `/forms` list page.

**Stat cards** (4):
- Total Templates
- Auto-Generate On
- Total Reports Generated
- Failed Reports

**Tabs**: Active / Archived

**Toolbar**: Search + Filter (left), "New Report Template" button (right, Root Admin only)

**Table columns**: Report Name, Linked Form, Version, Auto-Generate (badge), Reports Generated, Updated On, Created On

**Pagination** at bottom. Client-side search and pagination (PAGE_SIZE = 15).

Row click navigates to detail page.

## Report Template Detail Page

Mirrors `/forms/$templateId` detail page.

**Stat cards** (4):
- Version (current version number)
- Reports Generated (ready count)
- Failed (failed count)
- Auto-Generate (On/Off, toggle-able)

**Toolbar**: Search + Filters (left); Edit Template, Generate Report, More menu (right, Root Admin)

**Instance table columns**: Report ID (readable_id), Status (badge with spinner for generating), Short URL (clickable), Created By, Created On, Actions (View, Export dropdown)

**Side sheets**:
- Version History -- same pattern as form template versions (restore with confirmation)
- Generate Report Dialog -- checkbox table of form instances, Generate button

**Delete**: AlertDialog for archive (deactivation).

## Report Template Builder

Same structure as form builder: centered content, max-w-[816px], muted background.

**Header actions**: Save status, Discard Draft, Publish

**Builder content** (top to bottom):
1. Template name (ContentEditable)
2. Linked Form (Select dropdown, required, 1:1)
3. Description (ContentEditable, optional)
4. Auto-generate toggle (Switch)
5. Sections (BuilderSection-style cards):
   - Section title + description (ContentEditable)
   - Fields within section
   - "Add field" button
6. "Add Section" button

**Auto-save** with debounce (useAutoSave). **Version-on-edit** for published templates.

### Field Type Config UIs

**Formula** (visual block builder):
- Row of blocks, each is one of:
  - Aggregate block: function dropdown (SUM/AVG/MIN/MAX/COUNT/MEDIAN) + form field picker
  - Operator block: +, -, *, /
  - Literal number block
- Add/remove blocks with + and X buttons
- Generates expression string for storage in config

**Dynamic Variable**:
- Dropdown to select a field from the linked form template
- Shows field label + section name for clarity

**Table**:
- Column list: each column maps to a form field via dropdown
- Add/remove columns
- Optional "Group by" toggle (groups rows by group)

**Static Text**:
- Textarea for plain text content (rich text deferred)

## Report Instance Viewer

Document-style layout: centered, max-w-[816px], white card on muted background.

**Header**: Breadcrumbs (Reports > Template Name > readable_id), Export dropdown (PDF/DOCX)

**Document content** (rendered from data_snapshot):
- Report title (template name + readable_id)
- Generated on date, Created by name
- Sections as visual groups:
  - Section title as h2, description as muted paragraph
  - Formula fields: key-value layout (label left, value right)
  - Dynamic Variable fields: same key-value layout
  - Table fields: full-width data table
  - Static Text fields: rendered paragraph
- Form instances included: collapsible list at bottom

**Status handling**:
- `generating`: centered spinner, "Generating report..." message
- `failed`: error alert with error_message, "Try Again" button
- `ready`: full document render

## Realtime Generation Notifications

When a report is generated:
1. Service returns `{ report_instance_id, readable_id }`
2. Realtime subscription on `report_instances` for that row
3. User navigates away freely
4. On `status = 'ready'`: success toast with "View Report" button (navigates to instance viewer)
5. On `status = 'failed'`: error toast with "View Details" button
6. Subscription cleaned up after status change

Custom hook `useReportGenerationWatch` mounted in authenticated layout, persists across navigation.

## Components

New components needed:
- `ReportBuilderSection` -- section card in report builder
- `ReportFieldCard` -- field card with type-specific config
- `FormulaBlockBuilder` -- visual formula editor
- `DynamicVariablePicker` -- form field dropdown
- `TableColumnConfig` -- column mapping UI
- `StaticTextEditor` -- textarea for static content
- `ReportFieldTypePicker` -- field type selection (4 types)
- `GenerateReportDialog` -- form instance selection + generate
- `ReportVersionHistorySheet` -- version history side sheet
- `ReportDocument` -- renders data_snapshot as a document
- `useReportBuilder` -- builder state management hook
- `useReportGenerationWatch` -- realtime subscription hook

Shadcn components to install:
- Progress (for generation status)
- Combobox/Command (for field picker in formula/table config)

## Access Control

- Template list/detail/builder: Root Admin only (matches RLS)
- Instance viewer: All authenticated active users (matches RLS)
- Export: All authenticated active users
- Generate: Root Admin only
