/**
 * InlineFormula — custom BlockNote inline content for formula mentions.
 *
 * Renders a purple chip showing the aggregate function and field label.
 * Click to configure via a popover with function + field selectors.
 */
import { useState } from 'react'

import { createReactInlineContentSpec } from '@blocknote/react'
import { SigmaIcon } from 'lucide-react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { useFormFields } from './form-fields-context'
import type { FormFieldOption } from './types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AGGREGATE_FUNCTIONS = ['SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT', 'MEDIAN'] as const
type AggregateFn = (typeof AGGREGATE_FUNCTIONS)[number]

/** Field types that support numeric aggregates (SUM, AVERAGE, MIN, MAX, MEDIAN) */
const NUMERIC_FIELD_TYPES = new Set(['number', 'rating', 'range'])

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupBySection(fields: FormFieldOption[]): Map<string, FormFieldOption[]> {
  const groups = new Map<string, FormFieldOption[]>()
  for (const field of fields) {
    const existing = groups.get(field.sectionTitle)
    if (existing) {
      existing.push(field)
    } else {
      groups.set(field.sectionTitle, [field])
    }
  }
  return groups
}

function getFilteredGroups(
  grouped: Map<string, FormFieldOption[]>,
  fn: string,
): Map<string, FormFieldOption[]> {
  if (fn === 'COUNT') return grouped
  const filtered = new Map<string, FormFieldOption[]>()
  for (const [section, fields] of grouped) {
    const numericFields = fields.filter((f) => NUMERIC_FIELD_TYPES.has(f.field_type))
    if (numericFields.length > 0) {
      filtered.set(section, numericFields)
    }
  }
  return filtered
}

// ---------------------------------------------------------------------------
// Render component
// ---------------------------------------------------------------------------

// BlockNote's createReactInlineContentSpec passes props (inlineContent.props,
// contentRef, updateInlineContent) that the React 19 hooks linter wrongly
// flags as ref accesses during render. These are plain values from BlockNote's
// API, not React refs. Suppressing per-component.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function InlineFormulaRender(props: any) {
  /* eslint-disable react-hooks/refs */
  const { formFields } = useFormFields()
  const [open, setOpen] = useState(false)

  const fn = props.inlineContent.props.fn as AggregateFn
  const fieldId = props.inlineContent.props.fieldId as string
  const fieldLabel = props.inlineContent.props.fieldLabel as string

  const grouped = groupBySection(formFields)
  const isConfigured = fieldId !== ''

  // updateInlineContent replaces the entire node — must pass full type + props
  function handleFnChange(value: string) {
    const newFn = value as AggregateFn
    // If switching away from COUNT and current field is not numeric, clear the field
    if (newFn !== 'COUNT' && fieldId) {
      const field = formFields.find((f) => f.id === fieldId)
      if (field && !NUMERIC_FIELD_TYPES.has(field.field_type)) {
        props.updateInlineContent({
          type: 'inlineFormula' as const,
          props: { fn: newFn, fieldId: '', fieldLabel: '' },
        })
        return
      }
    }
    props.updateInlineContent({
      type: 'inlineFormula' as const,
      props: { fn: newFn, fieldId, fieldLabel },
    })
  }

  function handleFieldChange(value: string) {
    const field = formFields.find((f) => f.id === value)
    if (field) {
      props.updateInlineContent({
        type: 'inlineFormula' as const,
        props: { fn, fieldId: field.id, fieldLabel: field.label },
      })
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span
          ref={props.contentRef}
          className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-sm font-medium text-purple-700 dark:bg-purple-950 dark:text-purple-300"
          onClick={(e) => {
            e.stopPropagation()
            setOpen(true)
          }}
        >
          <SigmaIcon className="size-3" />
          {isConfigured ? (
            <span>{fn}({fieldLabel})</span>
          ) : (
            <span className="text-muted-foreground">Set formula</span>
          )}
        </span>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Function
          </label>
          <Select value={fn} onValueChange={handleFnChange}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AGGREGATE_FUNCTIONS.map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Field
          </label>
          <Select value={fieldId} onValueChange={handleFieldChange}>
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Select a field" />
            </SelectTrigger>
            <SelectContent>
              {[...getFilteredGroups(grouped, fn).entries()].map(
                ([sectionTitle, fields]) => (
                  <SelectGroup key={sectionTitle}>
                    <SelectLabel>{sectionTitle}</SelectLabel>
                    {fields.map((field) => (
                      <SelectItem key={field.id} value={field.id}>
                        {field.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ),
              )}
            </SelectContent>
          </Select>
        </div>
      </PopoverContent>
    </Popover>
  )
  /* eslint-enable react-hooks/refs */
}

// ---------------------------------------------------------------------------
// Inline content spec
// ---------------------------------------------------------------------------

export const InlineFormula = createReactInlineContentSpec(
  {
    type: 'inlineFormula' as const,
    propSchema: {
      fn: { default: 'SUM' },
      fieldId: { default: '' },
      fieldLabel: { default: '' },
    },
    content: 'none' as const,
  },
  {
    render: InlineFormulaRender,
  },
)
