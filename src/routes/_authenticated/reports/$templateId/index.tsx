import { useCallback, useEffect, useState } from 'react'

import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  DownloadIcon,
  EllipsisVerticalIcon,
  FileTextIcon,
  FilterIcon,
  HistoryIcon,
  Loader2Icon,
  PencilIcon,
  PlayIcon,
  SearchIcon,
  Trash2Icon,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../../components/ui/alert-dialog'
import { Badge } from '../../../../components/ui/badge'
import { Button } from '../../../../components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../../../components/ui/dropdown-menu'
import { Input } from '../../../../components/ui/input'
import { Separator } from '../../../../components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../../components/ui/table'
import { StatCard } from '../../../../components/stat-card'
import { GenerateReportDialog } from '../../../../features/reports/GenerateReportDialog'
import { VersionHistorySheet } from '../../../../features/reports/VersionHistorySheet'
import { useCurrentUser } from '../../../../hooks/use-current-user'
import { usePageTitle } from '../../../../hooks/use-page-title'
import { useReportGenerationWatch } from '../../../../hooks/use-report-generation-watch'
import {
  deactivateReportTemplate,
  exportReport,
  fetchReportInstances,
  fetchReportTemplateById,
  toggleAutoGenerate,
} from '../../../../services/reports'
import type {
  ReportInstanceListRow,
  ReportTemplateDetail,
} from '../../../../services/reports'
import { mapSupabaseError } from '../../../../lib/supabase-errors'

export const Route = createFileRoute('/_authenticated/reports/$templateId/')({
  component: ReportTemplateDetailPage,
})

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 15

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function ReportTemplateDetailPage() {
  const { templateId } = Route.useParams()
  const currentUser = useCurrentUser()
  const navigate = useNavigate()
  const { setPageTitle } = usePageTitle()

  const [template, setTemplate] = useState<ReportTemplateDetail | null>(null)
  const [instances, setInstances] = useState<ReportInstanceListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [versionsOpen, setVersionsOpen] = useState(false)
  const [generateOpen, setGenerateOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [togglingAutoGen, setTogglingAutoGen] = useState(false)
  const [exportingId, setExportingId] = useState<string | null>(null)

  const { watch } = useReportGenerationWatch()
  const isRootAdmin = currentUser?.role === 'root_admin'

  // Filter instances by search (readable_id or created_by_name)
  const filtered = search.trim()
    ? instances.filter(
        (i) =>
          i.readable_id
            .toLowerCase()
            .includes(search.trim().toLowerCase()) ||
          i.created_by_name
            .toLowerCase()
            .includes(search.trim().toLowerCase()),
      )
    : instances

  // Pagination
  const totalItems = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const startIndex = (safePage - 1) * PAGE_SIZE
  const paged = filtered.slice(startIndex, startIndex + PAGE_SIZE)

  // Stat counts
  const readyCount = instances.filter((i) => i.status === 'ready').length
  const failedCount = instances.filter((i) => i.status === 'failed').length

  // Load template data — extracted so it can be re-called after actions
  const loadTemplate = useCallback(async () => {
    setLoading(true)
    try {
      const [tmpl, inst] = await Promise.all([
        fetchReportTemplateById(templateId),
        fetchReportInstances(templateId),
      ])
      setTemplate(tmpl)
      setInstances(inst)
      setPageTitle(tmpl.name)
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
  }, [templateId, setPageTitle])

  // Load data on mount
  useEffect(() => {
    void loadTemplate()
    return () => setPageTitle(null)
  }, [loadTemplate, setPageTitle])

  // Reset to page 1 when search changes
  useEffect(() => {
    setPage(1)
  }, [search])

  // Toggle auto-generate
  async function handleToggleAutoGenerate() {
    if (!template || togglingAutoGen) return
    setTogglingAutoGen(true)
    try {
      const newValue = !template.auto_generate
      await toggleAutoGenerate(templateId, newValue)
      setTemplate((prev) => prev ? { ...prev, auto_generate: newValue } : prev)
      toast.success(`Auto-generate ${newValue ? 'enabled' : 'disabled'}`)
    } catch (err: unknown) {
      const error = err as { code?: string; message: string }
      const mapped = mapSupabaseError(
        error.code,
        error.message,
        'database',
        'update_record',
      )
      toast.error(mapped.title, { description: mapped.description })
    } finally {
      setTogglingAutoGen(false)
    }
  }

  // Archive (soft-delete) template
  async function handleDelete() {
    if (deleting) return
    setDeleting(true)
    try {
      await deactivateReportTemplate(templateId)
      toast.success('Report template archived')
      void navigate({ to: '/reports' })
    } catch (err: unknown) {
      const error = err as { code?: string; message: string }
      const mapped = mapSupabaseError(
        error.code,
        error.message,
        'database',
        'delete_record',
      )
      toast.error(mapped.title, { description: mapped.description })
    } finally {
      setDeleting(false)
      setDeleteOpen(false)
    }
  }

  // Export a report instance
  async function handleExportInstance(instanceId: string, format: 'pdf' | 'docx') {
    if (exportingId) return
    setExportingId(instanceId)
    try {
      const url = await exportReport(instanceId, format)
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
      setExportingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4">
        <p className="py-8 text-center text-sm text-muted-foreground">
          Loading report template...
        </p>
      </div>
    )
  }

  if (!template) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4">
        <p className="py-8 text-center text-sm text-muted-foreground">
          Report template not found.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      {/* Stat cards */}
      <div className="flex gap-2.5">
        <StatCard
          label="Version"
          value={`v${template.latest_version.version_number}`}
        />
        <StatCard label="Reports Generated" value={readyCount} />
        <StatCard label="Failed" value={failedCount} />
        <button
          type="button"
          className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 transition-colors hover:bg-muted/80"
          onClick={() => void handleToggleAutoGenerate()}
          disabled={togglingAutoGen}
        >
          <span className="flex-1 text-base text-muted-foreground">Auto-Generate</span>
          <span className="text-xl font-medium text-foreground">
            {template.auto_generate ? 'On' : 'Off'}
          </span>
        </button>
      </div>

      {/* Draft notice */}
      {template.status === 'draft' && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Publish this template before generating reports.
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        {/* Left: search + filters */}
        <div className="flex items-center gap-4">
          <div className="relative w-[320px]">
            <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search anything"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button variant="outline" size="default">
            <FilterIcon className="size-4" />
            Filters
          </Button>
        </div>

        {/* Right: action buttons (Root Admin only) */}
        {isRootAdmin && (
          <div className="flex items-center gap-2">
            <Separator orientation="vertical" className="h-6" />
            <Button
              variant="outline"
              size="default"
              onClick={() => void navigate({
                to: '/reports/$templateId/edit',
                params: { templateId },
              })}
            >
              <PencilIcon className="size-4" />
              Edit Template
            </Button>
            <Button
              onClick={() => setGenerateOpen(true)}
              disabled={template.status !== 'published'}
            >
              <PlayIcon className="size-4" />
              Generate Report
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <EllipsisVerticalIcon className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setVersionsOpen(true)}>
                  <HistoryIcon className="size-4" />
                  Versions
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2Icon className="size-4" />
                  Archive Template
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {search.trim()
            ? 'No instances match your search.'
            : 'No report instances yet.'}
        </p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[180px] font-medium">
                  Report ID
                </TableHead>
                <TableHead className="font-medium">
                  Status
                </TableHead>
                <TableHead className="font-medium">
                  Short URL
                </TableHead>
                <TableHead className="font-medium">
                  Created By
                </TableHead>
                <TableHead className="text-right font-medium">
                  Created On
                </TableHead>
                <TableHead className="text-right font-medium">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((instance) => (
                <TableRow
                  key={instance.id}
                  className="cursor-pointer"
                  onClick={() => void navigate({
                    to: '/reports/$templateId/instances/$readableId',
                    params: { templateId, readableId: instance.readable_id },
                  })}
                >
                  <TableCell className="min-w-[180px]">
                    {instance.readable_id}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={instance.status} />
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {instance.short_url ? (
                      <a
                        href={instance.short_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline hover:text-primary/80"
                      >
                        {instance.short_url}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">&mdash;</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {instance.created_by_name}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatDate(instance.created_at)}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void navigate({
                          to: '/reports/$templateId/instances/$readableId',
                          params: { templateId, readableId: instance.readable_id },
                        })}
                      >
                        View
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={instance.status !== 'ready' || exportingId === instance.id}
                          >
                            {exportingId === instance.id ? (
                              <Loader2Icon className="size-4 animate-spin" />
                            ) : (
                              <DownloadIcon className="size-4" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => void handleExportInstance(instance.id, 'pdf')}
                          >
                            <FileTextIcon className="size-4" />
                            Export as PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => void handleExportInstance(instance.id, 'docx')}
                          >
                            <FileTextIcon className="size-4" />
                            Export as Word
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination — pinned to bottom */}
          <div className="mt-auto flex items-center justify-between pt-4">
            <p className="text-sm text-muted-foreground">
              Showing {startIndex + 1}-
              {Math.min(startIndex + PAGE_SIZE, totalItems)} of {totalItems}{' '}
              reports
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              {getPageNumbers(safePage, totalPages).map((pageNum, i) =>
                pageNum === '...' ? (
                  <span
                    key={`ellipsis-${i}`}
                    className="px-2 text-sm text-muted-foreground"
                  >
                    ...
                  </span>
                ) : (
                  <Button
                    key={pageNum}
                    variant={pageNum === safePage ? 'outline' : 'ghost'}
                    size="sm"
                    className="min-w-[34px]"
                    onClick={() => setPage(pageNum as number)}
                  >
                    {pageNum}
                  </Button>
                ),
              )}
              <Button
                variant="ghost"
                size="sm"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Archive confirmation dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive report template?</AlertDialogTitle>
            <AlertDialogDescription>
              This will archive &ldquo;{template.name}&rdquo; and hide it from
              the active templates list. Existing report instances will still be
              accessible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault()
                void handleDelete()
              }}
            >
              {deleting ? 'Archiving...' : 'Archive'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Version history sheet */}
      <VersionHistorySheet
        open={versionsOpen}
        onOpenChange={setVersionsOpen}
        templateId={templateId}
        onRestored={() => void loadTemplate()}
      />

      {/* Generate report dialog */}
      <GenerateReportDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        reportTemplateId={templateId}
        formTemplateId={template.form_template_id}
        onGenerated={(instanceId, readableId, tmplId) => {
          watch({ instanceId, readableId, templateId: tmplId })
          void loadTemplate()
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { className: string; label: string; spinning?: boolean }> = {
    generating: {
      className: 'bg-amber-50 text-amber-700 border-amber-200',
      label: 'Generating',
      spinning: true,
    },
    ready: {
      className: 'bg-green-50 text-green-700 border-green-200',
      label: 'Ready',
    },
    failed: {
      className: 'bg-red-50 text-red-700 border-red-200',
      label: 'Failed',
    },
  }

  const { className, label, spinning } = config[status] ?? {
    className: 'bg-muted text-muted-foreground',
    label: status,
  }

  return (
    <Badge variant="outline" className={className}>
      {spinning && <Loader2Icon className="mr-1 size-3 animate-spin" />}
      {label}
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/**
 * Compute page numbers with ellipsis for pagination display.
 */
function getPageNumbers(
  current: number,
  total: number,
): (number | '...')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  const pages: (number | '...')[] = []
  const around = new Set([
    1,
    2,
    current - 1,
    current,
    current + 1,
    total - 1,
    total,
  ])

  let prev = 0
  for (const p of [...around].sort((a, b) => a - b)) {
    if (p < 1 || p > total) continue
    if (p - prev > 1) pages.push('...')
    pages.push(p)
    prev = p
  }

  return pages
}
