/**
 * /forms/new — Form builder page for creating a new form template.
 *
 * Layout:
 * - Header (from _authenticated layout): breadcrumb "Forms > New Form" + Cancel / Publish buttons (right)
 * - Body: bg-muted, scrollable content area (max-w-[816px])
 *   - Form title/description card (white, top, no top-rounding)
 *   - Section cards (white, rounded-lg) with fields inside
 *
 * Navigation away from this page is blocked with a confirmation dialog
 * via TanStack Router's useBlocker hook (breadcrumb, back button, etc.).
 */
import { useEffect, useState } from 'react'

import { createFileRoute, useBlocker, useNavigate } from '@tanstack/react-router'
import { SaveIcon } from 'lucide-react'
import { toast } from 'sonner'

import { BuilderSection } from '../../../components/builder-section'
import { Button } from '../../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog'
import { useFormBuilder } from '../../../hooks/use-form-builder'
import { usePageTitle } from '../../../hooks/use-page-title'
import { createTemplate } from '../../../services/form-templates'
import { mapSupabaseError } from '../../../lib/supabase-errors'

import type { BuilderField, FieldType } from '../../../hooks/use-form-builder'

export const Route = createFileRoute('/_authenticated/forms/new')({
  component: NewFormPage,
})

function NewFormPage() {
  const navigate = useNavigate()
  const { setPageTitle, setHeaderActions } = usePageTitle()

  const [isPublishing, setIsPublishing] = useState(false)

  const builder = useFormBuilder()
  const { state } = builder

  // Block navigation away from the form builder with a custom dialog.
  // `proceed` allows navigation; `reset` cancels; `status` drives the dialog.
  const blocker = useBlocker({
    shouldBlockFn: () => true,
    withResolver: true,
  })
  const { status } = blocker

  // Update breadcrumb: show form name when typed, fall back to "New Form"
  useEffect(() => {
    setPageTitle(state.name.trim() || 'New Form')
  }, [state.name, setPageTitle])

  // Inject Cancel + Publish buttons into the header bar
  useEffect(() => {
    setHeaderActions(
      <>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void navigate({ to: '/forms' })}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handlePublish}
          disabled={isPublishing}
          className="gap-2"
        >
          <SaveIcon className="size-4" />
          {isPublishing ? 'Publishing...' : 'Publish'}
        </Button>
      </>,
    )
    return () => {
      setPageTitle(null)
      setHeaderActions(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPublishing, setHeaderActions])

  // -------------------------------------------------------------------------
  // Publish
  // -------------------------------------------------------------------------

  async function handlePublish() {
    const errors = builder.validate()
    if (errors.length > 0) {
      errors.forEach((msg) => toast.error(msg))
      return
    }

    setIsPublishing(true)
    try {
      const input = builder.toCreateInput()
      const templateId = await createTemplate(input)
      toast.success('Form published successfully!')
      blocker.proceed?.()
      void navigate({ to: '/forms/$templateId', params: { templateId } })
    } catch (err: unknown) {
      const error = err as { code?: string; message: string }
      const mapped = mapSupabaseError(error.code, error.message, 'database', 'create_record')
      toast.error(mapped.title, { description: mapped.description })
    } finally {
      setIsPublishing(false)
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <>
      <div className="flex h-full flex-col items-center overflow-auto bg-muted px-16">
        <div className="flex w-full max-w-[816px] flex-col gap-6 pb-16">
          {/* Form title / description card */}
          <div className="flex flex-col gap-0 rounded-b-lg bg-background px-6 py-4">
            <div className="flex flex-col gap-1">
              <h3
                className="text-2xl font-semibold tracking-tight outline-none empty:before:content-['Form_Title'] empty:before:text-muted-foreground/50"
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => {
                  const text = e.currentTarget.textContent?.trim() ?? ''
                  builder.setName(text)
                }}
              >
                {state.name}
              </h3>
              <p
                className="text-lg outline-none empty:before:content-['Form_Description'] empty:before:text-muted-foreground/50"
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => {
                  const text = e.currentTarget.textContent?.trim() ?? ''
                  builder.setDescription(text)
                }}
              >
                {state.description}
              </p>
            </div>

            {/* Abbreviation input */}
            <div className="mt-2 flex items-center gap-2">
              <label className="text-sm text-muted-foreground" htmlFor="abbreviation">
                Abbreviation:
              </label>
              <input
                id="abbreviation"
                type="text"
                value={state.abbreviation}
                onChange={(e) => builder.setAbbreviation(e.target.value)}
                placeholder="e.g. epr"
                className="h-7 w-32 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>
          </div>

          {/* Sections */}
          {state.sections.map((section) => (
            <BuilderSection
              key={section.clientId}
              section={section}
              totalSections={state.sections.length}
              onUpdateSection={(updates) =>
                builder.updateSection(section.clientId, updates)
              }
              onRemoveSection={() =>
                builder.removeSection(section.clientId)
              }
              onShowFieldTypePicker={(atIndex) =>
                builder.showFieldTypePicker(section.clientId, atIndex)
              }
              onCancelFieldTypePicker={() =>
                builder.cancelFieldTypePicker(section.clientId)
              }
              onInsertField={(fieldType: FieldType) =>
                builder.insertField(section.clientId, fieldType)
              }
              onAddSection={builder.addSection}
              onUpdateField={(fieldClientId: string, updates: Partial<Omit<BuilderField, 'clientId'>>) =>
                builder.updateField(section.clientId, fieldClientId, updates)
              }
              onRemoveField={(fieldClientId: string) =>
                builder.removeField(section.clientId, fieldClientId)
              }
              onDuplicateField={(fieldClientId: string) =>
                builder.duplicateField(section.clientId, fieldClientId)
              }
              onMoveField={(fieldClientId: string, direction: 'up' | 'down') =>
                builder.moveField(section.clientId, fieldClientId, direction)
              }
              onSetFieldEditing={(fieldClientId: string, editing: boolean) =>
                builder.setFieldEditing(section.clientId, fieldClientId, editing)
              }
              onAddOption={(fieldClientId: string) =>
                builder.addOption(section.clientId, fieldClientId)
              }
              onUpdateOption={(fieldClientId: string, optionIndex: number, value: string) =>
                builder.updateOption(section.clientId, fieldClientId, optionIndex, value)
              }
              onRemoveOption={(fieldClientId: string, optionIndex: number) =>
                builder.removeOption(section.clientId, fieldClientId, optionIndex)
              }
            />
          ))}
        </div>
      </div>

      {/* Navigation blocker confirmation dialog */}
      <Dialog open={status === 'blocked'} onOpenChange={(open) => { if (!open) blocker.reset?.() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard new form?</DialogTitle>
            <DialogDescription>
              Any fields and sections you have added will be lost. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => blocker.reset?.()}>
              Keep editing
            </Button>
            <Button variant="destructive" onClick={() => blocker.proceed?.()}>
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
