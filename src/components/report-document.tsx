/**
 * Report Document — renders a report instance's data_snapshot as a
 * document-style layout for viewing/printing.
 */
import { useState } from 'react'

import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react'

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Separator } from '../components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReportDocumentProps {
  templateName: string
  readableId: string
  createdAt: string
  createdByName: string
  dataSnapshot: Record<string, unknown>
  formInstancesIncluded: string[]
}

/** Structure stored inside data_snapshot.sections */
interface SnapshotSection {
  title: string
  description?: string | null
  fields: SnapshotField[]
}

interface SnapshotField {
  label: string
  field_type: string
  value: unknown
}

interface TableValue {
  columns: string[]
  rows: unknown[][]
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

function isSnapshotSection(v: unknown): v is SnapshotSection {
  if (typeof v !== 'object' || v === null) return false
  const obj = v as Record<string, unknown>
  return typeof obj.title === 'string' && Array.isArray(obj.fields)
}

function isTableValue(v: unknown): v is TableValue {
  if (typeof v !== 'object' || v === null) return false
  const obj = v as Record<string, unknown>
  return Array.isArray(obj.columns) && Array.isArray(obj.rows)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReportDocument({
  templateName,
  readableId,
  createdAt,
  createdByName,
  dataSnapshot,
  formInstancesIncluded,
}: ReportDocumentProps) {
  const formattedDate = new Date(createdAt).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  // Parse sections defensively
  const rawSections = (dataSnapshot?.sections ?? []) as unknown[]
  const sections = rawSections.filter(isSnapshotSection)

  return (
    <div className="mx-auto w-full max-w-[816px] rounded-lg border border-border bg-white p-8 shadow-sm">
      {/* Header */}
      <h1 className="text-2xl font-bold text-foreground">{templateName}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{readableId}</p>
      <p className="mt-2 text-sm text-muted-foreground">
        Generated on {formattedDate} &middot; Created by {createdByName}
      </p>

      <Separator className="my-6" />

      {/* Sections */}
      {sections.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">
          No data available in this report.
        </p>
      ) : (
        sections.map((section, sIdx) => (
          <SectionBlock key={sIdx} section={section} isLast={sIdx === sections.length - 1} />
        ))
      )}

      {/* Form instances included */}
      {formInstancesIncluded.length > 0 && (
        <>
          <Separator className="my-6" />
          <FormInstancesCollapsible ids={formInstancesIncluded} />
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

function SectionBlock({
  section,
  isLast,
}: {
  section: SnapshotSection
  isLast: boolean
}) {
  return (
    <div className="mb-6 last:mb-0">
      <h2 className="text-lg font-semibold text-foreground">{section.title}</h2>
      {section.description && (
        <p className="mt-1 text-sm text-muted-foreground">
          {section.description}
        </p>
      )}

      <div className="mt-4 space-y-0">
        {section.fields.map((field, fIdx) => (
          <FieldRenderer key={fIdx} field={field} />
        ))}
      </div>

      {!isLast && <Separator className="mt-6" />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Field renderer
// ---------------------------------------------------------------------------

function FieldRenderer({ field }: { field: SnapshotField }) {
  const fieldType = field.field_type ?? ''

  if (fieldType === 'table') {
    return <TableField label={field.label} value={field.value} />
  }

  if (fieldType === 'static_text') {
    return <StaticTextField label={field.label} value={field.value} />
  }

  // Default: formula / dynamic_variable / anything else — key-value row
  return <KeyValueField label={field.label} value={field.value} />
}

function KeyValueField({ label, value }: { label: string; value: unknown }) {
  const displayValue = value != null ? String(value) : '\u2014'

  return (
    <>
      <div className="flex items-center justify-between py-3">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-right text-lg text-foreground">{displayValue}</span>
      </div>
      <Separator />
    </>
  )
}

function TableField({ label, value }: { label: string; value: unknown }) {
  if (!isTableValue(value)) {
    return <KeyValueField label={label} value="[Invalid table data]" />
  }

  return (
    <div className="py-3">
      <p className="mb-2 text-sm font-medium text-foreground">{label}</p>
      <div className="overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {value.columns.map((col, i) => (
                <TableHead key={i}>{String(col)}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {value.rows.map((row, rIdx) => (
              <TableRow key={rIdx}>
                {(row as unknown[]).map((cell, cIdx) => (
                  <TableCell key={cIdx}>{cell != null ? String(cell) : '\u2014'}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Separator className="mt-3" />
    </div>
  )
}

function StaticTextField({ label, value }: { label: string; value: unknown }) {
  const text = typeof value === 'string' ? value : String(value ?? '')

  return (
    <div className="py-3">
      <p className="mb-1 text-sm font-medium text-foreground">{label}</p>
      <p className="whitespace-pre-wrap text-sm text-muted-foreground">{text}</p>
      <Separator className="mt-3" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Form instances collapsible
// ---------------------------------------------------------------------------

function FormInstancesCollapsible({ ids }: { ids: string[] }) {
  const [open, setOpen] = useState(false)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
        {open ? (
          <ChevronDownIcon className="size-4" />
        ) : (
          <ChevronRightIcon className="size-4" />
        )}
        Form instances included ({ids.length})
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="mt-2 space-y-1 pl-6">
          {ids.map((id) => (
            <li key={id} className="text-sm text-muted-foreground">
              {id}
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}
