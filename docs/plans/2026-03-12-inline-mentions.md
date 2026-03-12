# Inline Mentions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add inline formula and dynamic variable mentions within paragraph blocks in the report editor, with full serialization, resolution, and backward compatibility.

**Architecture:** Two custom `createReactInlineContentSpec` inline content types registered in the BlockNote schema. Paragraphs serialize with rich inline content (preserving formatting + mentions). The `generate-report` edge function resolves inline mentions to plain text values in the data snapshot.

**Tech Stack:** BlockNote v0.47 (`@blocknote/core`, `@blocknote/react`), React, TypeScript, Supabase Edge Functions (Deno)

---

### Task 1: Create InlineFormula inline content spec

**Files:**
- Create: `src/features/reports/editor/InlineFormula.tsx`

**Step 1: Create the inline content spec file**

Create `InlineFormula.tsx` with `createReactInlineContentSpec`. The spec:
- type: `'inlineFormula'`
- propSchema: `fn` (default `'SUM'`), `fieldId` (default `''`), `fieldLabel` (default `''`)
- content: `'none'`

The render component should:
- Show a purple chip: `bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 rounded-full px-2 py-0.5 text-sm font-medium inline-flex items-center gap-1`
- When unconfigured (`fieldId === ''`): show "Click to configure" in gray
- When configured: show `FN(FieldLabel)` e.g. `SUM(Revenue)`
- On click: open a Popover with:
  - A Select for aggregate function (SUM, AVERAGE, MIN, MAX, COUNT, MEDIAN)
  - A grouped Select for field (using `useFormFields()` context, filtered to numeric types for SUM/AVERAGE/MIN/MAX/MEDIAN, all types for COUNT)
- On selection: update props via `editor.updateInlineContent(inlineContent, { props: { fn, fieldId, fieldLabel } })`

**Important:** Use `useFormFields()` from `./form-fields-context` to get available form fields. Filter numeric types (`number`, `rating`, `range`) for all functions except COUNT.

**Step 2: Verify it compiles**

Run: `npx tsc -b`
Expected: No errors (file is standalone, not yet registered)

**Step 3: Commit**

```
feat(reports): add InlineFormula inline content spec
```

---

### Task 2: Create InlineVariable inline content spec

**Files:**
- Create: `src/features/reports/editor/InlineVariable.tsx`

**Step 1: Create the inline content spec file**

Create `InlineVariable.tsx` with `createReactInlineContentSpec`. The spec:
- type: `'inlineVariable'`
- propSchema: `fieldId` (default `''`), `fieldLabel` (default `''`)
- content: `'none'`

The render component should:
- Show a blue chip: `bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 rounded-full px-2 py-0.5 text-sm font-medium inline-flex items-center gap-1`
- When unconfigured: show "Click to configure" in gray
- When configured: show field label e.g. `Department`
- On click: open a Popover with a grouped Select for any field type
- On selection: update props

**Step 2: Verify it compiles**

Run: `npx tsc -b`

**Step 3: Commit**

```
feat(reports): add InlineVariable inline content spec
```

---

### Task 3: Register inline content specs in schema

**Files:**
- Modify: `src/features/reports/editor/schema.ts`

**Step 1: Update schema to include inlineContentSpecs**

```typescript
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from '@blocknote/core'
import { InlineFormula } from './InlineFormula'
import { InlineVariable } from './InlineVariable'

export const reportEditorSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    formula: FormulaBlock(),
    dynamicVariable: DynamicVariableBlock(),
    dataTable: DataTableBlock(),
  },
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    inlineFormula: InlineFormula,
    inlineVariable: InlineVariable,
  },
})
```

**Important:** Spread `defaultInlineContentSpecs` to keep text, link, etc.

**Step 2: Verify it compiles**

Run: `npx tsc -b`

**Step 3: Commit**

```
feat(reports): register inline content specs in BlockNote schema
```

---

### Task 4: Add slash menu items for inline insertion

**Files:**
- Modify: `src/features/reports/editor/slash-menu-items.tsx`

**Step 1: Add two new slash menu items**

Add "Inline Formula" and "Inline Variable" items to the `getReportSlashMenuItems` function. These should use `editor.insertInlineContent()` instead of `insertOrUpdateBlockForSlashMenu`:

```typescript
{
  title: 'Inline Formula',
  onItemClick: () => {
    editor.insertInlineContent([
      { type: 'inlineFormula', props: { fn: 'SUM', fieldId: '', fieldLabel: '' } },
      ' ',  // space after chip
    ])
  },
  aliases: ['inline', 'formula', 'sum', 'aggregate', 'mention'],
  group: 'Inline',
  icon: <CalculatorIcon className="size-4" />,
  subtext: 'Insert a formula value inline with text',
},
{
  title: 'Inline Variable',
  onItemClick: () => {
    editor.insertInlineContent([
      { type: 'inlineVariable', props: { fieldId: '', fieldLabel: '' } },
      ' ',
    ])
  },
  aliases: ['inline', 'variable', 'field', 'mention'],
  group: 'Inline',
  icon: <SquareFunctionIcon className="size-4" />,
  subtext: 'Insert a field value inline with text',
},
```

Place these BEFORE the existing block-level items so they appear first.

**Step 2: Verify it compiles**

Run: `npx tsc -b`

**Step 3: Manually test in browser**

- Open the report editor
- Type `/` in a paragraph
- Verify "Inline Formula" and "Inline Variable" appear in the menu
- Click each one and verify a chip is inserted inline
- Click the chip and verify the configuration popover opens
- Configure and verify the chip updates

**Step 4: Commit**

```
feat(reports): add inline formula and variable to slash menu
```

---

### Task 5: Upgrade serialization for rich inline content

**Files:**
- Modify: `src/features/reports/editor/serialization.ts`

**Step 1: Update the `InlineContentItem` interface**

Add support for custom inline content types:

```typescript
interface InlineContentItem {
  type: string
  text?: string
  styles?: Record<string, unknown>
  content?: InlineContentItem[]
  href?: string
  // Custom inline content props (for inlineFormula, inlineVariable)
  props?: Record<string, unknown>
}
```

**Step 2: Update `editorToCreateInput` paragraph handling**

Replace the current paragraph serialization (which strips formatting) with rich inline content preservation:

```typescript
if (block.type === 'paragraph') {
  const inlineContent = block.content ?? []
  const plainText = inlineContentToText(inlineContent)
  if (!plainText.trim() && !inlineContent.some(ic => ic.type === 'inlineFormula' || ic.type === 'inlineVariable')) continue

  // Check if content has any custom inline content or rich formatting
  const hasRichContent = inlineContent.some(
    (ic) => ic.type !== 'text' || (ic.styles && Object.keys(ic.styles).length > 0)
  )

  const field: CreateReportFieldInput = {
    label: plainText.substring(0, 100) || 'Rich Text',
    field_type: 'static_text',
    sort_order: fieldOrder,
    config: hasRichContent
      ? {
          inlineContent: serializeInlineContent(inlineContent),
          content: plainText,
          format: 'richtext',
        }
      : {
          content: plainText,
          format: 'text',
        },
  }
  currentSection.fields.push(field)
  continue
}
```

Add a `serializeInlineContent` helper that maps the editor's inline content items to a clean serializable format, preserving:
- `text` nodes with `styles` (bold, italic, underline, strikethrough, code)
- `link` nodes with `href` and nested content
- `inlineFormula` nodes with `props` (fn, fieldId, fieldLabel)
- `inlineVariable` nodes with `props` (fieldId, fieldLabel)

**Step 3: Update `inlineContentToText` to handle custom inline content**

Update the function to produce readable fallback text:

```typescript
function inlineContentToText(content: InlineContentItem[] | undefined): string {
  if (!content || content.length === 0) return ''
  return content
    .map((item) => {
      if (item.type === 'text') return item.text ?? ''
      if (item.type === 'link') return inlineContentToText(item.content)
      if (item.type === 'inlineFormula') {
        const props = item.props ?? {}
        return `${props.fn ?? 'SUM'}(${props.fieldLabel ?? props.fieldId ?? ''})`
      }
      if (item.type === 'inlineVariable') {
        const props = item.props ?? {}
        return String(props.fieldLabel ?? props.fieldId ?? '')
      }
      return ''
    })
    .join('')
}
```

**Step 4: Update `templateDetailToEditorContent` for loading**

In the `static_text` case, handle both `format: 'richtext'` and `format: 'text'`:

```typescript
case 'static_text': {
  if (config.format === 'richtext' && Array.isArray(config.inlineContent)) {
    // Restore rich inline content
    blocks.push({
      id: nextId(),
      type: 'paragraph',
      props: {},
      content: deserializeInlineContent(config.inlineContent as InlineContentItem[]),
      children: [],
    })
  } else {
    // Legacy plain text fallback
    const content = (config.content as string) ?? field.label
    blocks.push({
      id: nextId(),
      type: 'paragraph',
      props: {},
      content: [{ type: 'text', text: content }],
      children: [],
    })
  }
  break
}
```

Add a `deserializeInlineContent` helper that reconstructs the BlockNote inline content array from the stored format.

**Step 5: Verify it compiles**

Run: `npx tsc -b`

**Step 6: Commit**

```
feat(reports): upgrade serialization for rich text and inline mentions
```

---

### Task 6: Resolve inline mentions in generate-report edge function

**Files:**
- Modify: `supabase/functions/generate-report/index.ts`

**Step 1: Update static_text resolution to handle richtext format**

In the `case "static_text"` block, add handling for `format: 'richtext'`:

```typescript
case "static_text": {
  if (config.format === "richtext" && Array.isArray(config.inlineContent)) {
    // Resolve inline formulas and variables, then concatenate to plain text
    const resolvedParts: string[] = [];
    for (const item of config.inlineContent as Array<Record<string, unknown>>) {
      if (item.type === "text") {
        resolvedParts.push(String(item.text ?? ""));
      } else if (item.type === "link") {
        // Recurse into link content
        resolvedParts.push(
          ((item.content as Array<Record<string, unknown>>) ?? [])
            .map((c) => String(c.text ?? ""))
            .join("")
        );
      } else if (item.type === "inlineFormula") {
        const props = item.props as Record<string, string>;
        const fn = props.fn ?? "SUM";
        const fieldId = props.fieldId ?? "";
        if (fieldId) {
          try {
            const expression = `${fn}(${fieldId})`;
            const resolved = resolveAggregates(expression, numericFieldValues, fieldTypeMap);
            const value = evaluateArithmetic(resolved);
            resolvedParts.push(
              Number.isInteger(value) ? String(value) : value.toFixed(2)
            );
          } catch {
            resolvedParts.push(`[${fn} Error]`);
          }
        } else {
          resolvedParts.push(`[${fn}(?)]`);
        }
      } else if (item.type === "inlineVariable") {
        const props = item.props as Record<string, string>;
        const fieldId = props.fieldId ?? "";
        if (fieldId) {
          const values = rawFieldValues.get(fieldId);
          resolvedParts.push(String(values?.[0]?.value ?? "-"));
        } else {
          resolvedParts.push("[?]");
        }
      }
    }
    resolvedValue = resolvedParts.join("");
  } else {
    resolvedValue = config.content ?? "";
  }
  break;
}
```

**Step 2: Verify the edge function syntax**

Check for any syntax issues by reviewing the file.

**Step 3: Commit**

```
feat(reports): resolve inline formulas and variables in report generation
```

---

### Task 7: Final integration test and cleanup

**Files:**
- All modified files

**Step 1: Run full build**

Run: `npm run build`
Expected: Exit 0

**Step 2: Run lint**

Run: `npm run lint`
Expected: No new errors introduced

**Step 3: Manual integration test**

1. Open report editor, create a paragraph with inline formula and variable
2. Save the report template
3. Reopen — verify inline content is preserved (chips show correctly)
4. Generate a report instance — verify inline values are resolved
5. View the report instance — verify resolved text displays correctly
6. Export as PDF — verify resolved text appears in the PDF

**Step 4: Commit any fixes**

```
fix(reports): address integration test issues for inline mentions
```

---

## Commit Summary

| Task | Commit message |
|------|---------------|
| 1 | `feat(reports): add InlineFormula inline content spec` |
| 2 | `feat(reports): add InlineVariable inline content spec` |
| 3 | `feat(reports): register inline content specs in BlockNote schema` |
| 4 | `feat(reports): add inline formula and variable to slash menu` |
| 5 | `feat(reports): upgrade serialization for rich text and inline mentions` |
| 6 | `feat(reports): resolve inline formulas and variables in report generation` |
| 7 | `fix(reports): address integration test issues for inline mentions` |
