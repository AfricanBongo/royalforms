# Form Builder Auto-Save Design

## Overview

Replace manual "Save Draft" with automatic persistence. All form builder changes are debounce-saved to the database, eliminating data loss and simplifying the user experience. Drafts exist at the version level, enabling draft editing of both new and published templates.

## Data Model

### New column: `template_versions.status`

| Column | Type | Values | Default |
|---|---|---|---|
| `status` | `text` | `'draft'`, `'published'` | `'draft'` |

Backfill all existing version rows to `'published'`.

### Template lifecycle states

| Scenario | `form_templates.status` | Latest `template_versions.status` |
|---|---|---|
| New form, never published | `draft` | `draft` |
| Published form, not being edited | `published` | `published` |
| Published form, being edited | `published` | `draft` (new version row) |

The `form_templates.status` is `'draft'` only when the template has never been published. Once any version is published, the template status is `'published'` permanently.

### Cron job update

`create_scheduled_instances()` must select only `template_versions` where `status = 'published'` and `is_latest = true`, so draft edits of published templates are not used for scheduled instances.

## Auto-Save Mechanics

### Debounce strategy

- **Interval**: 3 seconds after the last change
- **Save on navigate**: Flush pending save immediately before leaving the page
- **Save on publish**: Flush pending save before the publish action

### State machine

```
idle → dirty → saving → saved → idle
                  ↑                |
                  └── dirty ←──────┘ (user edits while saving)
```

- `idle`: No unsaved changes
- `dirty`: Changes exist, debounce timer running
- `saving`: Network request in flight
- `saved`: Last save succeeded, transitions to `idle` after ~2s

If the user edits while a save is in flight, state transitions to `dirty` after the current save completes, queuing another save.

### First save on `/forms/new`

1. User lands on `/forms/new` — no DB record. `templateId` is `null`.
2. User makes a meaningful change (title, description, or field label is non-empty).
3. First debounce tick → `saveDraft()` → creates template + version in DB → stores `templateId`.
4. URL silently updates to `/forms/$templateId/edit` via `navigate({ replace: true })`.
5. Subsequent auto-saves call `updateDraft(templateId, ...)`.

### Meaningful change gate

A change is "meaningful" when any of these are non-empty after trim:
- Form title
- Form description
- Any field label in any section

This prevents creating empty draft records when users visit `/forms/new` and immediately leave.

## Header Display

### Status indicator (inline, left of action buttons)

```
Draft · v1 · Saving...     [Discard Draft] [Publish]
Draft · v1 · Saved         [Discard Draft] [Publish]
Draft · v1                  [Discard Draft] [Publish]
Published · v2              [Publish New Version]
Published · v3 · Editing    [Discard Draft] [Publish New Version]
Published · v3 · Saving...  [Discard Draft] [Publish New Version]
```

- **Status badge**: `Draft` or `Published`
- **Version**: `vN`
- **Save indicator**: `Saving...`, `Saved`, `Editing` (has unsaved changes), or nothing when idle
- Rendered as muted text, no toast notifications

### Action buttons

| Context | Buttons |
|---|---|
| New draft (never published) | `Discard Draft`, `Publish` |
| Existing draft (returned to later) | `Discard Draft`, `Publish` |
| Published, being edited (draft version) | `Discard Draft`, `Publish New Version` |
| Published, not being edited | `Publish New Version` |

## Discard Draft Behavior

### New form (never published)

- Deletes the entire template (cascade: versions, sections, fields)
- Navigates to `/forms`
- If not yet persisted (`templateId` is null), just navigates away

### Published form being edited (draft version exists)

- Deletes only the draft version row
- Restores the previous published version's `is_latest = true`
- Navigates to `/forms/$templateId` (detail page)

## Navigation Blocker

The `useBlocker` confirmation dialog is **removed entirely** from both builder pages. Auto-save handles persistence. The "Discard Draft" button is the explicit opt-out.

## Service Layer

### New functions

- `deleteDraftTemplate(templateId: string)` — Full cascade delete of a never-published template.
- `discardDraftVersion(templateId: string)` — Delete draft version, restore previous published version's `is_latest`.
- `createDraftVersion(templateId: string)` — Create a new draft version row for a published template, copying sections/fields from the current published version.

### Modified functions

- `saveDraft` — Unchanged (creates template + version with `status = 'draft'`).
- `updateDraft` — Unchanged (updates in-place).
- `publishDraft` — Also sets `template_versions.status = 'published'`.
- `createTemplateVersion` — Replaced by draft-based flow: `createDraftVersion` → auto-save edits → publish promotes draft.

## Hook: `useAutoSave`

```typescript
function useAutoSave(options: {
  templateId: string | null
  isDraft: boolean
  versionNumber: number
  builderState: BuilderState
  toCreateInput: () => CreateTemplateInput
}) => {
  saveStatus: 'idle' | 'dirty' | 'saving' | 'saved'
  persistedTemplateId: string | null
  versionNumber: number
  templateStatus: 'draft' | 'published'
  flush: () => Promise<void>
}
```

- Watches `builderState` for changes via ref comparison (skip initial render)
- On change: set `dirty`, start/reset 3s debounce timer
- On debounce fire: `templateId === null` → `saveDraft()`, else → `updateDraft()`
- `flush()` cancels timer and persists immediately if dirty

## Page Changes

### `/forms/new`

- Remove manual Save Draft button and handler
- Use `useAutoSave({ templateId: null, ... })`
- After first auto-save, URL swaps to `/forms/$templateId/edit` via `replace: true`
- Header: status indicator + `[Discard Draft] [Publish]`
- Publish: `flush()` → `publishDraft()` → navigate to detail
- Discard: `deleteDraftTemplate()` if persisted, else navigate away
- Remove `useBlocker`

### `/forms/$templateId/edit`

- On load: check for existing draft version, or create one for published templates
- Use `useAutoSave({ templateId, ... })`
- Header: status indicator + context-sensitive buttons
- Publish: `flush()` → `publishDraft()` or promote draft version
- Discard: `deleteDraftTemplate()` or `discardDraftVersion()` depending on template status
- Remove `useBlocker`

## Edge Cases

- **Browser tab closed**: Last auto-saved state preserved, resumable from draft list
- **Network failure**: Show error indicator in header, retry on next change
- **Empty form discard**: If `templateId` is null (never persisted), just navigate away
- **Concurrent edits**: Not a concern (save-based model, no real-time collab)
- **Rapid edits during save**: Queued — state goes `saving → dirty → saving` after completion
