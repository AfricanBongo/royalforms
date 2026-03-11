/**
 * FormulaBlockBuilder — visual row-based formula editor.
 *
 * Renders a flex-wrap container of inline blocks:
 * [SUM v] [Form Field v]  [+]  [AVG v] [Form Field v]  [x]  [100]  [+ Add Block]
 *
 * Block types:
 * - Aggregate: function select + form field combobox
 * - Operator: operator select (+, -, *, /)
 * - Literal: number input
 */
import { PlusIcon, XIcon } from 'lucide-react'

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

import type { FormFieldOption, FormulaBlock } from '../hooks/use-report-builder'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FormulaBlockBuilderProps {
  blocks: FormulaBlock[]
  onChange: (blocks: FormulaBlock[]) => void
  formFields: FormFieldOption[]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AGGREGATE_FUNCTIONS = ['SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT', 'MEDIAN'] as const
const OPERATORS = ['+', '-', '*', '/'] as const

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
// Sub-components
// ---------------------------------------------------------------------------

function AggregateBlock({
  block,
  index,
  formFields,
  grouped,
  onUpdate,
  onRemove,
}: {
  block: FormulaBlock & { kind: 'aggregate' }
  index: number
  formFields: FormFieldOption[]
  grouped: Map<string, FormFieldOption[]>
  onUpdate: (index: number, updated: FormulaBlock) => void
  onRemove: (index: number) => void
}) {
  const selectedField = formFields.find((f) => f.id === block.fieldId)

  return (
    <div className="flex items-center gap-1 rounded-md border border-border bg-card p-1">
      <Select
        value={block.fn}
        onValueChange={(value) =>
          onUpdate(index, { ...block, fn: value as typeof block.fn })
        }
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
            {selectedField
              ? `${selectedField.label} (${selectedField.sectionTitle})`
              : 'Select field'}
          </SelectValue>
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
        size="icon"
        className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={() => onRemove(index)}
      >
        <XIcon className="size-3" />
      </Button>
    </div>
  )
}

function OperatorBlock({
  block,
  index,
  onUpdate,
  onRemove,
}: {
  block: FormulaBlock & { kind: 'operator' }
  index: number
  onUpdate: (index: number, updated: FormulaBlock) => void
  onRemove: (index: number) => void
}) {
  return (
    <div className="flex items-center gap-1 rounded-md border border-border bg-card p-1">
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

      <Button
        variant="ghost"
        size="icon"
        className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={() => onRemove(index)}
      >
        <XIcon className="size-3" />
      </Button>
    </div>
  )
}

function LiteralBlock({
  block,
  index,
  onUpdate,
  onRemove,
}: {
  block: FormulaBlock & { kind: 'literal' }
  index: number
  onUpdate: (index: number, updated: FormulaBlock) => void
  onRemove: (index: number) => void
}) {
  return (
    <div className="flex items-center gap-1 rounded-md border border-border bg-card p-1">
      <Input
        type="number"
        value={block.value}
        className="h-7 w-20 text-xs"
        onChange={(e) =>
          onUpdate(index, { ...block, value: Number(e.target.value) || 0 })
        }
      />

      <Button
        variant="ghost"
        size="icon"
        className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={() => onRemove(index)}
      >
        <XIcon className="size-3" />
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function FormulaBlockBuilder({ blocks, onChange, formFields }: FormulaBlockBuilderProps) {
  const grouped = groupBySection(formFields)

  function handleUpdate(index: number, updated: FormulaBlock) {
    const next = blocks.map((b, i) => (i === index ? updated : b))
    onChange(next)
  }

  function handleRemove(index: number) {
    onChange(blocks.filter((_, i) => i !== index))
  }

  function handleAddAggregate() {
    onChange([...blocks, { kind: 'aggregate', fn: 'SUM', fieldId: '' }])
  }

  function handleAddOperator() {
    onChange([...blocks, { kind: 'operator', op: '+' }])
  }

  function handleAddLiteral() {
    onChange([...blocks, { kind: 'literal', value: 0 }])
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {blocks.map((block, index) => {
        switch (block.kind) {
          case 'aggregate':
            return (
              <AggregateBlock
                key={index}
                block={block}
                index={index}
                formFields={formFields}
                grouped={grouped}
                onUpdate={handleUpdate}
                onRemove={handleRemove}
              />
            )
          case 'operator':
            return (
              <OperatorBlock
                key={index}
                block={block}
                index={index}
                onUpdate={handleUpdate}
                onRemove={handleRemove}
              />
            )
          case 'literal':
            return (
              <LiteralBlock
                key={index}
                block={block}
                index={index}
                onUpdate={handleUpdate}
                onRemove={handleRemove}
              />
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
          <DropdownMenuItem onClick={handleAddAggregate}>
            Aggregate Function
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleAddOperator}>
            Operator
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleAddLiteral}>
            Number
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
