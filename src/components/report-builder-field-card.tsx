/**
 * ReportBuilderFieldCard — renders a single field in the report builder.
 *
 * Two states (mirrors BuilderFieldCard pattern):
 * - **Collapsed**: field type badge + label + expand chevron + action buttons
 * - **Expanded**: label input + type-specific config component
 */
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CopyIcon,
  Trash2Icon,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { DynamicVariablePicker } from './dynamic-variable-picker'
import { FormulaBlockBuilder } from './formula-block-builder'
import { TableColumnConfig } from './table-column-config'
import { REPORT_FIELD_TYPE } from '../hooks/use-report-builder'

import type { FormFieldOption, ReportBuilderField } from '../hooks/use-report-builder'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReportBuilderFieldCardProps {
  field: ReportBuilderField
  isFirst: boolean
  isLast: boolean
  formFields: FormFieldOption[]
  onUpdate: (updates: Partial<ReportBuilderField>) => void
  onRemove: () => void
  onDuplicate: () => void
  onMove: (direction: 'up' | 'down') => void
  onSetEditing: (isEditing: boolean) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FIELD_TYPE_COLORS: Record<string, string> = {
  formula: 'bg-purple-100 text-purple-800',
  dynamic_variable: 'bg-blue-100 text-blue-800',
  table: 'bg-green-100 text-green-800',
  static_text: 'bg-gray-100 text-gray-800',
}

const FIELD_TYPE_LABELS: Record<string, string> = {
  formula: 'Formula',
  dynamic_variable: 'Dynamic Variable',
  table: 'Table',
  static_text: 'Static Text',
}

// ---------------------------------------------------------------------------
// Type-specific config renderer
// ---------------------------------------------------------------------------

function FieldConfigEditor({
  field,
  formFields,
  onUpdate,
}: {
  field: ReportBuilderField
  formFields: FormFieldOption[]
  onUpdate: (updates: Partial<ReportBuilderField>) => void
}) {
  switch (field.field_type) {
    case REPORT_FIELD_TYPE.FORMULA:
      return (
        <FormulaBlockBuilder
          blocks={field.formulaBlocks}
          onChange={(blocks) => onUpdate({ formulaBlocks: blocks })}
          formFields={formFields}
        />
      )

    case REPORT_FIELD_TYPE.DYNAMIC_VARIABLE:
      return (
        <DynamicVariablePicker
          selectedFieldId={field.dynamicVariableFieldId}
          onChange={(fieldId) => onUpdate({ dynamicVariableFieldId: fieldId })}
          formFields={formFields}
        />
      )

    case REPORT_FIELD_TYPE.TABLE:
      return (
        <TableColumnConfig
          columns={field.tableColumns}
          onChange={(columns) => onUpdate({ tableColumns: columns })}
          groupBy={field.tableGroupBy}
          onGroupByChange={(value) => onUpdate({ tableGroupBy: value })}
          formFields={formFields}
        />
      )

    case REPORT_FIELD_TYPE.STATIC_TEXT:
      return (
        <Textarea
          value={field.staticTextContent}
          placeholder="Enter static text content..."
          className="min-h-[80px] resize-y"
          onChange={(e) => onUpdate({ staticTextContent: e.target.value })}
        />
      )

    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ReportBuilderFieldCard({
  field,
  isFirst,
  isLast,
  formFields,
  onUpdate,
  onRemove,
  onDuplicate,
  onMove,
  onSetEditing,
}: ReportBuilderFieldCardProps) {
  const colorClass = FIELD_TYPE_COLORS[field.field_type] ?? 'bg-gray-100 text-gray-800'
  const typeLabel = FIELD_TYPE_LABELS[field.field_type] ?? field.field_type

  // -------------------------------------------------------------------------
  // Collapsed state
  // -------------------------------------------------------------------------
  if (!field.isEditing) {
    return (
      <div
        className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-4 py-3 transition-colors hover:bg-muted/50"
        onClick={() => onSetEditing(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSetEditing(true)
          }
        }}
      >
        <Badge variant="secondary" className={`shrink-0 rounded-md ${colorClass}`}>
          {typeLabel}
        </Badge>
        <span className="flex-1 text-sm">
          {field.label || <span className="text-muted-foreground italic">Untitled field</span>}
        </span>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Expanded state
  // -------------------------------------------------------------------------
  return (
    <div className="rounded-lg border border-border bg-card shadow-sm">
      {/* Header with actions */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className={`rounded-md ${colorClass}`}>
            {typeLabel}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="size-7 p-0"
            onClick={() => onSetEditing(false)}
          >
            <ChevronUpIcon className="size-4" />
          </Button>
        </div>

        <div className="flex items-center">
          <Button
            variant="outline"
            size="icon"
            className="size-8 rounded-none rounded-l-lg border-r-0"
            onClick={onDuplicate}
            title="Duplicate"
          >
            <CopyIcon className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8 rounded-none border-r-0 text-destructive hover:text-destructive"
            onClick={onRemove}
            title="Delete"
          >
            <Trash2Icon className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8 rounded-none border-r-0"
            disabled={isLast}
            onClick={() => onMove('down')}
            title="Move down"
          >
            <ArrowDownIcon className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8 rounded-none rounded-r-lg"
            disabled={isFirst}
            onClick={() => onMove('up')}
            title="Move up"
          >
            <ArrowUpIcon className="size-4" />
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-4 p-4">
        <Input
          value={field.label}
          placeholder="Field label"
          onChange={(e) => onUpdate({ label: e.target.value })}
        />

        <FieldConfigEditor
          field={field}
          formFields={formFields}
          onUpdate={onUpdate}
        />
      </div>
    </div>
  )
}
