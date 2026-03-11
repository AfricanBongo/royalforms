/**
 * ReportBuilderSection — renders a section in the report builder.
 *
 * Mirrors the form builder BuilderSection pattern:
 * - Section badge ("Section N") with primary background
 * - Editable section title and description
 * - Delete section button (confirmation dialog if section has fields)
 * - List of ReportBuilderFieldCard components
 * - Field type picker toggle
 */
import { useState } from 'react'

import { PlusIcon, Trash2Icon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ReportBuilderFieldCard } from './report-builder-field-card'
import { ReportFieldTypePicker } from './report-field-type-picker'

import type {
  FormFieldOption,
  ReportBuilderField,
  ReportBuilderSection as ReportBuilderSectionType,
  ReportFieldType,
} from '../hooks/use-report-builder'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReportBuilderSectionProps {
  section: ReportBuilderSectionType
  sectionIndex: number
  totalSections: number
  formFields: FormFieldOption[]
  onUpdateSection: (updates: Partial<Pick<ReportBuilderSectionType, 'title' | 'description'>>) => void
  onRemoveSection: () => void
  // Field type picker flow
  onShowFieldTypePicker: (atIndex: number) => void
  onCancelFieldTypePicker: () => void
  onInsertField: (fieldType: ReportFieldType) => void
  onAddSection: () => void
  // Field operations
  onUpdateField: (fieldClientId: string, updates: Partial<ReportBuilderField>) => void
  onRemoveField: (fieldClientId: string) => void
  onDuplicateField: (fieldClientId: string) => void
  onMoveField: (fieldClientId: string, direction: 'up' | 'down') => void
  onSetFieldEditing: (fieldClientId: string, editing: boolean) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReportBuilderSection({
  section,
  sectionIndex: _sectionIndex,
  totalSections,
  formFields,
  onUpdateSection,
  onRemoveSection,
  onShowFieldTypePicker,
  onCancelFieldTypePicker,
  onInsertField,
  onAddSection,
  onUpdateField,
  onRemoveField,
  onDuplicateField,
  onMoveField,
  onSetFieldEditing,
}: ReportBuilderSectionProps) {
  const isPickerOpen = section.insertingAtIndex !== null
  const canDelete = totalSections > 1
  const hasFields = section.fields.length > 0

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  function handleDeleteClick() {
    if (hasFields) {
      setDeleteDialogOpen(true)
    } else {
      onRemoveSection()
    }
  }

  return (
    <>
      <div className="flex flex-col gap-8 rounded-lg bg-background px-6 pb-6 pt-4">
        {/* Section header */}
        <div className="flex items-start justify-between">
          <div className="flex flex-col items-start gap-1">
            <Badge className="rounded-lg">Section {section.sort_order}</Badge>
            <h3
              className="text-2xl font-semibold tracking-tight outline-none"
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => {
                const text = e.currentTarget.textContent?.trim() ?? ''
                if (text !== section.title) {
                  onUpdateSection({ title: text || `Section ${section.sort_order}` })
                }
              }}
            >
              {section.title}
            </h3>
            <p
              className="text-lg text-muted-foreground outline-none empty:before:content-['Section_Description'] empty:before:text-muted-foreground/50"
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => {
                const text = e.currentTarget.textContent?.trim() ?? ''
                onUpdateSection({ description: text || '' })
              }}
            >
              {section.description || ''}
            </p>
          </div>

          {canDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={handleDeleteClick}
              title="Delete section"
            >
              <Trash2Icon className="size-4" />
            </Button>
          )}
        </div>

        {/* Fields list */}
        <div className="flex flex-col gap-4">
          {section.fields.map((field, fieldIndex) => (
            <ReportBuilderFieldCard
              key={field.clientId}
              field={field}
              isFirst={fieldIndex === 0}
              isLast={fieldIndex === section.fields.length - 1}
              formFields={formFields}
              onUpdate={(updates) => onUpdateField(field.clientId, updates)}
              onRemove={() => onRemoveField(field.clientId)}
              onDuplicate={() => onDuplicateField(field.clientId)}
              onMove={(direction) => onMoveField(field.clientId, direction)}
              onSetEditing={(isEditing) => onSetFieldEditing(field.clientId, isEditing)}
            />
          ))}
        </div>

        {/* Field type picker OR insert field button */}
        {isPickerOpen ? (
          <ReportFieldTypePicker
            onSelect={(fieldType) => onInsertField(fieldType)}
            onAddSection={onAddSection}
            onCancel={onCancelFieldTypePicker}
          />
        ) : (
          <Button
            variant="ghost"
            className="gap-2 self-start text-blue-700 hover:text-blue-800"
            onClick={() => onShowFieldTypePicker(section.fields.length)}
          >
            <PlusIcon className="size-4" />
            Insert field
          </Button>
        )}
      </div>

      {/* Delete section confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete section?</DialogTitle>
            <DialogDescription>
              This section contains {section.fields.length}{' '}
              {section.fields.length === 1 ? 'field' : 'fields'} that will be
              permanently removed. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setDeleteDialogOpen(false)
                onRemoveSection()
              }}
            >
              Delete section
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
