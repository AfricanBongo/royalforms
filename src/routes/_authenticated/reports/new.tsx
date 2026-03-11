/**
 * /reports/new — Report builder page for creating a new report template.
 *
 * Layout:
 * - Header (from _authenticated layout): "New Report" title + status indicator + Discard Draft / Publish buttons
 * - Body: bg-muted, scrollable content area (max-w-[816px])
 *   - Report title/description card (white, top, no top-rounding)
 *   - Linked form select (enabled — must pick a form template)
 *   - Auto-generate switch
 *   - Section cards with report-specific fields
 *
 * Auto-save: Changes are debounced (3s) and persisted automatically.
 * After the first save, URL silently swaps to /reports/$templateId/edit.
 */
import { useEffect, useRef, useState } from 'react'

import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { SaveIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '../../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog'
import { Label } from '../../../components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select'
import { Switch } from '../../../components/ui/switch'
import { ReportBuilderSection } from '../../../components/report-builder-section'
import { useReportAutoSave } from '../../../hooks/use-report-auto-save'
import { useReportBuilder } from '../../../hooks/use-report-builder'
import { usePageTitle } from '../../../hooks/use-page-title'
import { deactivateReportTemplate } from '../../../services/reports'
import {
  fetchTemplates,
  fetchTemplateForEditing,
} from '../../../services/form-templates'
import { mapSupabaseError } from '../../../lib/supabase-errors'

import type { SaveStatus } from '../../../hooks/use-report-auto-save'
import type { TemplateListRow } from '../../../services/form-templates'
import type {
  FormFieldOption,
  ReportBuilderField,
  ReportFieldType,
} from '../../../hooks/use-report-builder'

export const Route = createFileRoute('/_authenticated/reports/new')({
  component: NewReportTemplatePage,
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

function NewReportTemplatePage() {
  const navigate = useNavigate()
  const { setPageTitle, setHeaderActions } = usePageTitle()

  const [isPublishing, setIsPublishing] = useState(false)
  const [showDiscardDialog, setShowDiscardDialog] = useState(false)
  const [formTemplates, setFormTemplates] = useState<TemplateListRow[]>([])
  const [formFields, setFormFields] = useState<FormFieldOption[]>([])

  const builder = useReportBuilder()
  const { state } = builder

  // Auto-save (templateId starts as null for new reports)
  const { saveStatus, persistedTemplateId, flush } = useReportAutoSave({
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
        to: '/reports/$templateId/edit',
        params: { templateId: persistedTemplateId },
        replace: true,
      })
    }
  }, [persistedTemplateId, navigate])

  // Refs to hold latest handlers so header buttons never use stale closures
  const handlePublishRef = useRef<() => void>(() => {})
  const handleDiscardRef = useRef<() => void>(() => {})

  // Update page title: show report name when typed, fall back to "New Report"
  useEffect(() => {
    setPageTitle(state.name.trim() || 'New Report')
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

  // Load available form templates for the linked form dropdown
  useEffect(() => {
    async function loadFormTemplates() {
      try {
        const templates = await fetchTemplates(false)
        // Only show published templates
        setFormTemplates(templates.filter((t) => t.status === 'published'))
      } catch {
        console.warn('Failed to load form templates')
      }
    }
    void loadFormTemplates()
  }, [])

  // When user selects a linked form template, load its fields
  async function handleFormTemplateSelect(formTemplateId: string) {
    builder.setLinkedFormTemplateId(formTemplateId)

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
      console.warn('Failed to load form template fields')
      setFormFields([])
    }
  }

  // -------------------------------------------------------------------------
  // Discard Draft
  // -------------------------------------------------------------------------

  async function handleDiscard() {
    setShowDiscardDialog(false)
    try {
      if (persistedTemplateId) {
        await deactivateReportTemplate(persistedTemplateId)
      }
      void navigate({ to: '/reports' })
    } catch (err: unknown) {
      const error = err as { code?: string; message: string }
      const mapped = mapSupabaseError(error.code, error.message, 'database', 'delete_record')
      toast.error(mapped.title, { description: mapped.description })
    }
  }
  handleDiscardRef.current = () => setShowDiscardDialog(true)

  // -------------------------------------------------------------------------
  // Publish
  // -------------------------------------------------------------------------

  async function handlePublish() {
    const { valid, errors } = builder.validate()
    if (!valid) {
      errors.forEach((msg) => toast.error(msg))
      return
    }

    setIsPublishing(true)
    try {
      // Flush any pending auto-save first
      await flush()

      // If the report hasn't been persisted yet, the flush should have triggered a save.
      const tid = persistedTemplateId
      if (!tid) {
        toast.error('Please wait for the report to save before publishing.')
        setIsPublishing(false)
        return
      }

      toast.success('Report template published!')
      void navigate({ to: '/reports/$templateId', params: { templateId: tid } })
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

            {/* Linked form select */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-medium">Linked Form Template</Label>
              <Select
                value={state.linkedFormTemplateId ?? ''}
                onValueChange={handleFormTemplateSelect}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a form template..." />
                </SelectTrigger>
                <SelectContent>
                  {formTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                This report will pull data from the selected form template&apos;s instances.
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
          {state.sections.map((section, sectionIndex) => (
            <ReportBuilderSection
              key={section.clientId}
              section={section}
              sectionIndex={sectionIndex}
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
              This report template will be permanently deactivated. This action cannot be undone.
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
