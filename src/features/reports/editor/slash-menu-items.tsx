/**
 * Custom slash menu items for the report WYSIWYG editor.
 *
 * Adds Formula, Dynamic Variable, and Data Table items to the slash menu
 * alongside the default BlockNote items (paragraphs, headings, etc).
 */
import { insertOrUpdateBlockForSlashMenu } from '@blocknote/core/extensions'
import { CalculatorIcon, SquareFunctionIcon, TableIcon } from 'lucide-react'

import type { DefaultReactSuggestionItem } from '@blocknote/react'

import type { ReportBlockNoteEditor } from './schema'

// ---------------------------------------------------------------------------
// Custom slash menu items
// ---------------------------------------------------------------------------

export function getReportSlashMenuItems(
  editor: ReportBlockNoteEditor,
): DefaultReactSuggestionItem[] {
  return [
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
