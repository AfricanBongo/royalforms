/**
 * BlockNote schema for the report WYSIWYG editor.
 *
 * Registers custom block types (Formula, Dynamic Variable, Data Table)
 * and custom inline content types (Inline Formula, Inline Variable)
 * alongside the default BlockNote specs.
 */
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from '@blocknote/core'

import { DataTableBlock } from './DataTableBlock'
import { DynamicVariableBlock } from './DynamicVariableBlock'
import { FormulaBlock } from './FormulaBlock'
import { InlineFormula } from './InlineFormula'
import { InlineVariable } from './InlineVariable'

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Derived types
// ---------------------------------------------------------------------------

export type ReportBlockNoteEditor = typeof reportEditorSchema.BlockNoteEditor
export type ReportBlock = typeof reportEditorSchema.Block
