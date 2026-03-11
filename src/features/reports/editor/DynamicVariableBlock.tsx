/**
 * DynamicVariableBlock — custom BlockNote block for dynamic variable references.
 *
 * Renders an inline pill showing the selected field name and section.
 * Click to change the field via a grouped select popover.
 */
import { useState } from 'react'

import { createReactBlockSpec } from '@blocknote/react'
import { SquareFunctionIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
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
// Block spec
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Render component
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DynamicVariableBlockRender(props: any) {
  const { formFields } = useFormFields()
  const [isEditing, setIsEditing] = useState(false)
  const grouped = groupBySection(formFields)

  const hasField = !!props.block.props.fieldId
  const label = props.block.props.fieldLabel
  const section = props.block.props.sectionTitle

  function handleFieldChange(fieldId: string) {
    const field = formFields.find((f) => f.id === fieldId)
    if (field) {
      props.editor.updateBlock(props.block, {
        props: {
          fieldId: field.id,
          fieldLabel: field.label,
          sectionTitle: field.sectionTitle,
        },
      })
    }
    setIsEditing(false)
  }

  return (
    <div
      className="my-1 inline-flex items-center gap-2 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/30"
      onClick={(e) => {
        e.stopPropagation()
        if (!isEditing) setIsEditing(true)
      }}
    >
      <SquareFunctionIcon className="size-4 shrink-0 text-blue-600" />

      {hasField && !isEditing ? (
        <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-sm font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
          {label} <span className="text-blue-500">({section})</span>
        </span>
      ) : isEditing ? (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Select
            value={props.block.props.fieldId}
            onValueChange={handleFieldChange}
          >
            <SelectTrigger className="h-8 w-64">
              <SelectValue placeholder="Select a form field" />
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
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={(e) => {
              e.stopPropagation()
              setIsEditing(false)
            }}
          >
            Done
          </Button>
        </div>
      ) : (
        <span className="text-sm text-muted-foreground">Click to select field</span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Block spec
// ---------------------------------------------------------------------------

export const DynamicVariableBlock = createReactBlockSpec(
  {
    type: 'dynamicVariable' as const,
    propSchema: {
      fieldId: { default: '' },
      fieldLabel: { default: '' },
      sectionTitle: { default: '' },
    },
    content: 'none' as const,
  },
  {
    render: DynamicVariableBlockRender,
  },
)
