/**
 * BuilderFieldCard — renders a single field in the form builder.
 *
 * Two states from Figma:
 * - **Editing** — white card with shadow, action bar (toggles + actions), field inputs
 * - **Closed** — collapsed display: number badge + label text + disabled answer preview
 *
 * Clicking a closed field opens it for editing.
 */
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CopyIcon,
  EllipsisIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react'

import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Switch } from './ui/switch'
import { Textarea } from './ui/textarea'
import { FIELD_TYPE } from '../hooks/use-form-builder'

import type { BuilderField, FieldType } from '../hooks/use-form-builder'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BuilderFieldCardProps {
  field: BuilderField
  index: number
  totalFields: number
  sectionClientId: string
  onUpdate: (fieldClientId: string, updates: Partial<Omit<BuilderField, 'clientId'>>) => void
  onRemove: (fieldClientId: string) => void
  onDuplicate: (fieldClientId: string) => void
  onMove: (fieldClientId: string, direction: 'up' | 'down') => void
  onSetEditing: (fieldClientId: string, editing: boolean) => void
  // Choice-specific
  onAddOption: (fieldClientId: string) => void
  onUpdateOption: (fieldClientId: string, optionIndex: number, value: string) => void
  onRemoveOption: (fieldClientId: string, optionIndex: number) => void
}

// ---------------------------------------------------------------------------
// Human-readable field type labels
// ---------------------------------------------------------------------------

const FIELD_TYPE_LABEL: Record<string, string> = {
  [FIELD_TYPE.TEXT]: 'Text',
  [FIELD_TYPE.TEXTAREA]: 'Long Text',
  [FIELD_TYPE.NUMBER]: 'Number',
  [FIELD_TYPE.DATE]: 'Date',
  [FIELD_TYPE.SELECT]: 'Choice',
  [FIELD_TYPE.MULTI_SELECT]: 'Multi Choice',
  [FIELD_TYPE.CHECKBOX]: 'Checkbox',
  [FIELD_TYPE.RATING]: 'Rating',
  [FIELD_TYPE.RANGE]: 'Range',
  [FIELD_TYPE.FILE]: 'Upload File',
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FieldActionBar({
  field,
  index,
  totalFields,
  onUpdate,
  onRemove,
  onDuplicate,
  onMove,
}: Pick<BuilderFieldCardProps, 'field' | 'index' | 'totalFields' | 'onUpdate' | 'onRemove' | 'onDuplicate' | 'onMove'>) {
  const isText = field.field_type === FIELD_TYPE.TEXT ||
    field.field_type === FIELD_TYPE.TEXTAREA ||
    field.field_type === FIELD_TYPE.NUMBER

  return (
    <div className="flex items-center justify-between border-b border-border pb-2 pl-3 pr-4">
      {/* Left: toggles + more */}
      <div className="flex items-center gap-5">
        <div className="flex items-center gap-2">
          <Switch
            size="sm"
            checked={field.is_required}
            onCheckedChange={(checked: boolean) =>
              onUpdate(field.clientId, { is_required: checked })
            }
          />
          <span className="text-sm text-blue-700">Required</span>
        </div>

        {isText && (
          <div className="flex items-center gap-2">
            <Switch
              size="sm"
              checked={field.field_type === FIELD_TYPE.TEXTAREA}
              onCheckedChange={(checked: boolean) =>
                onUpdate(field.clientId, {
                  field_type: checked ? FIELD_TYPE.TEXTAREA : FIELD_TYPE.TEXT,
                })
              }
            />
            <span className="text-sm text-blue-700">Long answer</span>
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          className="h-6 gap-1.5 rounded-lg px-2 text-xs"
        >
          <EllipsisIcon className="size-3" />
          More
        </Button>
      </div>

      {/* Right: action buttons group */}
      <div className="flex items-center">
        <Button
          variant="outline"
          size="icon"
          className="size-8 rounded-none rounded-l-lg border-r-0"
          onClick={() => onDuplicate(field.clientId)}
          title="Duplicate"
        >
          <CopyIcon className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-8 rounded-none border-r-0 text-destructive hover:text-destructive"
          onClick={() => onRemove(field.clientId)}
          title="Delete"
        >
          <Trash2Icon className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-8 rounded-none border-r-0"
          disabled={index === totalFields - 1}
          onClick={() => onMove(field.clientId, 'down')}
          title="Move down"
        >
          <ArrowDownIcon className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-8 rounded-none rounded-r-lg"
          disabled={index === 0}
          onClick={() => onMove(field.clientId, 'up')}
          title="Move up"
        >
          <ArrowUpIcon className="size-4" />
        </Button>
      </div>
    </div>
  )
}

/** The answer preview shown for text-like fields. */
function AnswerPreview({ fieldType }: { fieldType: FieldType }) {
  if (
    fieldType === FIELD_TYPE.SELECT ||
    fieldType === FIELD_TYPE.MULTI_SELECT ||
    fieldType === FIELD_TYPE.CHECKBOX
  ) {
    return null
  }

  const placeholder =
    fieldType === FIELD_TYPE.DATE
      ? 'Select a date'
      : fieldType === FIELD_TYPE.RATING
        ? 'Select a rating'
        : fieldType === FIELD_TYPE.RANGE
          ? 'Select a value'
          : fieldType === FIELD_TYPE.FILE
            ? 'Upload a file'
            : 'Enter your answer'

  return <Input disabled placeholder={placeholder} className="opacity-50" />
}

/** Choice options editor (for select/multi_select). */
function ChoiceOptionsEditor({
  field,
  onAddOption,
  onUpdateOption,
  onRemoveOption,
}: {
  field: BuilderField
  onAddOption: (fieldClientId: string) => void
  onUpdateOption: (fieldClientId: string, optionIndex: number, value: string) => void
  onRemoveOption: (fieldClientId: string, optionIndex: number) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      {field.options.map((opt, i) => (
        <div key={i} className="flex items-center gap-1">
          <Input
            value={opt}
            placeholder={`Option ${i + 1}`}
            className="max-w-80"
            onChange={(e) => onUpdateOption(field.clientId, i, e.target.value)}
          />
          {field.options.length > 2 && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-destructive"
              onClick={() => onRemoveOption(field.clientId, i)}
            >
              <Trash2Icon className="size-3.5" />
            </Button>
          )}
        </div>
      ))}

      <div className="flex items-start gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-blue-700 hover:text-blue-800"
          onClick={() => onAddOption(field.clientId)}
        >
          <PlusIcon className="size-4" />
          Add option
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-blue-700 hover:text-blue-800"
          onClick={() => {
            onAddOption(field.clientId)
            // Set the last option to 'Other' after a tick
            setTimeout(() => {
              onUpdateOption(field.clientId, field.options.length, 'Other')
            }, 0)
          }}
        >
          <PlusIcon className="size-4" />
          Add &apos;Other&apos; option
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function BuilderFieldCard({
  field,
  index,
  totalFields,
  sectionClientId: _sectionClientId,
  onUpdate,
  onRemove,
  onDuplicate,
  onMove,
  onSetEditing,
  onAddOption,
  onUpdateOption,
  onRemoveOption,
}: BuilderFieldCardProps) {
  const isChoice =
    field.field_type === FIELD_TYPE.SELECT ||
    field.field_type === FIELD_TYPE.MULTI_SELECT

  // -------------------------------------------------------------------------
  // Closed state — simple display row
  // -------------------------------------------------------------------------
  if (!field.isEditing) {
    return (
      <div
        className="flex cursor-pointer items-start gap-2 pl-2 pr-4 transition-colors hover:bg-muted/50"
        onClick={() => onSetEditing(field.clientId, true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSetEditing(field.clientId, true)
          }
        }}
      >
        <div className="flex w-[22px] shrink-0 flex-col items-start pt-1">
          <Badge variant="secondary" className="w-full justify-center rounded-lg text-xs font-semibold">
            {index + 1}
          </Badge>
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <p className="text-lg text-foreground">
            {field.label || <span className="text-muted-foreground italic">Untitled field</span>}
          </p>
          <Input disabled placeholder="Enter your answer" className="opacity-50" />
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Editing state — full card with action bar
  // -------------------------------------------------------------------------
  return (
    <div className="rounded-lg border border-border bg-card pb-4 pt-2 shadow-sm">
      <FieldActionBar
        field={field}
        index={index}
        totalFields={totalFields}
        onUpdate={onUpdate}
        onRemove={onRemove}
        onDuplicate={onDuplicate}
        onMove={onMove}
      />

      <div className="flex gap-2 pl-2 pr-4 pt-3">
        {/* Number badge */}
        <div className="flex w-[22px] shrink-0 flex-col items-start">
          <Badge variant="secondary" className="w-full justify-center rounded-lg text-xs font-semibold">
            {index + 1}
          </Badge>
        </div>

        {/* Field content */}
        <div className="flex flex-1 flex-col gap-2">
          {/* Question title input */}
          <Input
            value={field.label}
            placeholder="Question Title"
            onChange={(e) => onUpdate(field.clientId, { label: e.target.value })}
          />

          {/* Subtitle textarea (choice always shows it, text via "More") */}
          {isChoice && (
            <Textarea
              placeholder="Enter subtitle here"
              className="min-h-[76px] resize-y"
            />
          )}

          {/* Choice options */}
          {isChoice && (
            <ChoiceOptionsEditor
              field={field}
              onAddOption={onAddOption}
              onUpdateOption={onUpdateOption}
              onRemoveOption={onRemoveOption}
            />
          )}

          {/* Answer preview for non-choice fields */}
          <AnswerPreview fieldType={field.field_type} />

          {/* Type label for non-text fields (to help identify what kind of field this is) */}
          {field.field_type !== FIELD_TYPE.TEXT &&
            field.field_type !== FIELD_TYPE.TEXTAREA &&
            !isChoice && (
            <p className="text-xs text-muted-foreground">
              Type: {FIELD_TYPE_LABEL[field.field_type] ?? field.field_type}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
