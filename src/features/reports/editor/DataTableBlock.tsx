/**
 * DataTableBlock — custom BlockNote block for data table configuration.
 *
 * Renders a table skeleton with configured column headers.
 * Click to configure columns via inline editor.
 * Supports two column modes:
 *   - "field": direct reference to a form field
 *   - "formula": an inline formula expression evaluated per-group
 */
import { useState } from 'react'

import { createReactBlockSpec } from '@blocknote/react'
import { CalculatorIcon, PlusIcon, TableIcon, Trash2Icon, XIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import type { FormFieldOption, FormulaBlock as FormulaBlockType } from './types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AGGREGATE_FUNCTIONS = ['SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT', 'MEDIAN'] as const
const OPERATORS = ['+', '-', '*', '/'] as const

/** Field types that support numeric aggregates (SUM, AVERAGE, MIN, MAX, MEDIAN) */
const NUMERIC_FIELD_TYPES = new Set(['number', 'rating', 'range'])

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FieldColumn {
  mode: 'field'
  fieldId: string
  label: string
}

interface FormulaColumn {
  mode: 'formula'
  formulaBlocks: FormulaBlockType[]
  label: string
}

type TableColumn = FieldColumn | FormulaColumn

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

/** Migrate legacy columns (no mode) to new format */
function normalizeColumns(raw: unknown[]): TableColumn[] {
  return raw.map((col) => {
    const c = col as Record<string, unknown>
    if (c.mode === 'formula') {
      return {
        mode: 'formula' as const,
        formulaBlocks: (c.formulaBlocks ?? []) as FormulaBlockType[],
        label: String(c.label ?? ''),
      }
    }
    // Legacy or field mode
    return {
      mode: 'field' as const,
      fieldId: String(c.fieldId ?? ''),
      label: String(c.label ?? ''),
    }
  })
}

function buildFormulaExpression(blocks: FormulaBlockType[], formFields: FormFieldOption[]): string {
  if (blocks.length === 0) return ''
  return blocks
    .map((block) => {
      switch (block.kind) {
        case 'aggregate': {
          const field = formFields.find((f) => f.id === block.fieldId)
          return `${block.fn}(${field?.label ?? block.fieldId})`
        }
        case 'operator':
          return ` ${block.op} `
        case 'literal':
          return String(block.value)
      }
    })
    .join('')
}

// ---------------------------------------------------------------------------
// Render component (PascalCase to satisfy eslint react-hooks rules)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DataTableBlockRender(props: any) {
  const { formFields } = useFormFields()
  const [isEditing, setIsEditing] = useState(false)
  const grouped = groupBySection(formFields)

  const columns: TableColumn[] = (() => {
    try {
      const raw = JSON.parse(props.block.props.columns) as unknown[]
      return normalizeColumns(raw)
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

  function handleRemoveColumn(index: number) {
    updateColumns(columns.filter((_, i) => i !== index))
  }

  function handleAddFieldColumn() {
    updateColumns([...columns, { mode: 'field', fieldId: '', label: '' }])
  }

  function handleAddFormulaColumn() {
    updateColumns([...columns, { mode: 'formula', formulaBlocks: [], label: '' }])
  }

  // Field column handlers
  function handleFieldChange(index: number, fieldId: string) {
    const col = columns[index]
    if (col.mode !== 'field') return
    const matchedField = formFields.find((f) => f.id === fieldId)
    const updated = columns.map((c, i) =>
      i === index
        ? { ...c, mode: 'field' as const, fieldId, label: matchedField?.label ?? c.label }
        : c,
    )
    updateColumns(updated)
  }

  function handleLabelChange(index: number, label: string) {
    const updated = columns.map((c, i) =>
      i === index ? { ...c, label } : c,
    )
    updateColumns(updated)
  }

  // Formula column handlers
  function handleFormulaBlocksChange(index: number, newBlocks: FormulaBlockType[]) {
    const col = columns[index]
    if (col.mode !== 'formula') return
    const updated = columns.map((c, i) =>
      i === index ? { ...c, formulaBlocks: newBlocks } : c,
    )
    updateColumns(updated)
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
                    <span className="flex items-center gap-1">
                      {col.mode === 'formula' && (
                        <CalculatorIcon className="size-3 text-orange-600" />
                      )}
                      {col.label || '(untitled)'}
                    </span>
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
              <div key={index} className="flex items-start gap-2">
                {col.mode === 'field' ? (
                  /* Field column */
                  <>
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
                  </>
                ) : (
                  /* Formula column */
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <CalculatorIcon className="size-4 shrink-0 text-orange-600" />
                      <Input
                        value={col.label}
                        placeholder="Formula column label"
                        className="flex-1"
                        onChange={(e) => handleLabelChange(index, e.target.value)}
                      />
                    </div>
                    <InlineFormulaEditor
                      blocks={col.formulaBlocks}
                      formFields={formFields}
                      grouped={grouped}
                      onChange={(newBlocks) => handleFormulaBlocksChange(index, newBlocks)}
                    />
                  </div>
                )}

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

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 self-start text-blue-700 hover:text-blue-800"
                >
                  <PlusIcon className="size-4" />
                  Add Column
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={handleAddFieldColumn}>
                  Field Column
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleAddFormulaColumn}>
                  Formula Column
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

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
}

// ---------------------------------------------------------------------------
// Inline formula editor for table columns (compact version)
// ---------------------------------------------------------------------------

function InlineFormulaEditor({
  blocks,
  formFields,
  grouped,
  onChange,
}: {
  blocks: FormulaBlockType[]
  formFields: FormFieldOption[]
  grouped: Map<string, FormFieldOption[]>
  onChange: (blocks: FormulaBlockType[]) => void
}) {
  function getFilteredGroups(fn: string): Map<string, FormFieldOption[]> {
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

  const expression = buildFormulaExpression(blocks, formFields)

  return (
    <div className="rounded-md border border-dashed border-border bg-background/50 p-2">
      {expression && (
        <code className="mb-2 block text-xs font-mono text-muted-foreground">= {expression}</code>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {blocks.map((block, index) => {
          switch (block.kind) {
            case 'aggregate':
              return (
                <div key={index} className="flex items-center gap-1 rounded border border-border bg-background p-0.5">
                  <Select
                    value={block.fn}
                    onValueChange={(value) => {
                      const newFn = value as typeof block.fn
                      if (newFn !== 'COUNT' && block.fieldId) {
                        const field = formFields.find((f) => f.id === block.fieldId)
                        if (field && !NUMERIC_FIELD_TYPES.has(field.field_type)) {
                          onChange(blocks.map((b, i) => i === index ? { ...b, fn: newFn, fieldId: '' } : b))
                          return
                        }
                      }
                      onChange(blocks.map((b, i) => i === index ? { ...b, fn: newFn } : b))
                    }}
                  >
                    <SelectTrigger className="h-6 w-20 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AGGREGATE_FUNCTIONS.map((fn) => (
                        <SelectItem key={fn} value={fn}>{fn}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={block.fieldId}
                    onValueChange={(value) =>
                      onChange(blocks.map((b, i) => i === index ? { ...b, fieldId: value } : b))
                    }
                  >
                    <SelectTrigger className="h-6 w-40 text-xs">
                      <SelectValue placeholder="Field">
                        {formFields.find((f) => f.id === block.fieldId)?.label ?? 'Field'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {[...getFilteredGroups(block.fn).entries()].map(([sectionTitle, fields]) => (
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
                  <Button variant="ghost" size="icon" className="size-5 text-muted-foreground hover:text-destructive" onClick={() => onChange(blocks.filter((_, i) => i !== index))}>
                    <XIcon className="size-2.5" />
                  </Button>
                </div>
              )
            case 'operator':
              return (
                <div key={index} className="flex items-center gap-1 rounded border border-border bg-background p-0.5">
                  <Select
                    value={block.op}
                    onValueChange={(value) =>
                      onChange(blocks.map((b, i) => i === index ? { ...b, op: value as typeof block.op } : b))
                    }
                  >
                    <SelectTrigger className="h-6 w-12 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OPERATORS.map((op) => (
                        <SelectItem key={op} value={op}>{op}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" className="size-5 text-muted-foreground hover:text-destructive" onClick={() => onChange(blocks.filter((_, i) => i !== index))}>
                    <XIcon className="size-2.5" />
                  </Button>
                </div>
              )
            case 'literal':
              return (
                <div key={index} className="flex items-center gap-1 rounded border border-border bg-background p-0.5">
                  <Input
                    type="number"
                    value={block.value}
                    className="h-6 w-16 text-xs"
                    onChange={(e) =>
                      onChange(blocks.map((b, i) => i === index ? { ...b, value: Number(e.target.value) || 0 } : b))
                    }
                  />
                  <Button variant="ghost" size="icon" className="size-5 text-muted-foreground hover:text-destructive" onClick={() => onChange(blocks.filter((_, i) => i !== index))}>
                    <XIcon className="size-2.5" />
                  </Button>
                </div>
              )
          }
        })}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-6 gap-1 px-2 text-xs">
              <PlusIcon className="size-3" />
              Add
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => onChange([...blocks, { kind: 'aggregate', fn: 'SUM', fieldId: '' }])}>
              Aggregate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onChange([...blocks, { kind: 'operator', op: '+' }])}>
              Operator
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onChange([...blocks, { kind: 'literal', value: 0 }])}>
              Number
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
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
    render: DataTableBlockRender,
  },
)
