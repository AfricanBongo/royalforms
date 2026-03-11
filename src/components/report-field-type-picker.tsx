/**
 * ReportFieldTypePicker — grid of report field type buttons shown when inserting a field.
 *
 * Mirrors the form builder FieldTypePicker pattern but with report-specific field types:
 * Formula, Dynamic Variable, Table, Static Text + Add Section.
 */
import {
  CalculatorIcon,
  LayoutTemplateIcon,
  SquareFunctionIcon,
  TableIcon,
  TypeIcon,
  XIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { REPORT_FIELD_TYPE } from '../hooks/use-report-builder'

import type { ReportFieldType } from '../hooks/use-report-builder'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReportFieldTypePickerProps {
  onSelect: (fieldType: ReportFieldType) => void
  onAddSection: () => void
  onCancel: () => void
}

// ---------------------------------------------------------------------------
// Field type definitions
// ---------------------------------------------------------------------------

const REPORT_FIELD_TYPES: { type: ReportFieldType; label: string; icon: typeof CalculatorIcon }[] = [
  { type: REPORT_FIELD_TYPE.FORMULA, label: 'Formula', icon: CalculatorIcon },
  { type: REPORT_FIELD_TYPE.DYNAMIC_VARIABLE, label: 'Dynamic Variable', icon: SquareFunctionIcon },
  { type: REPORT_FIELD_TYPE.TABLE, label: 'Table', icon: TableIcon },
  { type: REPORT_FIELD_TYPE.STATIC_TEXT, label: 'Static Text', icon: TypeIcon },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReportFieldTypePicker({ onSelect, onAddSection, onCancel }: ReportFieldTypePickerProps) {
  return (
    <div className="flex w-full flex-col items-start gap-3">
      <Button
        variant="secondary"
        size="sm"
        onClick={onCancel}
        className="gap-1.5"
      >
        <XIcon className="size-4" />
        Cancel insert field
      </Button>

      <div className="grid w-full grid-cols-4 gap-2">
        {REPORT_FIELD_TYPES.map(({ type, label, icon: Icon }) => (
          <Button
            key={type}
            variant="outline"
            className="flex h-auto w-full flex-col items-center gap-2 py-4"
            onClick={() => onSelect(type)}
          >
            <Icon className="size-5 text-muted-foreground" />
            <span className="text-sm font-medium">{label}</span>
          </Button>
        ))}
      </div>

      <Button
        variant="outline"
        className="flex h-auto w-full flex-col items-center gap-2 py-4"
        onClick={onAddSection}
      >
        <LayoutTemplateIcon className="size-5 text-muted-foreground" />
        <span className="text-sm font-medium">Add Section</span>
      </Button>
    </div>
  )
}
