/**
 * /reports/:templateId/edit — Report WYSIWYG builder for editing an existing template.
 *
 * Uses BlockNote with custom blocks (Formula, Dynamic Variable, Data Table).
 * Auto-save: Changes are debounced (3s) and persisted automatically via
 * the serialization layer that converts BlockNote content to service format.
 *
 * Header shows: vN · [save status] + action buttons
 */
import { useCallback, useEffect, useRef, useState } from 'react'

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
import { ReportEditor } from '../../../../features/reports/editor/ReportEditor'
import {
  editorToCreateInput,
  resolveVariableLabels,
  templateDetailToEditorContent,
} from '../../../../features/reports/editor/serialization'
import { useReportAutoSave } from '../../../../hooks/use-report-auto-save'
import { usePageTitle } from '../../../../hooks/use-page-title'
import {
  fetchReportTemplateById,
  publishReportTemplate,
  discardReportDraft,
  createReportDraftVersion,
} from '../../../../services/reports'
import { fetchPublishedFormFields } from '../../../../services/form-templates'
import { mapSupabaseError } from '../../../../lib/supabase-errors'

import type { SaveStatus } from '../../../../hooks/use-report-auto-save'
import type { ReportMetadata } from '../../../../features/reports/editor/serialization'
import type { FormFieldOption } from '../../../../features/reports/editor/types'

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
  const [wasPreviouslyPublished, setWasPreviouslyPublished] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [showDiscardDialog, setShowDiscardDialog] = useState(false)
  const [formFields, setFormFields] = useState<FormFieldOption[]>([])
  const [linkedFormName, setLinkedFormName] = useState('')

  // Editor content from BlockNote
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [initialContent, setInitialContent] = useState<any[] | undefined>(undefined)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorDocumentRef = useRef<any[]>([])

  // Report metadata (lives above the editor)
  const [metadata, setMetadata] = useState<ReportMetadata>({
    name: '',
    abbreviation: '',
    description: null,
    linkedFormTemplateId: '',
    autoGenerate: false,
  })

  // Refs for latest metadata + editor document (for serialization)
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
    editorDocument: JSON.stringify(editorDocumentRef.current),
  }

  // Auto-save
  const { saveStatus, flush } = useReportAutoSave({
    templateId,
    contentState,
    toCreateInput,
    hasMeaningfulContent: !!metadata.name.trim(),
  })

  // Refs for header button handlers
  const handlePublishRef = useRef<() => void>(() => {})
  const handleDiscardRef = useRef<() => void>(() => {})

  // Track editor changes to trigger auto-save re-evaluation
  const [, setEditorChangeCounter] = useState(0)

  // Update breadcrumbs
  useEffect(() => {
    const reportName = metadata.name.trim() || 'Untitled Report'
    setBreadcrumbs([
      { label: reportName, path: `/reports/${templateId}` },
      { label: 'Edit', path: `/reports/${templateId}/edit` },
    ])
    return () => {
      setBreadcrumbs([])
    }
  }, [metadata.name, templateId, setBreadcrumbs])

  // Inject header actions
  useEffect(() => {
    const statusText = saveStatusLabel(saveStatus)
    const publishLabel = 'Publish New Version'

    setHeaderActions(
      <>
        <span className="mr-2 text-sm text-muted-foreground">
          v{versionNumber} Draft
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
        let data = await fetchReportTemplateById(templateId)

        // If template is published and latest version is also published,
        // create a new draft version for editing, then reload
        if (data.status === 'published' && data.latest_version.status === 'published') {
          setWasPreviouslyPublished(true)
          try {
            const { versionNumber: newVer } = await createReportDraftVersion(templateId)
            data = await fetchReportTemplateById(templateId)
            setVersionNumber(newVer)
          } catch {
            // Draft may already exist (race condition) — reload to pick it up
            data = await fetchReportTemplateById(templateId)
            setVersionNumber(data.latest_version.version_number)
          }
        } else {
          // Check if there's a published history (version > 1 means previous versions exist)
          setWasPreviouslyPublished(data.latest_version.version_number > 1)
          setVersionNumber(data.latest_version.version_number)
        }

        setLinkedFormName(data.form_template_name)

        // Set metadata
        setMetadata({
          name: data.name,
          abbreviation: data.abbreviation,
          description: data.description,
          linkedFormTemplateId: data.form_template_id,
          autoGenerate: data.auto_generate,
        })

        // Convert service format to BlockNote editor content
        let editorContent = templateDetailToEditorContent(data)

        // Load linked form fields
        if (data.form_template_id) {
          const fields = await loadFormFields(data.form_template_id)
          if (fields.length > 0) {
            // Resolve dynamic variable labels
            editorContent = resolveVariableLabels(editorContent, fields)
          }
        }

        setInitialContent(editorContent)
        editorDocumentRef.current = editorContent
      } catch (err: unknown) {
        const error = err as { code?: string; message: string }
        const mapped = mapSupabaseError(error.code, error.message, 'database', 'read_record')
        toast.error(mapped.title, { description: mapped.description })
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [templateId])

  // Load form fields from the published version of a form template
  async function loadFormFields(formTemplateId: string): Promise<FormFieldOption[]> {
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
      return options
    } catch {
      console.warn('Failed to load form template fields for report builder')
      return []
    }
  }

  // Handle editor content changes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleEditorChange(document: any[]) {
    editorDocumentRef.current = document
    // Bump counter to trigger auto-save re-evaluation
    setEditorChangeCounter((c) => c + 1)
  }

  // -------------------------------------------------------------------------
  // Discard Draft
  // -------------------------------------------------------------------------

  async function handleDiscard() {
    setShowDiscardDialog(false)
    try {
      const result = await discardReportDraft(templateId)
      if (result === 'deactivated') {
        // First-time draft, never published — go back to list
        void navigate({ to: '/reports' })
      } else {
        // Had published version, draft discarded — go to detail page
        void navigate({ to: '/reports/$templateId', params: { templateId } })
      }
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
    // Basic validation
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
      await publishReportTemplate(templateId)
      toast.success('Report template published!')
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
          {/* Report metadata card */}
          <div className="flex flex-col gap-4 rounded-b-lg bg-background px-6 py-4">
            <div className="flex flex-col gap-1">
              <input
                type="text"
                className="border-none bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/50"
                placeholder="Report Title"
                value={metadata.name}
                onChange={(e) => setMetadata((m) => ({ ...m, name: e.target.value }))}
              />
              <input
                type="text"
                className="border-none bg-transparent text-lg outline-none placeholder:text-muted-foreground/50"
                placeholder="Report Description"
                value={metadata.description ?? ''}
                onChange={(e) =>
                  setMetadata((m) => ({ ...m, description: e.target.value || null }))
                }
              />
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
                checked={metadata.autoGenerate}
                onCheckedChange={(checked) =>
                  setMetadata((m) => ({ ...m, autoGenerate: checked }))
                }
              />
              <Label htmlFor="auto-generate" className="text-sm">
                Auto-generate reports when form instances are submitted
              </Label>
            </div>
          </div>

          {/* BlockNote WYSIWYG Editor */}
          <div className="min-h-[calc(100vh-280px)] flex-grow rounded-lg bg-background">
            <ReportEditor
              initialContent={initialContent}
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
              {wasPreviouslyPublished
                ? 'The draft changes will be discarded and the last published version will be restored.'
                : 'This report template will be deactivated. This action cannot be undone.'}
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
