/**
 * TableColumnConfig — repeatable row list for configuring table columns.
 *
 * Each row: form field select + editable column label + remove button.
 * Bottom: "Add Column" button + "Group by group" toggle.
 */
import { PlusIcon, Trash2Icon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { Switch } from '@/components/ui/switch'

import type { FormFieldOption } from '../hooks/use-report-builder'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TableColumnConfigProps {
  columns: { fieldId: string; label: string }[]
  onChange: (columns: { fieldId: string; label: string }[]) => void
  groupBy: boolean
  onGroupByChange: (value: boolean) => void
  formFields: FormFieldOption[]
}

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
// Component
// ---------------------------------------------------------------------------

export function TableColumnConfig({
  columns,
  onChange,
  groupBy,
  onGroupByChange,
  formFields,
}: TableColumnConfigProps) {
  const grouped = groupBySection(formFields)

  function handleFieldChange(index: number, fieldId: string) {
    const matchedField = formFields.find((f) => f.id === fieldId)
    const updated = columns.map((col, i) =>
      i === index
        ? { fieldId, label: matchedField?.label ?? col.label }
        : col,
    )
    onChange(updated)
  }

  function handleLabelChange(index: number, label: string) {
    const updated = columns.map((col, i) =>
      i === index ? { ...col, label } : col,
    )
    onChange(updated)
  }

  function handleRemove(index: number) {
    onChange(columns.filter((_, i) => i !== index))
  }

  function handleAdd() {
    onChange([...columns, { fieldId: '', label: '' }])
  }

  return (
    <div className="flex flex-col gap-3">
      {columns.map((col, index) => (
        <div key={index} className="flex items-center gap-2">
          <Select
            value={col.fieldId}
            onValueChange={(value) => handleFieldChange(index, value)}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Select field" />
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

          <Input
            value={col.label}
            placeholder="Column label"
            className="flex-1"
            onChange={(e) => handleLabelChange(index, e.target.value)}
          />

          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => handleRemove(index)}
            title="Remove column"
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      ))}

      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 self-start text-blue-700 hover:text-blue-800"
        onClick={handleAdd}
      >
        <PlusIcon className="size-4" />
        Add Column
      </Button>

      <div className="flex items-center gap-2 pt-1">
        <Switch
          checked={groupBy}
          onCheckedChange={onGroupByChange}
        />
        <Label className="text-sm text-muted-foreground">Group by group</Label>
      </div>
    </div>
  )
}
