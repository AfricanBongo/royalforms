import { useCallback, useEffect, useState } from 'react'

import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  ChevronDownIcon,
  EllipsisVerticalIcon,
  FilePlus,
  FilterIcon,
  HistoryIcon,
  PencilIcon,
  SearchIcon,
  ShareIcon,
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
import { Checkbox } from '../../../../components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../../components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../../../components/ui/dropdown-menu'
import { Input } from '../../../../components/ui/input'
import { Label } from '../../../../components/ui/label'
import { RadioGroup, RadioGroupItem } from '../../../../components/ui/radio-group'
import { Separator } from '../../../../components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../../components/ui/table'
import { ShareFormSheet } from '../../../../components/share-form-sheet'
import { VersionHistorySheet } from '../../../../features/forms/VersionHistorySheet'
import { CreateInstanceSheet } from '../../../../features/forms/CreateInstanceSheet'
import { CreateInstanceSuccessDialog } from '../../../../features/forms/CreateInstanceSuccessDialog'
import { ScheduleInstanceSheet } from '../../../../features/forms/ScheduleInstanceSheet'
import { ScheduleInstanceSuccessDialog } from '../../../../features/forms/ScheduleInstanceSuccessDialog'
import { StatCard } from '../../../../components/stat-card'
import { useCurrentUser } from '../../../../hooks/use-current-user'
import { usePageTitle } from '../../../../hooks/use-page-title'
import {
  archiveTemplate,
  deleteTemplate,
  fetchGroupAccessCount,
  fetchTemplateDetail,
  fetchTemplateInstances,
  fetchTemplateSchedule,
  hardDeleteTemplate,
} from '../../../../services/form-templates'
import type {
  CreatedInstance,
  InstanceRow,
  ScheduleData,
  TemplateDetail,
} from '../../../../services/form-templates'
import { mapSupabaseError } from '../../../../lib/supabase-errors'

export const Route = createFileRoute('/_authenticated/forms/$templateId/')({
  component: TemplateDetailPage,
})

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 15

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function TemplateDetailPage() {
  const { templateId } = Route.useParams()
  const currentUser = useCurrentUser()
  const navigate = useNavigate()
  const { setPageTitle } = usePageTitle()

  const [template, setTemplate] = useState<TemplateDetail | null>(null)
  const [instances, setInstances] = useState<InstanceRow[]>([])
  const [groupCount, setGroupCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [shareOpen, setShareOpen] = useState(false)
  const [versionsOpen, setVersionsOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteWithInstancesOpen, setDeleteWithInstancesOpen] = useState(false)
  const [deleteChoice, setDeleteChoice] = useState<'archive' | 'hard-delete'>('archive')
  const [confirmName, setConfirmName] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [createSuccessOpen, setCreateSuccessOpen] = useState(false)
  const [createdInstances, setCreatedInstances] = useState<CreatedInstance[]>([])
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [scheduleSuccessOpen, setScheduleSuccessOpen] = useState(false)
  const [schedule, setSchedule] = useState<ScheduleData | null>(null)

  const isRootAdmin = currentUser?.role === 'root_admin'

  // Filter instances by search (readable_id or group_name)
  const filtered = search.trim()
    ? instances.filter(
        (i) =>
          i.readable_id
            .toLowerCase()
            .includes(search.trim().toLowerCase()) ||
          i.group_name
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

  // Selection helpers
  const allPageSelected =
    paged.length > 0 && paged.every((i) => selectedIds.has(i.id))

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allPageSelected) {
        for (const i of paged) next.delete(i.id)
      } else {
        for (const i of paged) next.add(i.id)
      }
      return next
    })
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // Load template data — extracted so it can be re-called after restore
  const loadTemplate = useCallback(async () => {
    setLoading(true)
    try {
      const [tmpl, inst, sched] = await Promise.all([
        fetchTemplateDetail(templateId),
        fetchTemplateInstances(templateId),
        fetchTemplateSchedule(templateId),
      ])
      setTemplate(tmpl)
      setInstances(inst)
      setSchedule(sched)
      setPageTitle(tmpl.name)

      // Fetch group access count separately (needs sharing_mode)
      const count = await fetchGroupAccessCount(
        templateId,
        tmpl.sharing_mode,
      )
      setGroupCount(count)
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

  // Refresh group count after sharing settings change
  async function refreshGroupCount() {
    if (!template) return
    try {
      // Re-fetch template to get updated sharing_mode
      const tmpl = await fetchTemplateDetail(templateId)
      setTemplate(tmpl)
      const count = await fetchGroupAccessCount(templateId, tmpl.sharing_mode)
      setGroupCount(count)
    } catch {
      // Silently fail — the page already has data
    }
  }

  // Delete template (hard delete — only when no instances)
  async function handleDelete() {
    if (deleting) return
    setDeleting(true)
    try {
      await deleteTemplate(templateId)
      toast.success('Form template deleted')
      void navigate({ to: '/forms' })
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

  // Archive template (soft-delete)
  async function handleArchive() {
    if (deleting) return
    setDeleting(true)
    try {
      await archiveTemplate(templateId)
      toast.success('Form template archived')
      void navigate({ to: '/forms' })
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
      setDeleting(false)
      setDeleteWithInstancesOpen(false)
    }
  }

  // Hard-delete template with all instances
  async function handleHardDelete() {
    if (deleting) return
    setDeleting(true)
    try {
      await hardDeleteTemplate(templateId)
      toast.success('Form template and all instances permanently deleted')
      void navigate({ to: '/forms' })
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
      setDeleteWithInstancesOpen(false)
      setConfirmName('')
      setDeleteChoice('archive')
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4">
        <p className="py-8 text-center text-sm text-muted-foreground">
          Loading template...
        </p>
      </div>
    )
  }

  if (!template) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4">
        <p className="py-8 text-center text-sm text-muted-foreground">
          Template not found.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      {/* Stat cards */}
      <div className="flex gap-2.5">
        <StatCard
          label="Form Version"
          value={`v${template.latest_version}`}
        />
        <StatCard label="Submitted" value={template.submitted_count} />
        <StatCard label="Pending" value={template.pending_count} />
        <StatCard label="Groups Shared With" value={groupCount} />
      </div>

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
                to: '/forms/$templateId/edit',
                params: { templateId },
              })}
            >
              <PencilIcon className="size-4" />
              Edit Form
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button>
                  <FilePlus className="size-4" />
                  Create instance
                  <ChevronDownIcon className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setCreateOpen(true)}>
                  Create instance
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setScheduleOpen(true)}>
                  {schedule ? 'Edit schedule' : 'Schedule instance'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
                <DropdownMenuItem onClick={() => setShareOpen(true)}>
                  <ShareIcon className="size-4" />
                  Share
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => {
                    if (instances.length > 0) {
                      setDeleteWithInstancesOpen(true)
                    } else {
                      setDeleteOpen(true)
                    }
                  }}
                >
                  <Trash2Icon className="size-4" />
                  Delete Form
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
            : 'No form instances yet.'}
        </p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={allPageSelected}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead className="min-w-[240px] font-medium">
                  Form Title
                </TableHead>
                <TableHead className="min-w-[240px] text-right font-medium">
                  Group
                </TableHead>
                <TableHead className="text-right font-medium">
                  Status
                </TableHead>
                <TableHead className="text-right font-medium">
                  Form Version
                </TableHead>
                <TableHead className="text-right font-medium">
                  Created On
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((instance) => (
                <TableRow
                  key={instance.id}
                  className="cursor-pointer"
                  onClick={() => void navigate({
                    to: '/instances/$readableId',
                    params: { readableId: instance.readable_id },
                    search: { mode: getInstanceMode(instance.status, currentUser?.role) },
                  })}
                >
                  <TableCell
                    className="w-[40px]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      checked={selectedIds.has(instance.id)}
                      onCheckedChange={() => toggleSelect(instance.id)}
                      aria-label={`Select ${instance.readable_id}`}
                    />
                  </TableCell>
                  <TableCell className="min-w-[240px]">
                    {instance.readable_id}
                  </TableCell>
                  <TableCell className="min-w-[240px] text-right">
                    {instance.group_name}
                  </TableCell>
                  <TableCell className="text-right">
                    <StatusBadge status={instance.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    v{instance.version_number}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatDate(instance.created_at)}
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
              forms
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

      {/* Share form sheet */}
      <ShareFormSheet
        open={shareOpen}
        onOpenChange={setShareOpen}
        templateId={templateId}
        sharingMode={template.sharing_mode}
        onUpdated={() => void refreshGroupCount()}
      />

      {/* Version history sheet */}
      <VersionHistorySheet
        open={versionsOpen}
        onOpenChange={setVersionsOpen}
        templateId={templateId}
        onRestored={() => void loadTemplate()}
      />

      {/* Delete confirmation dialog (hard delete — no instances) */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete form template?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &ldquo;{template.name}&rdquo; and all
              its versions. This action cannot be undone.
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
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete dialog — template with instances (archive vs hard-delete) */}
      <Dialog
        open={deleteWithInstancesOpen}
        onOpenChange={(open) => {
          setDeleteWithInstancesOpen(open)
          if (!open) {
            setDeleteChoice('archive')
            setConfirmName('')
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Delete &ldquo;{template.name}&rdquo;?</DialogTitle>
            <DialogDescription>
              This template has {instances.length} instance{instances.length !== 1 ? 's' : ''}. Choose how to proceed.
            </DialogDescription>
          </DialogHeader>

          <RadioGroup
            value={deleteChoice}
            onValueChange={(v) => {
              setDeleteChoice(v as 'archive' | 'hard-delete')
              setConfirmName('')
            }}
            className="gap-3"
          >
            <div className="flex items-start gap-3 rounded-md border p-3">
              <RadioGroupItem value="archive" id="delete-archive" className="mt-0.5" />
              <div className="grid gap-1">
                <Label htmlFor="delete-archive" className="font-medium">
                  Archive (recommended)
                </Label>
                <p className="text-sm text-muted-foreground">
                  Hide the template and its instances from the active list. You can restore it later from the Archived tab.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-md border border-destructive/30 p-3">
              <RadioGroupItem value="hard-delete" id="delete-hard" className="mt-0.5" />
              <div className="grid gap-1">
                <Label htmlFor="delete-hard" className="font-medium text-destructive">
                  Permanently delete everything
                </Label>
                <p className="text-sm text-muted-foreground">
                  This will permanently delete the template, all {instances.length} instance{instances.length !== 1 ? 's' : ''}, and their data. This cannot be undone.
                </p>
              </div>
            </div>
          </RadioGroup>

          {deleteChoice === 'hard-delete' && (
            <div className="grid gap-2">
              <Label htmlFor="confirm-name" className="text-sm">
                Type <span className="font-semibold">{template.name}</span> to confirm
              </Label>
              <Input
                id="confirm-name"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={template.name}
              />
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              disabled={deleting}
              onClick={() => setDeleteWithInstancesOpen(false)}
            >
              Cancel
            </Button>
            {deleteChoice === 'archive' ? (
              <Button
                disabled={deleting}
                onClick={() => void handleArchive()}
              >
                {deleting ? 'Archiving...' : 'Archive template'}
              </Button>
            ) : (
              <Button
                variant="destructive"
                disabled={deleting || confirmName !== template.name}
                onClick={() => void handleHardDelete()}
              >
                {deleting ? 'Deleting...' : 'Permanently delete'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create instance sheet */}
      <CreateInstanceSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        templateId={templateId}
        templateName={template.name}
        onCreated={(result) => {
          setCreatedInstances(result)
          setCreateSuccessOpen(true)
          void loadTemplate()
        }}
      />

      {/* Create instance success dialog */}
      <CreateInstanceSuccessDialog
        open={createSuccessOpen}
        onOpenChange={(v) => {
          setCreateSuccessOpen(v)
          if (!v) setCreatedInstances([])
        }}
        instances={createdInstances}
      />

      {/* Schedule instance sheet */}
      <ScheduleInstanceSheet
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        templateId={templateId}
        templateName={template.name}
        existingSchedule={schedule}
        onSaved={() => {
          setScheduleSuccessOpen(true)
          void loadTemplate()
        }}
        onDeleted={() => {
          setSchedule(null)
        }}
      />

      {/* Schedule instance success dialog */}
      <ScheduleInstanceSuccessDialog
        open={scheduleSuccessOpen}
        onOpenChange={setScheduleSuccessOpen}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { className: string; label: string }> = {
    submitted: {
      className: 'bg-green-50 text-green-700 border-green-200',
      label: 'Submitted',
    },
    pending: {
      className: 'bg-amber-50 text-amber-700 border-amber-200',
      label: 'Pending',
    },
  }

  const { className, label } = config[status] ?? {
    className: 'bg-muted text-muted-foreground',
    label: status,
  }

  return (
    <Badge variant="outline" className={className}>
      {label}
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInstanceMode(status: string, role: string | undefined): 'view' | 'edit' {
  if (!role || role === 'root_admin' || role === 'viewer') return 'view'
  if (status === 'submitted') return 'view'
  return 'edit'
}

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
