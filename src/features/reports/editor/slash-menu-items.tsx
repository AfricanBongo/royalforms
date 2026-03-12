/**
 * Custom slash menu items for the report WYSIWYG editor.
 *
 * Adds Inline Formula, Inline Variable, Formula, Dynamic Variable, and
 * Data Table items to the slash menu alongside the default BlockNote items.
 */
import { insertOrUpdateBlockForSlashMenu } from '@blocknote/core/extensions'
import { CalculatorIcon, SigmaIcon, SquareFunctionIcon, TableIcon } from 'lucide-react'

import type { DefaultReactSuggestionItem } from '@blocknote/react'

import type { ReportBlockNoteEditor } from './schema'

// ---------------------------------------------------------------------------
// Custom slash menu items
// ---------------------------------------------------------------------------

export function getReportSlashMenuItems(
  editor: ReportBlockNoteEditor,
): DefaultReactSuggestionItem[] {
  return [
    // -- Inline content items (inserted into text flow) ---------------------
    {
      title: 'Inline Formula',
      onItemClick: () => {
        editor.insertInlineContent([
          { type: 'inlineFormula' as const, props: { fn: 'SUM', fieldId: '', fieldLabel: '' } },
          ' ',
        ])
      },
      aliases: ['inline', 'formula', 'sum', 'aggregate', 'mention'],
      group: 'Inline',
      icon: <SigmaIcon className="size-4" />,
      subtext: 'Insert a formula value inline with text',
    },
    {
      title: 'Inline Variable',
      onItemClick: () => {
        editor.insertInlineContent([
          { type: 'inlineVariable' as const, props: { fieldId: '', fieldLabel: '' } },
          ' ',
        ])
      },
      aliases: ['inline', 'variable', 'field', 'mention'],
      group: 'Inline',
      icon: <SquareFunctionIcon className="size-4" />,
      subtext: 'Insert a field value inline with text',
    },
    // -- Block-level items --------------------------------------------------
    {
      title: 'Formula',
      onItemClick: () => {
        insertOrUpdateBlockForSlashMenu(editor, {
          type: 'formula' as const,
        })
      },
      aliases: ['formula', 'calculate', 'sum', 'aggregate'],
      group: 'Report Fields',
      icon: <CalculatorIcon className="size-4" />,
      subtext: 'Add a formula with aggregate functions',
    },
    {
      title: 'Dynamic Variable',
      onItemClick: () => {
        insertOrUpdateBlockForSlashMenu(editor, {
          type: 'dynamicVariable' as const,
        })
      },
      aliases: ['variable', 'field', 'dynamic', 'reference'],
      group: 'Report Fields',
      icon: <SquareFunctionIcon className="size-4" />,
      subtext: 'Insert a value from a form field',
    },
    {
      title: 'Data Table',
      onItemClick: () => {
        insertOrUpdateBlockForSlashMenu(editor, {
          type: 'dataTable' as const,
        })
      },
      aliases: ['table', 'data', 'columns', 'grid'],
      group: 'Report Fields',
      icon: <TableIcon className="size-4" />,
      subtext: 'Add a data table with configurable columns',
    },
  ]
}
