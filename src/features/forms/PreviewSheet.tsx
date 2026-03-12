/**
 * PreviewSheet — Side sheet that shows a read-only preview of the current
 * form builder state, rendering fields using the same InstanceFieldInput
 * component used in the actual form instance page.
 */
import { useMemo } from 'react'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

import { InstanceFieldInput } from '../instances/InstanceFieldInput.tsx'

import type { BuilderField, BuilderSection } from '../../hooks/use-form-builder'
import type { InstanceField } from '../../services/form-templates'

interface PreviewSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  formName: string
  formDescription: string
  sections: BuilderSection[]
}

/**
 * Maps a BuilderField to the InstanceField shape expected by InstanceFieldInput.
 */
function toInstanceField(field: BuilderField): InstanceField {
  return {
    id: field.clientId,
    label: field.label,
    description: field.description || null,
    field_type: field.field_type,
    sort_order: field.sort_order,
    is_required: field.is_required,
    options: field.options.length > 0 ? field.options : null,
    validation_rules: field.validation_rules ?? {},
  }
}

export function PreviewSheet({
  open,
  onOpenChange,
  formName,
  formDescription,
  sections,
}: PreviewSheetProps) {
  // Memoize the mapped sections to avoid recalculating on every render
  const mappedSections = useMemo(
    () =>
      sections.map((section) => ({
        ...section,
        instanceFields: section.fields.map((f) => toInstanceField(f)),
      })),
    [sections],
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col overflow-hidden sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Form Preview</SheetTitle>
          <SheetDescription>
            Preview of how the form will appear when filled out.
          </SheetDescription>
        </SheetHeader>

        {/* Scrollable preview body */}
        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {/* Form title & description */}
          <div className="mb-6 space-y-1">
            <h3 className="text-xl font-semibold tracking-tight">
              {formName || 'Untitled Form'}
            </h3>
            {formDescription && (
              <p className="text-sm text-muted-foreground">{formDescription}</p>
            )}
          </div>

          {/* Sections */}
          <div className="space-y-8">
            {mappedSections.map((section) => (
              <div key={section.clientId} className="space-y-4">
                {/* Section header */}
                <div className="space-y-0.5">
                  <h4 className="text-base font-medium">{section.title || 'Untitled Section'}</h4>
                  {section.description && (
                    <p className="text-sm text-muted-foreground">{section.description}</p>
                  )}
                </div>

                {/* Fields */}
                {section.instanceFields.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No fields in this section</p>
                ) : (
                  <div className="space-y-4">
                    {section.instanceFields.map((field) => (
                      <div key={field.id} className="space-y-1.5">
                        <label className="text-sm font-medium">
                          {field.label || 'Untitled Field'}
                          {field.is_required && (
                            <span className="ml-1 text-destructive">*</span>
                          )}
                        </label>
                        {field.description && (
                          <p className="text-xs text-muted-foreground">{field.description}</p>
                        )}
                        <InstanceFieldInput
                          field={field}
                          value={null}
                          disabled={true}
                          instanceId=""
                          onChange={() => {}}
                          onBlur={() => {}}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
