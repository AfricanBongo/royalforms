/**
 * BuilderSection — renders a section in the form builder.
 *
 * - Section badge ("Section 1") with primary background
 * - Editable section title and description
 * - Delete section button (shown when more than one section exists;
 *   confirmation dialog if the section contains fields)
 * - List of fields (BuilderFieldCard for each)
 * - "+ Insert question" button at the bottom
 * - Field type picker (shown inline when inserting)
 */
import { useState } from 'react'

import { PlusIcon, Trash2Icon } from 'lucide-react'

import { Badge } from './ui/badge'
import { BuilderFieldCard } from './builder-field-card'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { FieldTypePicker } from './field-type-picker'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

import type { BuilderField, BuilderSection as BuilderSectionType, FieldType } from '../hooks/use-form-builder'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BuilderSectionProps {
  section: BuilderSectionType
  /** Total number of sections — delete is only allowed when > 1. */
  totalSections: number
  onUpdateSection: (updates: Partial<Pick<BuilderSectionType, 'title' | 'description'>>) => void
  onRemoveSection: () => void
  // Field type picker flow
  onShowFieldTypePicker: (atIndex: number) => void
  onCancelFieldTypePicker: () => void
  onInsertField: (fieldType: FieldType) => void
  onAddSection: () => void
  // Field operations (forwarded to BuilderFieldCard)
  onUpdateField: (fieldClientId: string, updates: Partial<Omit<BuilderField, 'clientId'>>) => void
  onRemoveField: (fieldClientId: string) => void
  onDuplicateField: (fieldClientId: string) => void
  onMoveField: (fieldClientId: string, direction: 'up' | 'down') => void
  onSetFieldEditing: (fieldClientId: string, editing: boolean) => void
  onAddOption: (fieldClientId: string) => void
  onUpdateOption: (fieldClientId: string, optionIndex: number, value: string) => void
  onRemoveOption: (fieldClientId: string, optionIndex: number) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BuilderSection({
  section,
  totalSections,
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
  onAddOption,
  onUpdateOption,
  onRemoveOption,
}: BuilderSectionProps) {
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
                onUpdateSection({ description: text || null })
              }}
            >
              {section.description ?? ''}
            </p>
          </div>

          {canDelete && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={handleDeleteClick}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete section</TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Fields list */}
        <div className="flex flex-col gap-6">
          {section.fields.map((field, fieldIndex) => (
            <BuilderFieldCard
              key={field.clientId}
              field={field}
              index={fieldIndex}
              totalFields={section.fields.length}
              sectionClientId={section.clientId}
              onUpdate={onUpdateField}
              onRemove={onRemoveField}
              onDuplicate={onDuplicateField}
              onMove={onMoveField}
              onSetEditing={onSetFieldEditing}
              onAddOption={onAddOption}
              onUpdateOption={onUpdateOption}
              onRemoveOption={onRemoveOption}
            />
          ))}
        </div>

        {/* Field type picker OR insert question button */}
        {isPickerOpen ? (
          <FieldTypePicker
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
            Insert question
          </Button>
        )}
      </div>

      {/* Delete section confirmation dialog (only shown when section has fields) */}
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
