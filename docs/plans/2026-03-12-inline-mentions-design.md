# Inline Mentions (Formulas & Variables) Design

## Problem

Report paragraphs can't mix text with formula results or field values. Users must use separate block-level elements, resulting in choppy output like:

```
(paragraph) The total revenue was
(formula block) SUM(Revenue)
(paragraph) across all groups.
```

Instead of: "The total revenue was **1,250** across all groups."

## Solution

Add two custom **inline content** types to the BlockNote editor. These render as colored chips inside paragraphs and are resolved to actual values during report generation.

### Decisions

- **Keep standalone blocks** alongside inline versions (user picks based on context)
- **Inline formulas**: simple aggregates only — one function + one field (no arithmetic)
- **Inline variables**: reference a single form field
- **Trigger**: `/` slash menu with new "Inline Formula" and "Inline Variable" items
- **Rich text**: fix paragraph serialization to preserve bold/italic/underline and inline content

## Architecture

### 1. Custom Inline Content Specs

Two new specs registered in `schema.ts` via `createReactInlineContentSpec`:

```typescript
// InlineFormula: renders as a purple chip
propSchema: {
  fn: { default: 'SUM' },       // SUM | AVERAGE | MIN | MAX | COUNT | MEDIAN
  fieldId: { default: '' },     // template_field UUID
  fieldLabel: { default: '' },  // human label for display
}

// InlineVariable: renders as a blue chip
propSchema: {
  fieldId: { default: '' },
  fieldLabel: { default: '' },
}
```

Both have `content: 'none'` (they're leaf inline nodes, not containers).

### 2. Slash Menu Changes

Two new items added to the slash menu:

- **Inline Formula** — inserts an `inlineFormula` inline content node at the cursor
- **Inline Variable** — inserts an `inlineVariable` inline content node at the cursor

These use `editor.insertInlineContent()` instead of `insertOrUpdateBlockForSlashMenu`.

### 3. Configuration UI

When an inline mention is inserted, it starts unconfigured (shows "Click to configure"). Clicking opens a small popover:

- **Inline Formula**: dropdown for aggregate function + grouped field picker
- **Inline Variable**: grouped field picker (same as standalone block)

### 4. Serialization Changes

**Save (editor → DB)**: `static_text` config now stores the full inline content array:

```typescript
config: {
  inlineContent: [
    { type: 'text', text: 'Total revenue was ', styles: { bold: true } },
    { type: 'inlineFormula', props: { fn: 'SUM', fieldId: 'uuid', fieldLabel: 'Revenue' } },
    { type: 'text', text: ' across all groups.' },
  ],
  content: 'Total revenue was SUM(Revenue) across all groups.',  // plain text fallback
  format: 'richtext',
}
```

**Load (DB → editor)**: When `format === 'richtext'`, restore from `inlineContent` array. When `format === 'text'` (old data), fall back to plain text node.

### 5. Edge Function Resolution

In `generate-report/index.ts`, when processing `static_text` fields with `format: 'richtext'`:

1. Walk the `inlineContent` array
2. For `inlineFormula`: resolve aggregate → replace with `{ type: 'text', text: '1250' }`
3. For `inlineVariable`: look up field value → replace with `{ type: 'text', text: 'Sales' }`
4. Concatenate all text nodes into a single resolved string
5. Store resolved content in `data_snapshot`

### 6. Report Viewer + Exports

The report viewer and PDF/DOCX exports read the resolved `data_snapshot`. Since inline content is resolved to plain text by the edge function, no changes needed for rendering — `static_text` values are already displayed as plain text.

## Visual Design

**Editor chips** (Notion-style inline mentions):

- Formula: `[Σ SUM(Revenue)]` — purple-100 bg, purple-700 text, rounded-full, px-2 py-0.5
- Variable: `[⟐ Department]` — blue-100 bg, blue-700 text, rounded-full, px-2 py-0.5
- Unconfigured: gray bg with "Click to configure" text

## Files Affected

| File | Change |
|------|--------|
| `src/features/reports/editor/InlineFormula.tsx` | **NEW** — inline content spec + render |
| `src/features/reports/editor/InlineVariable.tsx` | **NEW** — inline content spec + render |
| `src/features/reports/editor/schema.ts` | Register `inlineContentSpecs` |
| `src/features/reports/editor/slash-menu-items.tsx` | Add inline menu items |
| `src/features/reports/editor/serialization.ts` | Rich text + inline content serialization |
| `src/features/reports/editor/types.ts` | Add inline content types |
| `supabase/functions/generate-report/index.ts` | Resolve inline formulas/variables in static_text |

## Backward Compatibility

- Old `static_text` fields with `format: 'text'` continue to work (fallback to plain text)
- Standalone formula/variable blocks are unchanged
- Existing report instances' data_snapshot format is unchanged
