import { useEffect, useState } from 'react'

import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  ClockIcon,
  FilterIcon,
  PencilIcon,
  SearchIcon,
  SendIcon,
  Share2Icon,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '../../../../components/ui/badge'
import { Button } from '../../../../components/ui/button'
import { Checkbox } from '../../../../components/ui/checkbox'
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
import { ShareFormSheet } from '../../../../components/share-form-sheet'
import { StatCard } from '../../../../components/stat-card'
import { useCurrentUser } from '../../../../hooks/use-current-user'
import { usePageTitle } from '../../../../hooks/use-page-title'
import {
  fetchGroupAccessCount,
  fetchTemplateDetail,
  fetchTemplateInstances,
} from '../../../../services/form-templates'
import type {
  InstanceRow,
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

  // Load data on mount
  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [tmpl, inst] = await Promise.all([
          fetchTemplateDetail(templateId),
          fetchTemplateInstances(templateId),
        ])
        setTemplate(tmpl)
        setInstances(inst)
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
    }

    void load()
    return () => setPageTitle(null)
  }, [templateId, setPageTitle])

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
            <Button variant="outline" size="default">
              <ClockIcon className="size-4" />
              Versions
            </Button>
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
            <Button variant="outline" size="default" onClick={() => setShareOpen(true)}>
              <Share2Icon className="size-4" />
              Share
            </Button>
            <Button>
              <SendIcon className="size-4" />
              Create instance
            </Button>
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
                <TableRow key={instance.id} className="cursor-pointer">
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

          {/* Pagination */}
          <div className="flex items-center justify-between">
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
        onUpdated={() => void refreshGroupCount()}
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
    draft: {
      className: 'bg-amber-50 text-amber-700 border-amber-200',
      label: 'Draft',
    },
    pending: {
      className: 'bg-blue-50 text-blue-700 border-blue-200',
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
