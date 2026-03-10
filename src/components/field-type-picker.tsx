/**
 * FieldTypePicker — 4x2 grid of field type buttons shown when inserting a question.
 *
 * Matches the Figma "Insert New Question" screen:
 * Text, Choice, Checkbox, Date, Rating, Range, Upload File, Section
 *
 * "Section" is special — it adds a new section, not a field.
 */
import {
  CalendarIcon,
  CheckSquareIcon,
  FileUpIcon,
  ListIcon,
  SlidersHorizontalIcon,
  StarIcon,
  TextIcon,
  XIcon,
} from 'lucide-react'

import { Button } from './ui/button'
import { FIELD_TYPE } from '../hooks/use-form-builder'

import type { FieldType } from '../hooks/use-form-builder'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FieldTypePickerProps {
  onSelect: (fieldType: FieldType) => void
  onAddSection: () => void
  onCancel: () => void
}

// ---------------------------------------------------------------------------
// Field type definitions
// ---------------------------------------------------------------------------

const FIELD_TYPES: { type: FieldType; label: string; icon: typeof TextIcon }[] = [
  { type: FIELD_TYPE.TEXT, label: 'Text', icon: TextIcon },
  { type: FIELD_TYPE.SELECT, label: 'Choice', icon: ListIcon },
  { type: FIELD_TYPE.CHECKBOX, label: 'Checkbox', icon: CheckSquareIcon },
  { type: FIELD_TYPE.DATE, label: 'Date', icon: CalendarIcon },
  { type: FIELD_TYPE.RATING, label: 'Rating', icon: StarIcon },
  { type: FIELD_TYPE.RANGE, label: 'Range', icon: SlidersHorizontalIcon },
  { type: FIELD_TYPE.FILE, label: 'Upload File', icon: FileUpIcon },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FieldTypePicker({ onSelect, onAddSection, onCancel }: FieldTypePickerProps) {
  return (
    <div className="flex w-full flex-col items-start gap-3">
      <Button
        variant="secondary"
        size="sm"
        onClick={onCancel}
        className="gap-1.5"
      >
        <XIcon className="size-4" />
        Cancel insert question
      </Button>

      <div className="grid w-full grid-cols-4 gap-2">
        {FIELD_TYPES.map(({ type, label, icon: Icon }) => (
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

        {/* Section button — special case */}
        <Button
          variant="outline"
          className="flex h-auto w-full flex-col items-center gap-2 py-4"
          onClick={onAddSection}
        >
          <TextIcon className="size-5 text-muted-foreground" />
          <span className="text-sm font-medium">Section</span>
        </Button>
      </div>
    </div>
  )
}
