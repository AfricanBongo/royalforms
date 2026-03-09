/**
 * BuilderFieldCard — renders a single field in the form builder.
 *
 * Two states from Figma:
 * - **Editing** — white card with shadow, action bar (toggles + actions), field inputs
 * - **Closed** — collapsed display: number badge + label text + disabled answer preview
 *
 * Clicking a closed field opens it for editing.
 */
import { useState } from 'react'

import {
  ArrowDownIcon,
  ArrowUpIcon,
  CopyIcon,
  EllipsisIcon,
  PlusIcon,
  StarIcon,
  Trash2Icon,
} from 'lucide-react'

import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Checkbox } from './ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible'
import { Input } from './ui/input'
import { Slider } from './ui/slider'
import { Switch } from './ui/switch'
import { Textarea } from './ui/textarea'
import { FIELD_TYPE } from '../hooks/use-form-builder'

import type { BuilderField } from '../hooks/use-form-builder'

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
  showLimits,
  setShowLimits,
}: Pick<BuilderFieldCardProps, 'field' | 'index' | 'totalFields' | 'onUpdate' | 'onRemove' | 'onDuplicate' | 'onMove'> & {
  showLimits: boolean
  setShowLimits: (open: boolean) => void
}) {
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

        <CollapsibleTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-6 gap-1.5 rounded-lg px-2 text-xs"
            onClick={() => setShowLimits(!showLimits)}
          >
            <EllipsisIcon className="size-3" />
            {showLimits ? 'Less' : 'More'}
          </Button>
        </CollapsibleTrigger>
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

/** Type-specific preview shown below the field title in editing mode. */
function FieldPreview({ field }: { field: BuilderField }) {
  const rules = field.validation_rules ?? {}

  switch (field.field_type) {
    case FIELD_TYPE.TEXT:
    case FIELD_TYPE.NUMBER:
      return (
        <Input
          disabled
          placeholder={field.field_type === FIELD_TYPE.NUMBER ? 'Enter a number' : 'Enter your answer'}
          className="opacity-50"
        />
      )

    case FIELD_TYPE.TEXTAREA:
      return <Textarea disabled placeholder="Enter your answer" className="min-h-[76px] opacity-50" />

    case FIELD_TYPE.DATE:
      return <Input type="date" disabled className="w-48 opacity-50" />

    case FIELD_TYPE.RATING:
      return (
        <div className="flex gap-1">
          {Array.from({ length: 5 }, (_, i) => (
            <StarIcon key={i} className="size-5 text-muted-foreground/40" />
          ))}
        </div>
      )

    case FIELD_TYPE.RANGE: {
      const min = (rules.min_value as number) ?? 0
      const max = (rules.max_value as number) ?? 100
      return (
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{min}</span>
          <Slider disabled defaultValue={[50]} min={min} max={max} className="flex-1 opacity-50" />
          <span className="text-sm text-muted-foreground">{max}</span>
        </div>
      )
    }

    case FIELD_TYPE.FILE:
      return (
        <div className="flex h-20 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25">
          <p className="text-sm text-muted-foreground">Click or drag to upload a file</p>
        </div>
      )

    case FIELD_TYPE.CHECKBOX:
      return (
        <div className="flex items-center gap-2 opacity-50">
          <Checkbox disabled />
          <span className="text-sm text-muted-foreground">Check this box</span>
        </div>
      )

    default:
      return null
  }
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

/** Validation limits section shown when "More" is expanded. */
function FieldLimitsSection({
  field,
  onUpdate,
}: {
  field: BuilderField
  onUpdate: BuilderFieldCardProps['onUpdate']
}) {
  const rules = field.validation_rules ?? {}

  function updateRule(key: string, value: unknown) {
    const current = field.validation_rules ?? {}
    if (value === '' || value === undefined || value === null) {
      const { [key]: _, ...rest } = current
      onUpdate(field.clientId, {
        validation_rules: Object.keys(rest).length > 0 ? rest : null,
      })
    } else {
      onUpdate(field.clientId, {
        validation_rules: { ...current, [key]: value },
      })
    }
  }

  switch (field.field_type) {
    case FIELD_TYPE.TEXT:
    case FIELD_TYPE.TEXTAREA:
      return (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Min characters</label>
            <Input
              type="number"
              value={(rules.min_length as number) ?? ''}
              onChange={(e) => updateRule('min_length', e.target.value ? Number(e.target.value) : null)}
              placeholder="0"
              className="h-8 w-24"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Max characters</label>
            <Input
              type="number"
              value={(rules.max_length as number) ?? ''}
              onChange={(e) => updateRule('max_length', e.target.value ? Number(e.target.value) : null)}
              placeholder="∞"
              className="h-8 w-24"
            />
          </div>
        </>
      )

    case FIELD_TYPE.NUMBER:
      return (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Min value</label>
            <Input
              type="number"
              value={(rules.min_value as number) ?? ''}
              onChange={(e) => updateRule('min_value', e.target.value ? Number(e.target.value) : null)}
              placeholder="0"
              className="h-8 w-24"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Max value</label>
            <Input
              type="number"
              value={(rules.max_value as number) ?? ''}
              onChange={(e) => updateRule('max_value', e.target.value ? Number(e.target.value) : null)}
              placeholder="∞"
              className="h-8 w-24"
            />
          </div>
        </>
      )

    case FIELD_TYPE.DATE:
      return (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Min date</label>
            <Input
              type="date"
              value={(rules.min_date as string) ?? ''}
              onChange={(e) => updateRule('min_date', e.target.value || null)}
              className="h-8 w-40"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Max date</label>
            <Input
              type="date"
              value={(rules.max_date as string) ?? ''}
              onChange={(e) => updateRule('max_date', e.target.value || null)}
              className="h-8 w-40"
            />
          </div>
        </>
      )

    case FIELD_TYPE.FILE:
      return (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Accepted types</label>
            <Input
              type="text"
              value={(rules.accepted_types as string) ?? ''}
              onChange={(e) => updateRule('accepted_types', e.target.value || null)}
              placeholder=".pdf,.docx"
              className="h-8 w-40"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Max size (MB)</label>
            <Input
              type="number"
              value={(rules.max_size_mb as number) ?? ''}
              onChange={(e) => updateRule('max_size_mb', e.target.value ? Number(e.target.value) : null)}
              placeholder="10"
              className="h-8 w-24"
            />
          </div>
        </>
      )

    case FIELD_TYPE.RANGE:
      return (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Min value</label>
            <Input
              type="number"
              value={(rules.min_value as number) ?? ''}
              onChange={(e) => updateRule('min_value', e.target.value ? Number(e.target.value) : null)}
              placeholder="0"
              className="h-8 w-24"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Max value</label>
            <Input
              type="number"
              value={(rules.max_value as number) ?? ''}
              onChange={(e) => updateRule('max_value', e.target.value ? Number(e.target.value) : null)}
              placeholder="100"
              className="h-8 w-24"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Step</label>
            <Input
              type="number"
              value={(rules.step as number) ?? ''}
              onChange={(e) => updateRule('step', e.target.value ? Number(e.target.value) : null)}
              placeholder="1"
              className="h-8 w-24"
            />
          </div>
        </>
      )

    case FIELD_TYPE.RATING:
      return <p className="text-xs text-muted-foreground">Fixed 5-star rating</p>

    case FIELD_TYPE.SELECT:
    case FIELD_TYPE.MULTI_SELECT:
    case FIELD_TYPE.CHECKBOX:
      return <p className="text-xs text-muted-foreground">No additional limits</p>

    default:
      return <p className="text-xs text-muted-foreground">No additional limits</p>
  }
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
  const [showLimits, setShowLimits] = useState(false)

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
        <div className="flex flex-1 flex-col gap-1">
          <p className="text-lg text-foreground">
            {field.label || <span className="text-muted-foreground italic">Untitled field</span>}
          </p>
          {field.description && (
            <p className="text-sm text-muted-foreground">{field.description}</p>
          )}
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Editing state — full card with action bar
  // -------------------------------------------------------------------------
  return (
    <div className="rounded-lg border border-border bg-card pb-4 pt-2 shadow-sm">
      <Collapsible open={showLimits} onOpenChange={setShowLimits}>
        <FieldActionBar
          field={field}
          index={index}
          totalFields={totalFields}
          onUpdate={onUpdate}
          onRemove={onRemove}
          onDuplicate={onDuplicate}
          onMove={onMove}
          showLimits={showLimits}
          setShowLimits={setShowLimits}
        />

        <CollapsibleContent>
          <div className="flex flex-wrap gap-4 border-b border-border px-5 pb-3 pt-2">
            <FieldLimitsSection field={field} onUpdate={onUpdate} />
          </div>
        </CollapsibleContent>
      </Collapsible>

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

          {/* Subtitle textarea — all field types */}
          <Textarea
            value={field.description}
            placeholder="Enter subtitle here"
            className="min-h-[60px] resize-y"
            onChange={(e) => onUpdate(field.clientId, { description: e.target.value })}
          />

          {/* Choice options */}
          {isChoice && (
            <ChoiceOptionsEditor
              field={field}
              onAddOption={onAddOption}
              onUpdateOption={onUpdateOption}
              onRemoveOption={onRemoveOption}
            />
          )}

          {/* Type-specific preview */}
          <FieldPreview field={field} />
        </div>
      </div>
    </div>
  )
}
