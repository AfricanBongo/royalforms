# Version History Sheet — Design

## Overview

Add a version history side sheet to the template detail page, allowing users to browse past published versions of a form template, filter by date range, and restore a previous version (creating a new version with the old content).

## UI Component

Shadcn **Sheet** (right-aligned side panel), opened from the existing "Versions" button on the template detail page (`$templateId/index.tsx`).

### Layout

- **Header**: "Form Versions" title + close button
- **Date range filter**: Two date picker inputs (Start Date, End Date) filtering by `created_at`
- **Table** (Shadcn `Table`):
  - Columns: Version (`vN`), Date (`created_at` formatted), Actions
  - No checkboxes (deferred)
  - Current version row: "Current" badge, no action buttons
  - Past version rows: "View" button (disabled, tooltip "Coming soon") + "Restore" button (ghost, blue text)
- **Footer**: "Close" button

### Restore Flow

1. User clicks "Restore" on a past version row (e.g., v12)
2. Confirmation dialog (Shadcn `AlertDialog`): "Restore v12? This will create a new published version (v16) with the content from v12."
3. On confirm, call `restoreVersion(templateId, sourceVersionId)`
4. On success: toast "Restored to v12 — created v16", refresh version list and detail page
5. Sheet stays open after restore so user sees the updated list

## Service Layer

Three new functions in `form-templates.ts`:

### `fetchVersionHistory(templateId, dateRange?)`

- Query `template_versions` for the given template
- Filter to `status = 'published'` only (no drafts in history)
- Optional date range filter on `created_at`
- Order by `version_number DESC`
- Return: `{ id, version_number, is_latest, restored_from, created_at }[]`

### `restoreVersion(templateId, sourceVersionId)`

- Fetch sections + fields of the source version
- Set current `is_latest` version to `is_latest = false`
- Create new version N+1 with `status: 'published'`, `is_latest: true`, `restored_from: sourceVersionId`
- Deep-copy sections and fields from source version into new version
- Return the new version

### `fetchVersionDetail(versionId)` — DEFERRED

Not implemented until form preview feature is built (depends on form instances).

## Deferred

- **View button**: renders but disabled — needs form preview (which depends on form instances)
- **Form preview in builder header**: noted for form instances work
- **Checkboxes / bulk actions**: Figma placeholder, skip for MVP
- **Version comparison**: not in scope

## Notes for Future

- Form builder should have a "Preview" button in the header that shows how the form would behave as a form instance (validation, config work, but no submission)
- The "View" button on past versions should use this same preview feature
- Both of these depend on form instances being implemented first
