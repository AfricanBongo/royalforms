import { Star } from 'lucide-react'

import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'

import type { InstanceField } from '../../services/form-templates'

interface InstanceFieldInputProps {
  field: InstanceField
  value: string | null
  disabled: boolean
  onChange: (value: string | null) => void
  onBlur: () => void
}

export function InstanceFieldInput({
  field,
  value,
  disabled,
  onChange,
  onBlur,
}: InstanceFieldInputProps) {
  const rules = field.validation_rules ?? {}

  switch (field.field_type) {
    case 'text':
      return (
        <Input
          value={value ?? ''}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value || null)}
          onBlur={onBlur}
        />
      )

    case 'textarea':
      return (
        <Textarea
          value={value ?? ''}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value || null)}
          onBlur={onBlur}
        />
      )

    case 'number':
      return (
        <Input
          type="number"
          value={value ?? ''}
          disabled={disabled}
          min={rules.min_value != null ? Number(rules.min_value) : undefined}
          max={rules.max_value != null ? Number(rules.max_value) : undefined}
          onChange={(e) => onChange(e.target.value || null)}
          onBlur={onBlur}
        />
      )

    case 'date':
      return (
        <Input
          type="date"
          value={value ?? ''}
          disabled={disabled}
          min={
            typeof rules.min_date === 'string' ? rules.min_date : undefined
          }
          max={
            typeof rules.max_date === 'string' ? rules.max_date : undefined
          }
          onChange={(e) => onChange(e.target.value || null)}
          onBlur={onBlur}
        />
      )

    case 'select':
      return (
        <Select
          value={value ?? ''}
          disabled={disabled}
          onValueChange={(v) => {
            onChange(v || null)
            // Trigger blur after selection for auto-save
            onBlur()
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select an option" />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )

    case 'multi_select':
      return <MultiSelectInput field={field} value={value} disabled={disabled} onChange={onChange} onBlur={onBlur} />

    case 'checkbox':
      return (
        <div className="flex items-center gap-2">
          <Checkbox
            checked={value === 'true'}
            disabled={disabled}
            onCheckedChange={(checked) => {
              onChange(checked === true ? 'true' : 'false')
              onBlur()
            }}
          />
        </div>
      )

    case 'rating':
      return <RatingInput value={value} disabled={disabled} onChange={onChange} onBlur={onBlur} />

    case 'range':
      return <RangeInput rules={rules} value={value} disabled={disabled} onChange={onChange} onBlur={onBlur} />

    case 'file':
      return (
        <div className="flex h-9 w-full items-center rounded-md border border-input bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          File upload coming soon
        </div>
      )

    default:
      return (
        <p className="text-sm text-muted-foreground">
          Unsupported field type
        </p>
      )
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MultiSelectInput({
  field,
  value,
  disabled,
  onChange,
  onBlur,
}: {
  field: InstanceField
  value: string | null
  disabled: boolean
  onChange: (value: string | null) => void
  onBlur: () => void
}) {
  const selected = value ? value.split(',').filter(Boolean) : []

  function toggle(option: string) {
    const next = selected.includes(option)
      ? selected.filter((s) => s !== option)
      : [...selected, option]

    onChange(next.length > 0 ? next.join(',') : null)
    onBlur()
  }

  return (
    <div className="flex flex-col gap-2">
      {(field.options ?? []).map((option) => (
        <label
          key={option}
          className="flex items-center gap-2 text-sm"
        >
          <Checkbox
            checked={selected.includes(option)}
            disabled={disabled}
            onCheckedChange={() => toggle(option)}
          />
          {option}
        </label>
      ))}
    </div>
  )
}

function RatingInput({
  value,
  disabled,
  onChange,
  onBlur,
}: {
  value: string | null
  disabled: boolean
  onChange: (value: string | null) => void
  onBlur: () => void
}) {
  const current = value != null ? Number(value) : 0

  function handleClick(star: number) {
    if (disabled) return
    // Click same star → deselect
    onChange(current === star ? null : String(star))
    onBlur()
  }

  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={disabled}
          className="p-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => handleClick(star)}
        >
          <Star
            className={`size-5 ${
              star <= current
                ? 'fill-yellow-400 text-yellow-400'
                : 'fill-none text-muted-foreground'
            }`}
          />
        </button>
      ))}
    </div>
  )
}

function RangeInput({
  rules,
  value,
  disabled,
  onChange,
  onBlur,
}: {
  rules: Record<string, unknown>
  value: string | null
  disabled: boolean
  onChange: (value: string | null) => void
  onBlur: () => void
}) {
  const min = rules.min_value != null ? Number(rules.min_value) : 0
  const max = rules.max_value != null ? Number(rules.max_value) : 100
  const step = rules.step != null ? Number(rules.step) : 1
  const current = value != null ? Number(value) : min

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground w-8 text-right">
        {current}
      </span>
      <Slider
        value={[current]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={(vals) => {
          onChange(String(vals[0]))
        }}
        onValueCommit={() => onBlur()}
        className="flex-1"
      />
    </div>
  )
}
