/**
 * /forms/:templateId/edit — Form builder page for editing an existing template.
 *
 * Auto-save: Changes are debounced (3s) and persisted automatically.
 *
 * For draft templates (never published): auto-save updates in-place.
 * For published templates: a draft version is created on first load,
 * then auto-save updates that draft version in-place.
 *
 * Header shows: [Draft|Published] · vN · [save status] + action buttons
 */
import { useEffect, useRef, useState } from 'react'

import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ShareIcon } from 'lucide-react'
import { toast } from 'sonner'

import { BuilderSection } from '../../../../components/builder-section'
import { Button } from '../../../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../../components/ui/dialog'
import { useAutoSave } from '../../../../hooks/use-auto-save'
import { useFormBuilder, FIELD_TYPE } from '../../../../hooks/use-form-builder'
import { usePageTitle } from '../../../../hooks/use-page-title'
import {
  fetchTemplateForEditing,
  createDraftVersion,
  deleteDraftTemplate,
  discardDraftVersion,
  publishDraft,
} from '../../../../services/form-templates'
import { mapSupabaseError } from '../../../../lib/supabase-errors'

import type { SaveStatus } from '../../../../hooks/use-auto-save'
import type { BuilderField, BuilderState, FieldType } from '../../../../hooks/use-form-builder'
import type { TemplateVersionData } from '../../../../services/form-templates'

export const Route = createFileRoute('/_authenticated/forms/$templateId/edit')({
  component: EditFormPage,
})

// ---------------------------------------------------------------------------
// Convert loaded data to builder state
// ---------------------------------------------------------------------------

function toBuilderState(data: TemplateVersionData): BuilderState {
  let clientIdCounter = 0
  function makeId(): string {
    clientIdCounter += 1
    return `__loaded_${clientIdCounter}_${Date.now()}`
  }

  return {
    name: data.template.name,
    description: data.template.description ?? '',
    sections: data.sections.map((sec) => ({
      clientId: makeId(),
      title: sec.title,
      description: sec.description,
      sort_order: sec.sort_order,
      fields: sec.fields.map((f) => ({
        clientId: makeId(),
        label: f.label,
        description: (f as { description?: string | null }).description ?? '',
        field_type: f.field_type as FieldType,
        sort_order: f.sort_order,
        is_required: f.is_required,
        options:
          (f.field_type === FIELD_TYPE.SELECT || f.field_type === FIELD_TYPE.MULTI_SELECT) &&
          Array.isArray(f.options)
            ? (f.options as string[])
            : [],
        validation_rules:
          f.validation_rules && typeof f.validation_rules === 'object' && !Array.isArray(f.validation_rules)
            ? (f.validation_rules as Record<string, unknown>)
            : null,
        isEditing: false,
      })),
      insertingAtIndex: null,
    })),
  }
}

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

function EditFormPage() {
  const { templateId } = Route.useParams()
  const navigate = useNavigate()
  const { setBreadcrumbs, setHeaderActions } = usePageTitle()

  const [loading, setLoading] = useState(true)
  const [templateStatus, setTemplateStatus] = useState<'draft' | 'published'>('draft')
  const [versionNumber, setVersionNumber] = useState(1)
  const [isPublishing, setIsPublishing] = useState(false)
  const [showDiscardDialog, setShowDiscardDialog] = useState(false)

  const builder = useFormBuilder()
  const { state } = builder

  // Auto-save — templateId is always known on this page
  const { saveStatus, flush } = useAutoSave({
    templateId,
    builderState: state,
    toCreateInput: builder.toCreateInput,
  })

  // Refs to hold latest handlers so header buttons never use stale closures
  const handlePublishRef = useRef<() => void>(() => {})
  const handleDiscardRef = useRef<() => void>(() => {})

  // Update breadcrumbs: Forms > [Form Name] > Edit
  useEffect(() => {
    const formName = state.name.trim() || 'Untitled Form'
    setBreadcrumbs([
      { label: formName, path: `/forms/${templateId}` },
      { label: 'Edit', path: `/forms/${templateId}/edit` },
    ])
    return () => {
      setBreadcrumbs([])
    }
  }, [state.name, templateId, setBreadcrumbs])

  // Inject header actions: status indicator + Discard Draft + Publish
  useEffect(() => {
    const statusText = saveStatusLabel(saveStatus)
    const statusBadge = templateStatus === 'draft' ? 'Draft' : 'Published'
    const publishLabel = templateStatus === 'published' ? 'Publish New Version' : 'Publish'

    setHeaderActions(
      <>
        {/* Status indicator */}
        <span className="mr-2 text-sm text-muted-foreground">
          {statusBadge} · v{versionNumber}
          {statusText && <> · {statusText}</>}
        </span>

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
          <ShareIcon className="size-4" />
          {isPublishing ? 'Publishing...' : publishLabel}
        </Button>
      </>,
    )
    return () => {
      setHeaderActions(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveStatus, isPublishing, templateStatus, versionNumber, setHeaderActions])

  // Load existing template data
  useEffect(() => {
    async function load() {
      try {
        let data = await fetchTemplateForEditing(templateId)

        // If this is a published template with a published latest version,
        // create a draft version for editing
        if (data.template.status === 'published' && data.version.status === 'published') {
          const { versionNumber: newVerNum } = await createDraftVersion(templateId)
          // Re-fetch to get the new draft version's sections/fields
          data = await fetchTemplateForEditing(templateId)
          setVersionNumber(newVerNum)
        } else {
          setVersionNumber(data.version.version_number)
        }

        setTemplateStatus(data.template.status as 'draft' | 'published')
        const initial = toBuilderState(data)
        builder.setState(initial)
      } catch (err: unknown) {
        const error = err as { code?: string; message: string }
        const mapped = mapSupabaseError(error.code, error.message, 'database', 'read_record')
        toast.error(mapped.title, { description: mapped.description })
      } finally {
        setLoading(false)
      }
    }

    void load()
    // Only load once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId])

  // -------------------------------------------------------------------------
  // Discard Draft
  // -------------------------------------------------------------------------

  async function handleDiscard() {
    setShowDiscardDialog(false)
    try {
      if (templateStatus === 'draft') {
        // Never-published template — delete entirely
        await deleteDraftTemplate(templateId)
        void navigate({ to: '/forms' })
      } else {
        // Published template — discard draft version, restore previous
        await discardDraftVersion(templateId)
        void navigate({ to: '/forms/$templateId', params: { templateId } })
      }
    } catch (err: unknown) {
      const error = err as { code?: string; message: string }
      const mapped = mapSupabaseError(error.code, error.message, 'database', 'delete_record')
      toast.error(mapped.title, { description: mapped.description })
    }
  }
  handleDiscardRef.current = () => setShowDiscardDialog(true)

  // -------------------------------------------------------------------------
  // Publish / Publish New Version
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
      await publishDraft(templateId)
      toast.success(
        templateStatus === 'published'
          ? 'New version published!'
          : 'Form published successfully!',
      )
      void navigate({ to: '/forms/$templateId', params: { templateId } })
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

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading form...</p>
      </div>
    )
  }

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
            <DialogTitle>
              {templateStatus === 'draft' ? 'Discard draft?' : 'Discard changes?'}
            </DialogTitle>
            <DialogDescription>
              {templateStatus === 'draft'
                ? 'This form and all its fields will be permanently deleted. This action cannot be undone.'
                : 'Your draft changes will be discarded and the previous published version will be restored.'}
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
    </>
  )
}
