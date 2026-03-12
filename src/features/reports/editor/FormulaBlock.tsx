/**
 * FormulaBlock — custom BlockNote block for formula expressions.
 *
 * Renders a styled card showing the formula expression.
 * Click to expand inline config with the visual block builder
 * (aggregate function + field picker, operators, literal numbers).
 */
import { useState } from 'react'

import { createReactBlockSpec } from '@blocknote/react'
import { CalculatorIcon, PlusIcon, XIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

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

function buildExpression(blocks: FormulaBlockType[], formFields: FormFieldOption[]): string {
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
function FormulaBlockRender(props: any) {
  const { formFields } = useFormFields()
  const [isEditing, setIsEditing] = useState(false)

  const blocks: FormulaBlockType[] = (() => {
    try {
      return JSON.parse(props.block.props.formulaBlocks) as FormulaBlockType[]
    } catch {
      return []
    }
  })()

  const expression = buildExpression(blocks, formFields)

  function updateBlocks(newBlocks: FormulaBlockType[]) {
    props.editor.updateBlock(props.block, {
      props: { formulaBlocks: JSON.stringify(newBlocks) },
    })
  }

  function handleUpdate(index: number, updated: FormulaBlockType) {
    const next = blocks.map((b, i) => (i === index ? updated : b))
    updateBlocks(next)
  }

  function handleRemove(index: number) {
    updateBlocks(blocks.filter((_, i) => i !== index))
  }

  return (
    <div
      className="my-1 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/30"
      onClick={(e) => {
        e.stopPropagation()
        if (!isEditing) setIsEditing(true)
      }}
    >
      {/* Preview row */}
      <div className="flex items-center gap-2">
        <CalculatorIcon className="size-4 shrink-0 text-orange-600" />
        {expression ? (
          <code className="text-sm font-mono text-foreground">= {expression}</code>
        ) : (
          <span className="text-sm text-muted-foreground">Click to configure formula</span>
        )}
      </div>

      {/* Editing UI */}
      {isEditing && (
        <div className="mt-3 border-t border-border pt-3">
          <FormulaEditor
            blocks={blocks}
            formFields={formFields}
            onUpdate={handleUpdate}
            onRemove={handleRemove}
            onAdd={(block) => updateBlocks([...blocks, block])}
          />
          <div className="mt-2 flex justify-end">
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
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Block spec
// ---------------------------------------------------------------------------

export const FormulaBlock = createReactBlockSpec(
  {
    type: 'formula' as const,
    propSchema: {
      formulaBlocks: { default: '[]' },
    },
    content: 'none' as const,
  },
  {
    render: FormulaBlockRender,
  },
)

// ---------------------------------------------------------------------------
// Formula editor sub-component
// ---------------------------------------------------------------------------

function FormulaEditor({
  blocks,
  formFields,
  onUpdate,
  onRemove,
  onAdd,
}: {
  blocks: FormulaBlockType[]
  formFields: FormFieldOption[]
  onUpdate: (index: number, updated: FormulaBlockType) => void
  onRemove: (index: number) => void
  onAdd: (block: FormulaBlockType) => void
}) {
  const grouped = groupBySection(formFields)

  /** Filter fields based on aggregate function — COUNT shows all, others only numeric types */
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

  return (
    <div className="flex flex-wrap items-center gap-2">
      {blocks.map((block, index) => {
        switch (block.kind) {
          case 'aggregate':
            return (
              <div key={index} className="flex items-center gap-1 rounded-md border border-border bg-background p-1">
                <Select
                  value={block.fn}
                  onValueChange={(value) => {
                    const newFn = value as typeof block.fn
                    // If switching away from COUNT and current field is not numeric, clear it
                    if (newFn !== 'COUNT' && block.fieldId) {
                      const field = formFields.find((f) => f.id === block.fieldId)
                      if (field && !NUMERIC_FIELD_TYPES.has(field.field_type)) {
                        onUpdate(index, { ...block, fn: newFn, fieldId: '' })
                        return
                      }
                    }
                    onUpdate(index, { ...block, fn: newFn })
                  }}
                >
                  <SelectTrigger className="h-7 w-24 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AGGREGATE_FUNCTIONS.map((fn) => (
                      <SelectItem key={fn} value={fn}>
                        {fn}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={block.fieldId}
                  onValueChange={(value) =>
                    onUpdate(index, { ...block, fieldId: value })
                  }
                >
                  <SelectTrigger className="h-7 w-48 text-xs">
                    <SelectValue placeholder="Select field">
                      {formFields.find((f) => f.id === block.fieldId)?.label ?? 'Select field'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {[...getFilteredGroups(block.fn).entries()].map(([sectionTitle, fields]) => (
                      <SelectGroup key={sectionTitle}>
                        <SelectLabel>{sectionTitle}</SelectLabel>
                        {fields.map((field) => (
                          <SelectItem key={field.id} value={field.id}>
                            {field.label}
                            <span className="ml-1 text-muted-foreground">({field.field_type})</span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => onRemove(index)}
                    >
                      <XIcon className="size-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Remove</TooltipContent>
                </Tooltip>
              </div>
            )
          case 'operator':
            return (
              <div key={index} className="flex items-center gap-1 rounded-md border border-border bg-background p-1">
                <Select
                  value={block.op}
                  onValueChange={(value) =>
                    onUpdate(index, { ...block, op: value as typeof block.op })
                  }
                >
                  <SelectTrigger className="h-7 w-14 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPERATORS.map((op) => (
                      <SelectItem key={op} value={op}>
                        {op}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => onRemove(index)}
                    >
                      <XIcon className="size-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Remove</TooltipContent>
                </Tooltip>
              </div>
            )
          case 'literal':
            return (
              <div key={index} className="flex items-center gap-1 rounded-md border border-border bg-background p-1">
                <Input
                  type="number"
                  value={block.value}
                  className="h-7 w-20 text-xs"
                  onChange={(e) =>
                    onUpdate(index, { ...block, value: Number(e.target.value) || 0 })
                  }
                />

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => onRemove(index)}
                    >
                      <XIcon className="size-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Remove</TooltipContent>
                </Tooltip>
              </div>
            )
        }
      })}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <PlusIcon className="size-3.5" />
            Add Block
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => onAdd({ kind: 'aggregate', fn: 'SUM', fieldId: '' })}>
            Aggregate Function
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAdd({ kind: 'operator', op: '+' })}>
            Operator
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAdd({ kind: 'literal', value: 0 })}>
            Number
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
