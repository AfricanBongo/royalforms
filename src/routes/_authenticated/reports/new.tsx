/**
 * /reports/new — Report WYSIWYG builder for creating a new report template.
 *
 * Uses BlockNote with custom blocks (Formula, Dynamic Variable, Data Table).
 * Auto-save: Changes are debounced (3s) and persisted automatically.
 * After the first save, URL silently swaps to /reports/$templateId/edit.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

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
import { ReportEditor } from '../../../features/reports/editor/ReportEditor'
import { editorToCreateInput } from '../../../features/reports/editor/serialization'
import { useReportAutoSave } from '../../../hooks/use-report-auto-save'
import { usePageTitle } from '../../../hooks/use-page-title'
import { deactivateReportTemplate } from '../../../services/reports'
import {
  fetchTemplates,
  fetchPublishedFormFields,
} from '../../../services/form-templates'
import { mapSupabaseError } from '../../../lib/supabase-errors'

import type { SaveStatus } from '../../../hooks/use-report-auto-save'
import type { TemplateListRow } from '../../../services/form-templates'
import type { ReportMetadata } from '../../../features/reports/editor/serialization'
import type { FormFieldOption } from '../../../features/reports/editor/types'

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

  // Editor content from BlockNote
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorDocumentRef = useRef<any[]>([])

  // Report metadata (lives above the editor)
  const [metadata, setMetadata] = useState<ReportMetadata>({
    name: '',
    abbreviation: '',
    description: null,
    linkedFormTemplateId: '',
    autoGenerate: true,
    isPublicDefault: true,
  })

  // Refs for latest metadata
  const metadataRef = useRef(metadata)
  useEffect(() => {
    metadataRef.current = metadata
  }, [metadata])

  // toCreateInput — converts current BlockNote document + metadata to service format
  const toCreateInput = useCallback(() => {
    return editorToCreateInput(editorDocumentRef.current, metadataRef.current)
  }, [])

  // Content state for auto-save fingerprinting
  const contentState = {
    name: metadata.name,
    description: metadata.description ?? '',
    abbreviation: metadata.abbreviation,
    linkedFormTemplateId: metadata.linkedFormTemplateId,
    autoGenerate: metadata.autoGenerate,
    isPublicDefault: metadata.isPublicDefault,
    editorDocument: JSON.stringify(editorDocumentRef.current),
  }

  // Auto-save (templateId starts as null for new reports)
  const { saveStatus, persistedTemplateId, flush } = useReportAutoSave({
    templateId: null,
    contentState,
    toCreateInput,
    hasMeaningfulContent: !!metadata.name.trim(),
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

  // Refs for header button handlers
  const handlePublishRef = useRef<() => void>(() => {})
  const handleDiscardRef = useRef<() => void>(() => {})

  // Track editor changes to trigger auto-save re-evaluation
  const [, setEditorChangeCounter] = useState(0)

  // Update page title
  useEffect(() => {
    setPageTitle(metadata.name.trim() || 'New Report')
  }, [metadata.name, setPageTitle])

  // Inject header actions
  useEffect(() => {
    const statusText = saveStatusLabel(saveStatus)

    setHeaderActions(
      <>
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

  // Load available form templates
  useEffect(() => {
    async function loadFormTemplates() {
      try {
        const templates = await fetchTemplates(false)
        setFormTemplates(templates.filter((t) => t.status === 'published'))
      } catch {
        console.warn('Failed to load form templates')
      }
    }
    void loadFormTemplates()
  }, [])

  // When user selects a linked form template, load its published fields
  async function handleFormTemplateSelect(formTemplateId: string) {
    setMetadata((m) => ({ ...m, linkedFormTemplateId: formTemplateId }))

    try {
      const sections = await fetchPublishedFormFields(formTemplateId)
      const options: FormFieldOption[] = []
      for (const section of sections) {
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

  // Handle editor content changes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleEditorChange(document: any[]) {
    editorDocumentRef.current = document
    setEditorChangeCounter((c) => c + 1)
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
    if (!metadata.name.trim()) {
      toast.error('Report name is required.')
      return
    }
    if (!metadata.linkedFormTemplateId) {
      toast.error('A linked form template must be selected.')
      return
    }

    setIsPublishing(true)
    try {
      await flush()

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
          {/* Report metadata card */}
          <div className="flex flex-col gap-4 rounded-b-lg bg-background px-6 py-4">
            <div className="flex flex-col gap-1">
              <h3
                className="text-2xl font-semibold tracking-tight outline-none empty:before:content-['Report_Title'] empty:before:text-muted-foreground/50"
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => {
                  const text = e.currentTarget.textContent?.trim() ?? ''
                  setMetadata((m) => ({ ...m, name: text }))
                }}
              />
              <p
                className="text-lg outline-none empty:before:content-['Report_Description'] empty:before:text-muted-foreground/50"
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => {
                  const text = e.currentTarget.textContent?.trim() ?? ''
                  setMetadata((m) => ({ ...m, description: text || null }))
                }}
              />
            </div>

            {/* Linked form select */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-medium">Linked Form Template</Label>
              <Select
                value={metadata.linkedFormTemplateId}
                onValueChange={(v) => void handleFormTemplateSelect(v)}
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
                checked={metadata.autoGenerate}
                onCheckedChange={(checked) =>
                  setMetadata((m) => ({ ...m, autoGenerate: checked }))
                }
              />
              <Label htmlFor="auto-generate" className="text-sm">
                Auto-generate reports when form instances are submitted
              </Label>
            </div>

            {/* Public by default switch */}
            <div className="flex items-center gap-3">
              <Switch
                id="public-default"
                checked={metadata.isPublicDefault}
                onCheckedChange={(checked) =>
                  setMetadata((m) => ({ ...m, isPublicDefault: checked }))
                }
              />
              <Label htmlFor="public-default" className="text-sm">
                Make generated reports publicly accessible by default
              </Label>
            </div>
          </div>

          {/* BlockNote WYSIWYG Editor */}
          <div className="rounded-lg bg-background">
            <ReportEditor
              formFields={formFields}
              onChange={handleEditorChange}
            />
          </div>
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
