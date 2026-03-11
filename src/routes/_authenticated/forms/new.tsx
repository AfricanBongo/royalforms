/**
 * /forms/new — Form builder page for creating a new form template.
 *
 * Layout:
 * - Header (from _authenticated layout): "New Form" title + status indicator + Discard Draft / Publish buttons
 * - Body: bg-muted, scrollable content area (max-w-[816px])
 *   - Form title/description card (white, top, no top-rounding)
 *   - Section cards (white, rounded-lg) with fields inside
 *
 * Auto-save: Changes are debounced (3s) and persisted automatically.
 * After the first save, URL silently swaps to /forms/$templateId/edit.
 */
import { useEffect, useRef, useState } from 'react'

import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { EyeIcon, SaveIcon } from 'lucide-react'
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
import { useAutoSave } from '../../../hooks/use-auto-save'
import { useFormBuilder } from '../../../hooks/use-form-builder'
import { usePageTitle } from '../../../hooks/use-page-title'
import { PreviewSheet } from '../../../features/forms/PreviewSheet.tsx'
import { deleteDraftTemplate, publishDraft } from '../../../services/form-templates'
import { mapSupabaseError } from '../../../lib/supabase-errors'

import type { SaveStatus } from '../../../hooks/use-auto-save'
import type { BuilderField, FieldType } from '../../../hooks/use-form-builder'

export const Route = createFileRoute('/_authenticated/forms/new')({
  component: NewFormPage,
})

// ---------------------------------------------------------------------------
// Save status display
// ---------------------------------------------------------------------------

function saveStatusLabel(status: SaveStatus): string | null {
  switch (status) {
    case 'dirty': return 'Editing'
    case 'saving': return 'Saving...'
    case 'saved': return 'Saved'
    case 'error': return 'Save failed'
    default: return null
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function NewFormPage() {
  const navigate = useNavigate()
  const { setPageTitle, setHeaderActions } = usePageTitle()

  const [isPublishing, setIsPublishing] = useState(false)
  const [showDiscardDialog, setShowDiscardDialog] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  const builder = useFormBuilder()
  const { state } = builder

  // Auto-save (templateId starts as null for new forms)
  const { saveStatus, persistedTemplateId, flush } = useAutoSave({
    templateId: null,
    builderState: state,
    toCreateInput: builder.toCreateInput,
  })

  // After first auto-save creates the template, silently swap URL
  const hasSwapped = useRef(false)
  useEffect(() => {
    if (persistedTemplateId && !hasSwapped.current) {
      hasSwapped.current = true
      void navigate({
        to: '/forms/$templateId/edit',
        params: { templateId: persistedTemplateId },
        replace: true,
      })
    }
  }, [persistedTemplateId, navigate])

  // Refs to hold latest handlers so header buttons never use stale closures
  const handlePublishRef = useRef<() => void>(() => {})
  const handleDiscardRef = useRef<() => void>(() => {})
  const handlePreviewRef = useRef<() => void>(() => {})

  // Update page title: show form name when typed, fall back to "New Form"
  useEffect(() => {
    setPageTitle(state.name.trim() || 'New Form')
  }, [state.name, setPageTitle])

  // Inject header actions: status indicator + Discard Draft + Publish
  useEffect(() => {
    const statusText = saveStatusLabel(saveStatus)

    setHeaderActions(
      <>
        {/* Status indicator */}
        <span className="mr-2 text-sm text-muted-foreground">
          Draft · v1
          {statusText && <> · {statusText}</>}
        </span>

        <Button
          variant="outline"
          size="sm"
          onClick={() => handlePreviewRef.current()}
          className="gap-2"
        >
          <EyeIcon className="size-4" />
          Preview
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleDiscardRef.current()}
          disabled={isPublishing}
        >
          Discard Draft
        </Button>
        <Button
          size="sm"
          onClick={() => handlePublishRef.current()}
          disabled={isPublishing || saveStatus === 'saving'}
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
  }, [saveStatus, isPublishing, setHeaderActions])

  // -------------------------------------------------------------------------
  // Discard Draft
  // -------------------------------------------------------------------------

  async function handleDiscard() {
    setShowDiscardDialog(false)
    try {
      if (persistedTemplateId) {
        await deleteDraftTemplate(persistedTemplateId)
      }
      void navigate({ to: '/forms' })
    } catch (err: unknown) {
      const error = err as { code?: string; message: string }
      const mapped = mapSupabaseError(error.code, error.message, 'database', 'delete_record')
      toast.error(mapped.title, { description: mapped.description })
    }
  }
  handleDiscardRef.current = () => setShowDiscardDialog(true)
  handlePreviewRef.current = () => setShowPreview(true)

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
      // Flush any pending auto-save first
      await flush()

      // If the form hasn't been persisted yet (unlikely but possible if debounce
      // hasn't fired), we can't publish. The flush should have triggered a save.
      const tid = persistedTemplateId
      if (!tid) {
        toast.error('Please wait for the form to save before publishing.')
        setIsPublishing(false)
        return
      }

      await publishDraft(tid)
      toast.success('Form published successfully!')
      void navigate({ to: '/forms/$templateId', params: { templateId: tid } })
    } catch (err: unknown) {
      const error = err as { code?: string; message: string }
      const mapped = mapSupabaseError(error.code, error.message, 'database', 'create_record')
      toast.error(mapped.title, { description: mapped.description })
    } finally {
      setIsPublishing(false)
    }
  }
  handlePublishRef.current = handlePublish

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

      {/* Discard draft confirmation dialog */}
      <Dialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard draft?</DialogTitle>
            <DialogDescription>
              This form and all its fields will be permanently deleted. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDiscardDialog(false)}>
              Keep editing
            </Button>
            <Button variant="destructive" onClick={() => void handleDiscard()}>
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Form preview side sheet */}
      <PreviewSheet
        open={showPreview}
        onOpenChange={setShowPreview}
        formName={state.name}
        formDescription={state.description}
        sections={state.sections}
      />
    </>
  )
}
