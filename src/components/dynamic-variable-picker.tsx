/**
 * DynamicVariablePicker — single select dropdown showing form fields grouped by section.
 *
 * Used in report builder field cards for "dynamic_variable" type fields.
 * Displays fields from the linked form template, grouped by their section title.
 */
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import type { FormFieldOption } from '../hooks/use-report-builder'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DynamicVariablePickerProps {
  selectedFieldId: string | null
  onChange: (fieldId: string) => void
  formFields: FormFieldOption[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Group form fields by their section title. */
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
// Component
// ---------------------------------------------------------------------------

export function DynamicVariablePicker({ selectedFieldId, onChange, formFields }: DynamicVariablePickerProps) {
  const grouped = groupBySection(formFields)

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-sm font-medium">Source Field</Label>
      <Select value={selectedFieldId ?? ''} onValueChange={onChange}>
        <SelectTrigger className="w-full">
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
    </div>
  )
}
