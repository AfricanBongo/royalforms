import { useEffect, useState } from 'react'

import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { FilterIcon, PlusIcon, RotateCcwIcon, SearchIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
import { Checkbox } from '../../../components/ui/checkbox'
import { Input } from '../../../components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table'
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '../../../components/ui/tabs'
import { StatCard } from '../../../components/stat-card'
import { useCurrentUser } from '../../../hooks/use-current-user'
import { fetchTemplates, restoreTemplate } from '../../../services/form-templates'
import type { TemplateListRow } from '../../../services/form-templates'
import { mapSupabaseError } from '../../../lib/supabase-errors'

export const Route = createFileRoute('/_authenticated/forms/')({
  component: FormTemplateListPage,
})

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 15

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function FormTemplateListPage() {
  const currentUser = useCurrentUser()
  const navigate = useNavigate()

  const [tab, setTab] = useState<'active' | 'archived'>('active')
  const [templates, setTemplates] = useState<TemplateListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [restoringId, setRestoringId] = useState<string | null>(null)

  const isRootAdmin = currentUser?.role === 'root_admin'

  // Filter templates by search term (client-side)
  const filtered = search.trim()
    ? templates.filter((t) =>
        t.name.toLowerCase().includes(search.trim().toLowerCase()),
      )
    : templates

  // Pagination
  const totalItems = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const startIndex = (safePage - 1) * PAGE_SIZE
  const paged = filtered.slice(startIndex, startIndex + PAGE_SIZE)

  // Aggregate stats (across all templates)
  const totalInstances = templates.reduce(
    (sum, t) => sum + t.submitted_count + t.pending_count,
    0,
  )
  const submittedInstances = templates.reduce(
    (sum, t) => sum + t.submitted_count,
    0,
  )
  const pendingInstances = templates.reduce(
    (sum, t) => sum + t.pending_count,
    0,
  )
  const draftCount = templates.filter((t) => t.status === 'draft').length

  // Selection helpers
  const allPageSelected =
    paged.length > 0 && paged.every((t) => selectedIds.has(t.id))

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allPageSelected) {
        for (const t of paged) next.delete(t.id)
      } else {
        for (const t of paged) next.add(t.id)
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

  async function handleRestore(templateId: string) {
    setRestoringId(templateId)
    try {
      await restoreTemplate(templateId)
      toast.success('Template restored')
      setTemplates((prev) => prev.filter((t) => t.id !== templateId))
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
      setRestoringId(null)
    }
  }

  // Load templates on mount and when tab changes
  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const data = await fetchTemplates(tab === 'archived')
        setTemplates(data)
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
  }, [tab])

  // Reset to page 1 when search or tab changes
  useEffect(() => {
    setPage(1)
  }, [search, tab])

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      {/* Stat cards */}
      <div className="flex gap-2.5">
        <StatCard label="Total Instances" value={totalInstances} />
        <StatCard label="Submitted Instances" value={submittedInstances} />
        <StatCard label="Pending Instances" value={pendingInstances} />
        <StatCard label="Drafts" value={draftCount} />
      </div>

      {/* Active / Archived tabs */}
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as 'active' | 'archived')}
      >
        <TabsList>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="archived">Archived</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Toolbar */}
      <div className="flex items-center justify-between">
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
        {isRootAdmin && (
          <Button
            onClick={() => void navigate({ to: '/forms/new' })}
          >
            <PlusIcon className="size-4" />
            New Form
          </Button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Loading forms...
        </p>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {search.trim()
            ? 'No forms match your search.'
            : 'No form templates found.'}
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
                <TableHead className="text-right font-medium">
                  Form Version
                </TableHead>
                <TableHead className="text-right font-medium">
                  Submitted
                </TableHead>
                <TableHead className="text-right font-medium">
                  Pending
                </TableHead>
                <TableHead className="text-right font-medium">
                  Updated On
                </TableHead>
                <TableHead className="text-right font-medium">
                  Created On
                </TableHead>
                {tab === 'archived' && isRootAdmin && (
                  <TableHead className="w-[100px] text-right font-medium">
                    Actions
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((template) => (
                <TableRow
                  key={template.id}
                  className="cursor-pointer"
                  onClick={() => {
                    // Navigate to edit for drafts or published templates being edited
                    if (template.status === 'draft' || template.latest_version_status === 'draft') {
                      void navigate({
                        to: '/forms/$templateId/edit',
                        params: { templateId: template.id },
                      })
                    } else {
                      void navigate({
                        to: '/forms/$templateId',
                        params: { templateId: template.id },
                      })
                    }
                  }}
                >
                  <TableCell
                    className="w-[40px]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      checked={selectedIds.has(template.id)}
                      onCheckedChange={() => toggleSelect(template.id)}
                      aria-label={`Select ${template.name}`}
                    />
                  </TableCell>
                  <TableCell className="min-w-[240px]">
                    <div className="flex items-center gap-2">
                      {template.name}
                      {template.status === 'draft' && (
                        <Badge variant="secondary" className="text-xs">Draft</Badge>
                      )}
                      {template.status === 'published' && template.latest_version_status === 'draft' && (
                        <Badge variant="outline" className="text-xs">Editing</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    v{template.latest_version}
                  </TableCell>
                  <TableCell className="text-right">
                    {template.submitted_count}
                  </TableCell>
                  <TableCell className="text-right">
                    {template.pending_count}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatDate(template.updated_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatDate(template.created_at)}
                  </TableCell>
                  {tab === 'archived' && isRootAdmin && (
                    <TableCell
                      className="text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={restoringId === template.id}
                        onClick={() => void handleRestore(template.id)}
                      >
                        <RotateCcwIcon className="size-4" />
                        {restoringId === template.id ? 'Restoring...' : 'Restore'}
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination — pinned to bottom */}
          <div className="mt-auto flex items-center justify-between pt-4">
            <p className="text-sm text-muted-foreground">
              Showing {startIndex + 1}-{Math.min(startIndex + PAGE_SIZE, totalItems)} of{' '}
              {totalItems} forms
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
    </div>
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
 * Always shows first, last, and pages around the current page.
 */
function getPageNumbers(
  current: number,
  total: number,
): (number | '...')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  const pages: (number | '...')[] = []
  const around = new Set([1, 2, current - 1, current, current + 1, total - 1, total])

  let prev = 0
  for (const p of [...around].sort((a, b) => a - b)) {
    if (p < 1 || p > total) continue
    if (p - prev > 1) pages.push('...')
    pages.push(p)
    prev = p
  }

  return pages
}
