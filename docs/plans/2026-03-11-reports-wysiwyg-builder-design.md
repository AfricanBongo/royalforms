# Reports Frontend Design — WYSIWYG Builder Update

## Overview

Refactor the report template builder from a form-builder-style interface to a WYSIWYG block editor using BlockNote (built on Tiptap/ProseMirror). The builder should feel like Notion or Coda — users type and compose the report inline, seeing something close to the final output as they work.

**What changes:** The builder layer only (editor, custom blocks, serialization).
**What stays unchanged:** List page, detail page, instance viewer, export, realtime watch, service layer, database schema, version history, generate dialog.

## Library: BlockNote

- **Package:** `@blocknote/core`, `@blocknote/react`, `@blocknote/shadcn`
- **License:** MIT (fully free, no sign-up)
- **Why:** Provides Notion-style block editing out of the box (slash menu, drag handles, block toolbar) with `@blocknote/shadcn` for our existing Shadcn/Tailwind styling. Supports custom blocks via `createReactBlockSpec()`.

## Editor Experience

User opens the builder and sees a clean document editor:
- Type text directly (becomes static text content)
- Press `/` to open slash menu with custom items: Formula, Dynamic Variable, Data Table, plus standard text blocks (Heading, Paragraph, etc.)
- Drag blocks to reorder
- Sections are heading blocks (h2) — no separate "section" concept in the editor
- Custom blocks render inline with a preview of what they represent

## Custom Blocks

### Formula Block
- **Slash menu label:** "Formula"
- **Editor rendering:** Styled card showing the formula expression. Click to expand config popover with the visual block builder (aggregate function picker, field picker, operators, literals).
- **Props:** `expression: string`, `referencedFields: string[]`, `blocks: FormulaBlock[]` (serialized)
- **Preview:** Shows computed expression string, e.g. `= SUM(Revenue) / COUNT(Entries)`

### Dynamic Variable Block
- **Slash menu label:** "Dynamic Variable"
- **Editor rendering:** Inline pill showing "→ Field Name (Section Name)". Click to change via field picker popover.
- **Props:** `fieldId: string`, `fieldLabel: string`, `sectionTitle: string`
- **Preview:** Shows the selected field name

### Data Table Block
- **Slash menu label:** "Data Table"
- **Editor rendering:** Table skeleton showing configured column headers with placeholder rows. Click to configure columns via popover.
- **Props:** `columns: { fieldId: string; label: string }[]`, `groupBy: boolean`
- **Preview:** Shows column headers in a table layout

### Static Text
- Not a custom block — just the default paragraph block. Users type normally.

### Headings as Sections
- Standard BlockNote heading blocks (h2) act as section dividers.
- When serializing for storage, consecutive blocks under a heading are grouped into a section.

## Serialization

**Editor content (BlockNote JSON) ↔ Service format (`CreateReportTemplateInput`)**

### Save (Editor → Service)
1. Walk through BlockNote document blocks
2. Group blocks by heading boundaries into sections
3. For each section: extract title from heading, fields from custom blocks, static text from paragraphs
4. Convert to `CreateReportSectionInput[]` with `CreateReportFieldInput[]`

### Load (Service → Editor)
1. Read `ReportTemplateDetail` with sections and fields
2. For each section: create a heading block, then create blocks for each field
3. For each field type: create the corresponding custom block with props from config
4. Static text fields become paragraph blocks
5. Set as BlockNote initial content

## Files Affected

### Delete (replaced by BlockNote)
- `src/hooks/use-report-builder.ts`
- `src/components/report-field-type-picker.tsx`
- `src/components/report-builder-section.tsx`
- `src/components/report-builder-field-card.tsx`
- `src/components/formula-block-builder.tsx`
- `src/components/dynamic-variable-picker.tsx`
- `src/components/table-column-config.tsx`

### Create
- `src/features/reports/editor/schema.ts` — BlockNote schema with custom blocks
- `src/features/reports/editor/FormulaBlock.tsx` — Formula block render + config
- `src/features/reports/editor/DynamicVariableBlock.tsx` — Variable block render + config
- `src/features/reports/editor/DataTableBlock.tsx` — Table block render + config
- `src/features/reports/editor/slash-menu-items.ts` — Custom slash menu items
- `src/features/reports/editor/serialization.ts` — BlockNote JSON ↔ service format
- `src/features/reports/editor/ReportEditor.tsx` — Wrapper component

### Modify
- `src/routes/_authenticated/reports/$templateId/edit.tsx` — Use ReportEditor instead of BuilderSection
- `src/routes/_authenticated/reports/new.tsx` — Same
- `src/hooks/use-report-auto-save.ts` — Adapt fingerprinting for BlockNote content
- `src/index.css` — Add `@source` directive for BlockNote Shadcn styles

## Auto-Save Adaptation

The auto-save hook needs to work with BlockNote's content model instead of `ReportBuilderState`:
- **Fingerprint:** `JSON.stringify(editor.document)` instead of custom state serialization
- **Meaningful content check:** Check if document has any non-empty blocks
- **toCreateInput:** New serialization function that walks BlockNote document → `CreateReportTemplateInput`

## What Stays the Same

- Report metadata (name, abbreviation, description, linked form, auto-generate) rendered as form fields ABOVE the editor
- Header actions (save status, discard, publish)
- Version-on-edit for published templates
- URL swap for new templates
- All service calls unchanged
- Database schema unchanged
