import { useCallback, useEffect, useState } from 'react'

import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  AlertCircleIcon,
  CheckIcon,
  DownloadIcon,
  FileTextIcon,
  LinkIcon,
  Loader2Icon,
  LockIcon,
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
import { Label } from '../../../../../components/ui/label'
import { Switch } from '../../../../../components/ui/switch'
import { ReportDocument } from '../../../../../components/report-document'
import { useAuth } from '../../../../../hooks/use-auth'
import { useCurrentUser } from '../../../../../hooks/use-current-user'
import { usePageTitle } from '../../../../../hooks/use-page-title'
import {
  exportReport,
  exportReportPublic,
  fetchPublicReportInstance,
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
  const { session } = useAuth()
  const isAuthenticated = !!session

  // Authenticated users get the full viewer; public users get the minimal one
  if (isAuthenticated) {
    return <AuthenticatedViewer templateId={templateId} readableId={readableId} />
  }

  return <PublicViewer readableId={readableId} />
}

// ---------------------------------------------------------------------------
// Authenticated viewer (existing full-featured viewer)
// ---------------------------------------------------------------------------

function AuthenticatedViewer({
  templateId,
  readableId,
}: {
  templateId: string
  readableId: string
}) {
  const navigate = useNavigate()
  const { setBreadcrumbs, setHeaderActions } = usePageTitle()

  const currentUser = useCurrentUser()
  const [instance, setInstance] = useState<ReportInstanceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isPublic, setIsPublic] = useState(true)

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

  // Sync isPublic state when instance loads
  useEffect(() => {
    if (instance) setIsPublic(instance.is_public)
    // Only re-run when the is_public value changes, not on every instance reference change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance?.is_public])

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

  // Copy link handler
  async function handleCopyLink() {
    const link =
      instance?.short_url ??
      `${window.location.origin}/reports/${templateId}/instances/${readableId}`
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      toast.success('Link copied')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy link')
    }
  }

  // Toggle public/private visibility
  async function handleTogglePublic(checked: boolean) {
    if (!instance) return
    setIsPublic(checked)
    try {
      const { error } = await supabase
        .from('report_instances')
        .update({ is_public: checked })
        .eq('id', instance.id)
      if (error) throw error
      toast.success(checked ? 'Report is now public' : 'Report is now private')
    } catch {
      setIsPublic(!checked) // revert on failure
      toast.error('Failed to update visibility')
    }
  }

  // Set header actions when instance is ready
  useEffect(() => {
    if (!instance || instance.status !== 'ready') {
      setHeaderActions(null)
      return
    }

    setHeaderActions(
      <div className="flex items-center gap-2">
        {currentUser?.role === 'root_admin' && (
          <div className="flex items-center gap-2">
            <Switch
              id="public-toggle"
              checked={isPublic}
              onCheckedChange={(checked) => void handleTogglePublic(checked)}
            />
            <Label htmlFor="public-toggle" className="text-sm">
              Public
            </Label>
          </div>
        )}
        <Button
          variant="outline"
          onClick={() => void handleCopyLink()}
        >
          {copied ? (
            <CheckIcon className="size-4" />
          ) : (
            <LinkIcon className="size-4" />
          )}
          {copied ? 'Copied' : 'Copy Link'}
        </Button>
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
        </DropdownMenu>
      </div>,
    )

    return () => setHeaderActions(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance?.id, instance?.status, instance?.short_url, exporting, copied, isPublic, currentUser?.role, setHeaderActions])

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

// ---------------------------------------------------------------------------
// Public viewer (minimal, unauthenticated)
// ---------------------------------------------------------------------------

function PublicViewer({ readableId }: { readableId: string }) {
  const navigate = useNavigate()

  const [instance, setInstance] = useState<ReportInstanceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notAvailable, setNotAvailable] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Fetch the public report instance
  const loadInstance = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchPublicReportInstance(readableId)
      if (!data) {
        setNotAvailable(true)
      } else {
        setInstance(data)
      }
    } catch {
      setNotAvailable(true)
    } finally {
      setLoading(false)
    }
  }, [readableId])

  useEffect(() => {
    void loadInstance()
  }, [loadInstance])

  // Export handler (silent errors for public users)
  async function handleExport(format: 'pdf' | 'docx') {
    if (!instance || exporting) return
    setExporting(true)
    try {
      const url = await exportReportPublic(instance.id, format)
      window.open(url, '_blank')
    } catch {
      // Silent catch — public users get minimal error feedback
    } finally {
      setExporting(false)
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Not available / not public
  if (notAvailable || !instance) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <LockIcon className="size-6 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">
            Report not available
          </h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            This report may not exist, is no longer public, or requires
            authentication to view.
          </p>
          <Button
            variant="outline"
            onClick={() => void navigate({ to: '/login', replace: true })}
          >
            Sign in
          </Button>
        </div>
      </div>
    )
  }

  // Ready — render the public viewer
  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      {/* Minimal sticky header */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-background px-4 py-3">
        <h1 className="truncate text-sm font-semibold text-foreground">
          {instance.report_template_name}
        </h1>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={exporting}>
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
        </DropdownMenu>
      </header>

      {/* Report document body */}
      <main className="flex-1 p-4">
        <ReportDocument
          templateName={instance.report_template_name}
          readableId={instance.readable_id}
          createdAt={instance.created_at}
          createdByName=""
          dataSnapshot={instance.data_snapshot ?? {}}
          formInstancesIncluded={instance.form_instances_included ?? []}
        />
      </main>
    </div>
  )
}
