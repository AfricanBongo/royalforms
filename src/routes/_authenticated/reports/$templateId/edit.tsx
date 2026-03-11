/**
 * /reports/:templateId/edit — Report builder page for editing an existing report template.
 *
 * Auto-save: Changes are debounced (3s) and persisted automatically.
 * Each save creates a new version via updateReportTemplate.
 *
 * Header shows: [Draft|Published] · vN · [save status] + action buttons
 */
import { useEffect, useRef, useState } from 'react'

import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ShareIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '../../../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../../components/ui/dialog'
import { Label } from '../../../../components/ui/label'
import { Switch } from '../../../../components/ui/switch'
import { ReportBuilderSection } from '../../../../components/report-builder-section'
import { useReportAutoSave } from '../../../../hooks/use-report-auto-save'
import {
  useReportBuilder,
  toBuilderState,
} from '../../../../hooks/use-report-builder'
import { usePageTitle } from '../../../../hooks/use-page-title'
import {
  fetchReportTemplateById,
  deactivateReportTemplate,
} from '../../../../services/reports'
import { fetchTemplateForEditing } from '../../../../services/form-templates'
import { mapSupabaseError } from '../../../../lib/supabase-errors'

import type { SaveStatus } from '../../../../hooks/use-report-auto-save'
import type {
  FormFieldOption,
  ReportBuilderField,
  ReportFieldType,
} from '../../../../hooks/use-report-builder'

export const Route = createFileRoute('/_authenticated/reports/$templateId/edit')({
  component: EditReportTemplatePage,
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

function EditReportTemplatePage() {
  const { templateId } = Route.useParams()
  const navigate = useNavigate()
  const { setBreadcrumbs, setHeaderActions } = usePageTitle()

  const [loading, setLoading] = useState(true)
  const [versionNumber, setVersionNumber] = useState(1)
  const [isPublishing, setIsPublishing] = useState(false)
  const [showDiscardDialog, setShowDiscardDialog] = useState(false)
  const [formFields, setFormFields] = useState<FormFieldOption[]>([])
  const [linkedFormName, setLinkedFormName] = useState('')

  const builder = useReportBuilder()
  const { state } = builder

  // Auto-save — templateId is always known on this page
  const { saveStatus, flush } = useReportAutoSave({
    templateId,
    builderState: state,
    toCreateInput: builder.toCreateInput,
  })

  // Refs to hold latest handlers so header buttons never use stale closures
  const handlePublishRef = useRef<() => void>(() => {})
  const handleDiscardRef = useRef<() => void>(() => {})

  // Update breadcrumbs: Reports > Template Name > Edit
  useEffect(() => {
    const reportName = state.name.trim() || 'Untitled Report'
    setBreadcrumbs([
      { label: reportName, path: `/reports/${templateId}` },
      { label: 'Edit', path: `/reports/${templateId}/edit` },
    ])
    return () => {
      setBreadcrumbs([])
    }
  }, [state.name, templateId, setBreadcrumbs])

  // Inject header actions: status indicator + Discard Draft + Publish
  useEffect(() => {
    const statusText = saveStatusLabel(saveStatus)
    const publishLabel = 'Publish New Version'

    setHeaderActions(
      <>
        {/* Status indicator */}
        <span className="mr-2 text-sm text-muted-foreground">
          v{versionNumber}
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
  }, [saveStatus, isPublishing, versionNumber, setHeaderActions])

  // Load existing report template data + linked form fields
  useEffect(() => {
    async function load() {
      try {
        const data = await fetchReportTemplateById(templateId)
        setVersionNumber(data.latest_version.version_number)
        setLinkedFormName(data.form_template_name)

        const initial = toBuilderState(data)
        builder.setState(initial)

        // Load linked form template's fields for formula/variable/table pickers
        if (data.form_template_id) {
          await loadFormFields(data.form_template_id)
        }
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

  // Load form fields from a form template
  async function loadFormFields(formTemplateId: string) {
    try {
      const formData = await fetchTemplateForEditing(formTemplateId)
      const options: FormFieldOption[] = []
      for (const section of formData.sections) {
        for (const field of section.fields) {
          options.push({
            id: field.id,
            label: field.label,
            sectionTitle: section.title,
            field_type: field.field_type,
          })
        }
      }
      setFormFields(options)
    } catch {
      // Non-critical — builder still works, just can't pick form fields
      console.warn('Failed to load form template fields for report builder')
    }
  }

  // -------------------------------------------------------------------------
  // Discard Draft — deactivates the report template and navigates away
  // -------------------------------------------------------------------------

  async function handleDiscard() {
    setShowDiscardDialog(false)
    try {
      await deactivateReportTemplate(templateId)
      void navigate({ to: '/reports' })
    } catch (err: unknown) {
      const error = err as { code?: string; message: string }
      const mapped = mapSupabaseError(error.code, error.message, 'database', 'delete_record')
      toast.error(mapped.title, { description: mapped.description })
    }
  }
  handleDiscardRef.current = () => setShowDiscardDialog(true)

  // -------------------------------------------------------------------------
  // Publish — flush auto-save then navigate to detail page
  // -------------------------------------------------------------------------

  async function handlePublish() {
    const { valid, errors } = builder.validate()
    if (!valid) {
      errors.forEach((msg) => toast.error(msg))
      return
    }

    setIsPublishing(true)
    try {
      await flush()
      toast.success('Report template saved!')
      void navigate({ to: '/reports/$templateId', params: { templateId } })
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
        <p className="text-sm text-muted-foreground">Loading report template...</p>
      </div>
    )
  }

  return (
    <>
      <div className="flex h-full flex-col items-center overflow-auto bg-muted px-16">
        <div className="flex w-full max-w-[816px] flex-col gap-6 pb-16">
          {/* Report title / description card */}
          <div className="flex flex-col gap-4 rounded-b-lg bg-background px-6 py-4">
            <div className="flex flex-col gap-1">
              <h3
                className="text-2xl font-semibold tracking-tight outline-none empty:before:content-['Report_Title'] empty:before:text-muted-foreground/50"
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
                className="text-lg outline-none empty:before:content-['Report_Description'] empty:before:text-muted-foreground/50"
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

            {/* Linked form (read-only on edit) */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-medium">Linked Form</Label>
              <p className="text-sm text-muted-foreground">
                {linkedFormName || 'No linked form'}
              </p>
            </div>

            {/* Auto-generate switch */}
            <div className="flex items-center gap-3">
              <Switch
                id="auto-generate"
                checked={state.autoGenerate}
                onCheckedChange={builder.setAutoGenerate}
              />
              <Label htmlFor="auto-generate" className="text-sm">
                Auto-generate reports when form instances are submitted
              </Label>
            </div>
          </div>

          {/* Sections */}
          {state.sections.map((section) => (
            <ReportBuilderSection
              key={section.clientId}
              section={section}
              totalSections={state.sections.length}
              formFields={formFields}
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
              onInsertField={(fieldType: ReportFieldType) =>
                builder.insertField(section.clientId, fieldType)
              }
              onAddSection={builder.addSection}
              onUpdateField={(fieldClientId: string, updates: Partial<ReportBuilderField>) =>
                builder.updateField(fieldClientId, updates)
              }
              onRemoveField={(fieldClientId: string) =>
                builder.removeField(fieldClientId)
              }
              onDuplicateField={(fieldClientId: string) =>
                builder.duplicateField(fieldClientId)
              }
              onMoveField={(fieldClientId: string, direction: 'up' | 'down') =>
                builder.moveField(fieldClientId, direction)
              }
              onSetFieldEditing={(fieldClientId: string, editing: boolean) =>
                builder.setFieldEditing(fieldClientId, editing)
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
              This report template will be deactivated. This action cannot be undone.
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
