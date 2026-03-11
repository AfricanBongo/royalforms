/**
 * DataTableBlock — custom BlockNote block for data table configuration.
 *
 * Renders a table skeleton with configured column headers.
 * Click to configure columns via inline editor.
 */
import { useState } from 'react'

import { createReactBlockSpec } from '@blocknote/react'
import { PlusIcon, TableIcon, Trash2Icon } from 'lucide-react'

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

import { useFormFields } from './form-fields-context'
import type { FormFieldOption } from './types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TableColumn {
  fieldId: string
  label: string
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
// Block spec
// ---------------------------------------------------------------------------

export const DataTableBlock = createReactBlockSpec(
  {
    type: 'dataTable' as const,
    propSchema: {
      columns: { default: '[]' },
      groupBy: { default: 'false' },
    },
    content: 'none' as const,
  },
  {
    render: (props) => {
      const { formFields } = useFormFields()
      const [isEditing, setIsEditing] = useState(false)
      const grouped = groupBySection(formFields)

      const columns: TableColumn[] = (() => {
        try {
          return JSON.parse(props.block.props.columns) as TableColumn[]
        } catch {
          return []
        }
      })()

      const groupByEnabled = props.block.props.groupBy === 'true'

      function updateColumns(newColumns: TableColumn[]) {
        props.editor.updateBlock(props.block, {
          props: { columns: JSON.stringify(newColumns) },
        })
      }

      function updateGroupBy(value: boolean) {
        props.editor.updateBlock(props.block, {
          props: { groupBy: String(value) },
        })
      }

      function handleFieldChange(index: number, fieldId: string) {
        const matchedField = formFields.find((f) => f.id === fieldId)
        const updated = columns.map((col, i) =>
          i === index
            ? { fieldId, label: matchedField?.label ?? col.label }
            : col,
        )
        updateColumns(updated)
      }

      function handleLabelChange(index: number, label: string) {
        const updated = columns.map((col, i) =>
          i === index ? { ...col, label } : col,
        )
        updateColumns(updated)
      }

      function handleRemoveColumn(index: number) {
        updateColumns(columns.filter((_, i) => i !== index))
      }

      function handleAddColumn() {
        updateColumns([...columns, { fieldId: '', label: '' }])
      }

      return (
        <div
          className="my-1 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/30"
          onClick={(e) => {
            e.stopPropagation()
            if (!isEditing) setIsEditing(true)
          }}
        >
          {/* Preview: table skeleton */}
          <div className="flex items-center gap-2 mb-2">
            <TableIcon className="size-4 shrink-0 text-green-600" />
            <span className="text-sm font-medium text-foreground">
              Data Table
              {groupByEnabled && (
                <span className="ml-1.5 text-xs text-muted-foreground">(grouped)</span>
              )}
            </span>
          </div>

          {columns.length > 0 && (
            <div className="overflow-hidden rounded border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    {columns.map((col, i) => (
                      <th
                        key={i}
                        className="border-r border-border px-3 py-1.5 text-left text-xs font-medium text-muted-foreground last:border-r-0"
                      >
                        {col.label || '(untitled)'}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {columns.map((_, i) => (
                      <td
                        key={i}
                        className="border-r border-border px-3 py-2 text-xs text-muted-foreground/50 last:border-r-0"
                      >
                        ...
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {columns.length === 0 && !isEditing && (
            <span className="text-sm text-muted-foreground">Click to configure table columns</span>
          )}

          {/* Editing UI */}
          {isEditing && (
            <div className="mt-3 border-t border-border pt-3" onClick={(e) => e.stopPropagation()}>
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
                      onClick={() => handleRemoveColumn(index)}
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
                  onClick={handleAddColumn}
                >
                  <PlusIcon className="size-4" />
                  Add Column
                </Button>

                <div className="flex items-center gap-2 pt-1">
                  <Switch
                    checked={groupByEnabled}
                    onCheckedChange={updateGroupBy}
                  />
                  <Label className="text-sm text-muted-foreground">Group by group</Label>
                </div>

                <div className="flex justify-end">
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
              </div>
            </div>
          )}
        </div>
      )
    },
  },
)
