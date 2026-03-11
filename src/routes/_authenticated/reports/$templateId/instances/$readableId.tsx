import { useCallback, useEffect, useState } from 'react'

import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  AlertCircleIcon,
  DownloadIcon,
  FileTextIcon,
  Loader2Icon,
} from 'lucide-react'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '../../../../../components/ui/alert'
import { Button } from '../../../../../components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../../../components/ui/dropdown-menu'
import { ReportDocument } from '../../../../../components/report-document'
import { usePageTitle } from '../../../../../hooks/use-page-title'
import {
  exportReport,
  fetchReportInstanceByReadableId,
} from '../../../../../services/reports'
import type { ReportInstanceDetail } from '../../../../../services/reports'
import { supabase } from '../../../../../services/supabase'
import { mapSupabaseError } from '../../../../../lib/supabase-errors'

export const Route = createFileRoute(
  '/_authenticated/reports/$templateId/instances/$readableId',
)({
  component: ReportInstanceViewerPage,
})

function ReportInstanceViewerPage() {
  const { templateId, readableId } = Route.useParams()
  const navigate = useNavigate()
  const { setBreadcrumbs, setHeaderActions } = usePageTitle()

  const [instance, setInstance] = useState<ReportInstanceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  const loadInstance = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchReportInstanceByReadableId(readableId)
      setInstance(data)
    } catch (err: unknown) {
      const error = err as { code?: string; message: string }
      const mapped = mapSupabaseError(
        error.code,
        error.message,
        'database',
        'read_record',
      )
      toast.error(mapped.title, { description: mapped.description })
    } finally {
      setLoading(false)
    }
  }, [readableId])

  // Set breadcrumbs
  useEffect(() => {
    const templateName = instance?.report_template_name ?? 'Report'
    setBreadcrumbs([
      { label: templateName, path: `/reports/${templateId}` },
      { label: readableId, path: `/reports/${templateId}/instances/${readableId}` },
    ])
    return () => setBreadcrumbs([])
  }, [instance?.report_template_name, templateId, readableId, setBreadcrumbs])

  // Load instance on mount
  useEffect(() => {
    void loadInstance()
  }, [loadInstance])

  // Realtime subscription for generating status
  useEffect(() => {
    if (!instance || instance.status !== 'generating') return

    const channel = supabase
      .channel(`instance-watch-${instance.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'report_instances',
          filter: `id=eq.${instance.id}`,
        },
        (payload) => {
          const newStatus = (payload.new as Record<string, unknown>)?.status
          if (newStatus && newStatus !== 'generating') {
            void loadInstance()
          }
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
    // We intentionally depend on instance?.id and instance?.status, not the whole object
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance?.id, instance?.status, loadInstance])

  // Export handler
  async function handleExport(format: 'pdf' | 'docx') {
    if (!instance || exporting) return
    setExporting(true)
    try {
      const url = await exportReport(instance.id, format)
      window.open(url, '_blank')
    } catch (err: unknown) {
      const error = err as { code?: string; message: string }
      const mapped = mapSupabaseError(
        error.code,
        error.message,
        'database',
        'read_record',
      )
      toast.error(mapped.title, { description: mapped.description })
    } finally {
      setExporting(false)
    }
  }

  // Set header actions when instance is ready
  useEffect(() => {
    if (!instance || instance.status !== 'ready') {
      setHeaderActions(null)
      return
    }

    setHeaderActions(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" disabled={exporting}>
            {exporting ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <DownloadIcon className="size-4" />
            )}
            Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => void handleExport('pdf')}>
            <FileTextIcon className="size-4" />
            Export as PDF
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void handleExport('docx')}>
            <FileTextIcon className="size-4" />
            Export as Word
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    )

    return () => setHeaderActions(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance?.id, instance?.status, exporting, setHeaderActions])

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading report...</p>
      </div>
    )
  }

  // Not found
  if (!instance) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4">
        <p className="text-sm text-muted-foreground">Report instance not found.</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void navigate({ to: '/reports/$templateId', params: { templateId } })}
        >
          Back to template
        </Button>
      </div>
    )
  }

  // Generating state
  if (instance.status === 'generating') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4">
        <Loader2Icon className="size-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Generating report...</p>
        <p className="text-xs text-muted-foreground">
          This page will update automatically when the report is ready.
        </p>
      </div>
    )
  }

  // Failed state
  if (instance.status === 'failed') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-4">
        <div className="w-full max-w-md">
          <Alert variant="destructive">
            <AlertCircleIcon className="size-4" />
            <AlertTitle>Report generation failed</AlertTitle>
            <AlertDescription>
              {instance.error_message ?? 'An unknown error occurred during report generation.'}
            </AlertDescription>
          </Alert>
          <div className="mt-4 flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void navigate({ to: '/reports/$templateId', params: { templateId } })}
            >
              Back to template
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // Ready state — render the document
  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto bg-muted/30 p-4">
      <ReportDocument
        templateName={instance.report_template_name}
        readableId={instance.readable_id}
        createdAt={instance.created_at}
        createdByName="System"
        dataSnapshot={instance.data_snapshot ?? {}}
        formInstancesIncluded={instance.form_instances_included ?? []}
      />
    </div>
  )
}
