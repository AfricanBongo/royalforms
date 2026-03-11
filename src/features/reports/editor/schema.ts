/**
 * BlockNote schema for the report WYSIWYG editor.
 *
 * Registers custom block types (Formula, Dynamic Variable, Data Table)
 * alongside the default BlockNote block specs.
 */
import { BlockNoteSchema, defaultBlockSpecs } from '@blocknote/core'

import { DataTableBlock } from './DataTableBlock'
import { DynamicVariableBlock } from './DynamicVariableBlock'
import { FormulaBlock } from './FormulaBlock'

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
})

// ---------------------------------------------------------------------------
// Derived types
// ---------------------------------------------------------------------------

export type ReportBlockNoteEditor = typeof reportEditorSchema.BlockNoteEditor
export type ReportBlock = typeof reportEditorSchema.Block
