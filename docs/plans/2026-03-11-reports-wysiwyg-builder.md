# WYSIWYG Report Builder Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the form-builder-style report template editor with a Notion-like WYSIWYG block editor using BlockNote with Shadcn styling and custom blocks for Formula, Dynamic Variable, and Data Table.

**Architecture:** BlockNote provides the editing experience (slash menu, drag handles, block toolbar). We register 3 custom block types via `createReactBlockSpec()`. A serialization layer converts between BlockNote's document model and our existing `CreateReportTemplateInput` service format. The rest of the reports frontend (list, detail, viewer, export, realtime) is untouched.

**Tech Stack:** BlockNote (`@blocknote/core`, `@blocknote/react`, `@blocknote/shadcn`), React 19, Shadcn UI, Tailwind

---

## Task 1: Install BlockNote + Configure Tailwind

**Files:**
- Modify: `package.json` (npm install)
- Modify: `src/index.css` (add @source directive)

**Step 1: Install BlockNote packages**

```bash
npm install @blocknote/core@latest @blocknote/react@latest @blocknote/shadcn@latest
```

**Step 2: Add Tailwind source directive**

In `src/index.css`, add the `@source` directive for BlockNote Shadcn styles:

```css
@source "../node_modules/@blocknote/shadcn";
```

Add this near the top of the file, after the tailwind import and before any custom styles.

**Step 3: Verify build**

Run: `npx tsc -b`
Expected: No errors.

**Step 4: Commit**

```
chore(deps): install BlockNote editor packages for WYSIWYG report builder
```

---

## Task 2: Create Custom Block Definitions

**Files:**
- Create: `src/features/reports/editor/schema.ts`
- Create: `src/features/reports/editor/FormulaBlock.tsx`
- Create: `src/features/reports/editor/DynamicVariableBlock.tsx`
- Create: `src/features/reports/editor/DataTableBlock.tsx`

### FormulaBlock.tsx

Custom block using `createReactBlockSpec`:
- **Block config:** type `"formula"`, propSchema with `expression` (string, default ""), `referencedFields` (string, default "[]" — JSON array), `formulaBlocks` (string, default "[]" — JSON serialized FormulaBlock array)
- **content:** `"none"` (no inline content)
- **Render:** A styled card showing the formula expression. If empty, show "Click to configure formula". When clicked, open a popover/dialog with the formula block builder UI (reuse the visual aggregate/operator/literal pattern from the old `formula-block-builder.tsx`, but render it inside the block's config UI).
- **The formula config UI** renders inside the block: aggregate function Select, form field Select (grouped by section), operator Select, literal number Input, add/remove blocks. The `formFields` data comes from a React context (set by the editor wrapper).

### DynamicVariableBlock.tsx

- **Block config:** type `"dynamicVariable"`, propSchema with `fieldId` (string, default ""), `fieldLabel` (string, default ""), `sectionTitle` (string, default "")
- **content:** `"none"`
- **Render:** Pill showing "→ {fieldLabel} ({sectionTitle})". If not configured, show "Click to select field". When clicked, show a popover with the field picker Select (grouped by section).

### DataTableBlock.tsx

- **Block config:** type `"dataTable"`, propSchema with `columns` (string, default "[]" — JSON), `groupBy` (boolean, default false)
- **content:** `"none"`
- **Render:** Table skeleton with configured column headers. If no columns, show "Click to configure table columns". When clicked, show config UI: column rows (field select + label input + remove), add column button, group by switch.

### schema.ts

Exports the BlockNote schema and editor type:

```typescript
import { BlockNoteSchema, defaultBlockSpecs } from '@blocknote/core'

const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    formula: FormulaBlock,
    dynamicVariable: DynamicVariableBlock,
    dataTable: DataTableBlock,
  },
})

type ReportEditorType = typeof schema.BlockNoteEditor
```

Also exports a React context for passing `formFields` data to custom blocks.

**Step: Type-check and commit**

```
feat(reports): add BlockNote custom blocks for formula, variable, and table
```

---

## Task 3: Slash Menu Items

**Files:**
- Create: `src/features/reports/editor/slash-menu-items.ts`

Custom slash menu items that insert our custom blocks:
- "Formula" — inserts a `formula` block (CalculatorIcon)
- "Dynamic Variable" — inserts a `dynamicVariable` block (SquareFunctionIcon)
- "Data Table" — inserts a `dataTable` block (TableIcon)

These are added via BlockNote's `getDefaultSlashMenuItems` + custom items pattern. Read BlockNote docs for the exact API for adding custom slash menu items.

**Step: Type-check and commit**

```
feat(reports): add custom slash menu items for report field types
```

---

## Task 4: Serialization Layer

**Files:**
- Create: `src/features/reports/editor/serialization.ts`

Two functions:

### `editorToCreateInput(document, metadata): CreateReportTemplateInput`

Walks BlockNote document blocks and converts to service format:

1. Iterate through blocks sequentially
2. When encountering a `heading` block → start a new section (title = heading text)
3. When encountering a `formula` block → add formula field to current section
4. When encountering a `dynamicVariable` block → add dynamic_variable field to current section
5. When encountering a `dataTable` block → add table field to current section
6. When encountering a `paragraph` block (with text) → add static_text field to current section
7. If no heading has been seen yet, create a default "Section 1" section
8. Return full `CreateReportTemplateInput` with metadata (name, abbreviation, description, linkedFormTemplateId, autoGenerate) + sections

### `templateDetailToEditorContent(detail: ReportTemplateDetail): Block[]`

Converts loaded template data back to BlockNote document:

1. For each section → create a heading block (h2) with section title
2. If section has description → create a paragraph block with description text
3. For each field in section:
   - formula → create formula block with props from config
   - dynamic_variable → create dynamicVariable block with props from config
   - table → create dataTable block with props from config
   - static_text → create paragraph block with text content
4. Return array of blocks

**Step: Type-check and commit**

```
feat(reports): add serialization between BlockNote document and service format
```

---

## Task 5: Report Editor Wrapper Component

**Files:**
- Create: `src/features/reports/editor/ReportEditor.tsx`

Wrapper component that composes everything:

```typescript
interface ReportEditorProps {
  initialContent?: Block[]
  formFields: FormFieldOption[]
  onChange?: (document: Block[]) => void
}
```

- Creates BlockNote editor via `useCreateBlockNote({ schema, initialContent })`
- Wraps in `FormFieldsContext.Provider` with formFields data
- Renders `<BlockNoteView editor={editor} slashMenu={false} />` (with custom slash menu if needed)
- Calls `onChange` when content changes (via editor's `onChange` callback)
- Imports `@blocknote/shadcn/style.css`

**Step: Type-check and commit**

```
feat(reports): add ReportEditor wrapper component with BlockNote integration
```

---

## Task 6: Rewrite Edit Page

**Files:**
- Modify: `src/routes/_authenticated/reports/$templateId/edit.tsx`

Replace the BuilderSection-based layout with:

1. **Metadata section** (above editor): Template name (ContentEditable h1), Linked Form (Select, disabled on edit), Description (ContentEditable p), Auto-generate Switch
2. **ReportEditor** component with: `initialContent` from `templateDetailToEditorContent(detail)`, `formFields` from loaded form template
3. **Auto-save adaptation:** The editor's `onChange` triggers the auto-save debounce. The `toCreateInput` function now calls `editorToCreateInput(editor.document, metadata)`.
4. **Header actions:** Same as before (save status, discard, publish)

Remove all imports of old builder components (ReportBuilderSection, etc).

**Step: Type-check and commit**

```
refactor(reports): replace form-builder with BlockNote WYSIWYG editor on edit page
```

---

## Task 7: Rewrite New Page

**Files:**
- Modify: `src/routes/_authenticated/reports/new.tsx`

Same as edit page but:
- Empty initial content
- Linked Form Select is enabled
- Load form fields dynamically on form template selection
- URL swap after first auto-save

Remove all imports of old builder components.

**Step: Type-check and commit**

```
refactor(reports): replace form-builder with BlockNote WYSIWYG editor on new page
```

---

## Task 8: Adapt Auto-Save Hook

**Files:**
- Modify: `src/hooks/use-report-auto-save.ts`

Adapt for BlockNote content:
- **Fingerprint:** `JSON.stringify(editorDocument)` — the BlockNote document is the source of truth
- **Meaningful content:** Check if document has any non-empty blocks
- **toCreateInput:** Now receives editor document + metadata, calls `editorToCreateInput()`
- Interface changes: accept `editorDocument` instead of `builderState` + `toCreateInput`

**Step: Type-check and commit**

```
refactor(reports): adapt auto-save hook for BlockNote content model
```

---

## Task 9: Delete Old Builder Components

**Files to delete:**
- `src/hooks/use-report-builder.ts`
- `src/components/report-field-type-picker.tsx`
- `src/components/report-builder-section.tsx`
- `src/components/report-builder-field-card.tsx`
- `src/components/formula-block-builder.tsx`
- `src/components/dynamic-variable-picker.tsx`
- `src/components/table-column-config.tsx`

Verify no other files import these. If any do, update imports first.

**Step: Type-check and commit**

```
refactor(reports): remove old form-builder-style report components
```

---

## Task 10: Final Verification

**Step 1:** `npx tsc -b` — no errors
**Step 2:** `npm run lint` — no new errors
**Step 3:** `npm run build` — clean build
**Step 4:** Commit any fixes
