import { useEffect, useState } from 'react'

import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { FilterIcon, PlusIcon, SearchIcon } from 'lucide-react'
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
import { CreateReportTemplateDialog } from '../../../features/reports/CreateReportTemplateDialog'
import { useCurrentUser } from '../../../hooks/use-current-user'
import { fetchReportTemplates } from '../../../services/reports'
import type { ReportTemplateListRow } from '../../../services/reports'
import { mapSupabaseError } from '../../../lib/supabase-errors'

export const Route = createFileRoute('/_authenticated/reports/')({
  component: ReportTemplateListPage,
})

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 15

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function ReportTemplateListPage() {
  const currentUser = useCurrentUser()
  const navigate = useNavigate()

  const [tab, setTab] = useState<'active' | 'archived'>('active')
  const [templates, setTemplates] = useState<ReportTemplateListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  const isRootAdmin = currentUser?.role === 'root_admin'

  // Filter templates by tab (client-side)
  const tabFiltered = templates.filter((t) =>
    tab === 'active' ? t.is_active : !t.is_active,
  )

  // Filter by search term (client-side on name and linked form)
  const filtered = search.trim()
    ? tabFiltered.filter((t) => {
        const term = search.trim().toLowerCase()
        return (
          t.name.toLowerCase().includes(term) ||
          t.form_template_name.toLowerCase().includes(term)
        )
      })
    : tabFiltered

  // Pagination
  const totalItems = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const startIndex = (safePage - 1) * PAGE_SIZE
  const paged = filtered.slice(startIndex, startIndex + PAGE_SIZE)

  // Aggregate stats (across all active templates)
  const activeTemplates = templates.filter((t) => t.is_active)
  const totalTemplateCount = activeTemplates.length
  const autoGenerateOnCount = activeTemplates.filter((t) => t.auto_generate).length
  const totalReportsGenerated = activeTemplates.reduce(
    (sum, t) => sum + t.instance_count,
    0,
  )

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

  // Load templates on mount (single fetch, filter client-side by is_active)
  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const data = await fetchReportTemplates()
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
  }, [])

  // Reset to page 1 when search or tab changes
  useEffect(() => {
    setPage(1)
  }, [search, tab])

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      {/* Stat cards */}
      <div className="flex gap-2.5">
        <StatCard label="Total Templates" value={totalTemplateCount} />
        <StatCard label="Auto-Generate On" value={autoGenerateOnCount} />
        <StatCard label="Total Reports Generated" value={totalReportsGenerated} />
        <StatCard label="Failed Reports" value={0} />
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
          <Button onClick={() => setCreateDialogOpen(true)}>
            <PlusIcon className="size-4" />
            New Report Template
          </Button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Loading reports...
        </p>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {search.trim()
            ? 'No report templates match your search.'
            : 'No report templates found.'}
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
                <TableHead className="min-w-[200px] font-medium">
                  Report Name
                </TableHead>
                <TableHead className="min-w-[180px] font-medium">
                  Linked Form
                </TableHead>
                <TableHead className="text-right font-medium">
                  Version
                </TableHead>
                <TableHead className="font-medium">
                  Auto-Generate
                </TableHead>
                <TableHead className="text-right font-medium">
                  Reports Generated
                </TableHead>
                <TableHead className="text-right font-medium">
                  Updated On
                </TableHead>
                <TableHead className="text-right font-medium">
                  Created On
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((template) => (
                <TableRow
                  key={template.id}
                  className="cursor-pointer"
                  onClick={() =>
                    void navigate({
                      to: '/reports/$templateId',
                      params: { templateId: template.id },
                    })
                  }
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
                  <TableCell className="min-w-[200px]">
                    {template.name}
                  </TableCell>
                  <TableCell className="min-w-[180px]">
                    {template.form_template_name}
                  </TableCell>
                  <TableCell className="text-right">
                    v{template.latest_version_number}
                  </TableCell>
                  <TableCell>
                    <Badge variant={template.auto_generate ? 'default' : 'secondary'}>
                      {template.auto_generate ? 'On' : 'Off'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {template.instance_count}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatDate(template.updated_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatDate(template.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination — pinned to bottom */}
          <div className="mt-auto flex items-center justify-between pt-4">
            <p className="text-sm text-muted-foreground">
              Showing {startIndex + 1}-{Math.min(startIndex + PAGE_SIZE, totalItems)} of{' '}
              {totalItems} report templates
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

      {/* Create Report Template dialog */}
      <CreateReportTemplateDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
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
