/**
 * InlineVariable — custom BlockNote inline content for field variable mentions.
 *
 * Renders a blue chip showing the selected field label.
 * Click to configure via a popover with a grouped field picker.
 */
import { useState } from 'react'

import { createReactInlineContentSpec } from '@blocknote/react'
import { SquareFunctionIcon } from 'lucide-react'

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

// ---------------------------------------------------------------------------
// Render component
// ---------------------------------------------------------------------------

// BlockNote's createReactInlineContentSpec passes props (inlineContent.props,
// contentRef, updateInlineContent) that the React 19 hooks linter wrongly
// flags as ref accesses during render. These are plain values from BlockNote's
// API, not React refs. Suppressing per-component.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function InlineVariableRender(props: any) {
  /* eslint-disable react-hooks/refs */
  const { formFields } = useFormFields()
  const [open, setOpen] = useState(false)

  const fieldId = props.inlineContent.props.fieldId as string
  const fieldLabel = props.inlineContent.props.fieldLabel as string

  const grouped = groupBySection(formFields)
  const isConfigured = fieldId !== ''

  // updateInlineContent replaces the entire node — must pass full type + props
  function handleFieldChange(value: string) {
    const field = formFields.find((f) => f.id === value)
    if (field) {
      props.updateInlineContent({
        type: 'inlineVariable' as const,
        props: { fieldId: field.id, fieldLabel: field.label },
      })
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span
          ref={props.contentRef}
          className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-sm font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300"
          onClick={(e) => {
            e.stopPropagation()
            setOpen(true)
          }}
        >
          <SquareFunctionIcon className="size-3" />
          {isConfigured ? (
            <span>{fieldLabel}</span>
          ) : (
            <span className="text-muted-foreground">Set variable</span>
          )}
        </span>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Field
          </label>
          <Select value={fieldId} onValueChange={handleFieldChange}>
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Select a field" />
            </SelectTrigger>
            <SelectContent>
              {[...grouped.entries()].map(([sectionTitle, fields]) => (
                <SelectGroup key={sectionTitle}>
                  <SelectLabel>{sectionTitle}</SelectLabel>
                  {fields.map((field) => (
                    <SelectItem key={field.id} value={field.id}>
                      {field.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
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

export const InlineVariable = createReactInlineContentSpec(
  {
    type: 'inlineVariable' as const,
    propSchema: {
      fieldId: { default: '' },
      fieldLabel: { default: '' },
    },
    content: 'none' as const,
  },
  {
    render: InlineVariableRender,
  },
)
