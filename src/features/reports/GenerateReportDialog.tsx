import { useCallback, useEffect, useMemo, useState } from 'react'

import { format } from 'date-fns'
import { Loader2Icon, SearchIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import type { InstanceRow } from '../../services/form-templates'
import { fetchTemplateInstances } from '../../services/form-templates'
import { generateReport } from '../../services/reports'
import { mapSupabaseError } from '../../lib/supabase-errors'

interface GenerateReportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  reportTemplateId: string
  formTemplateId: string
  onGenerated: (instanceId: string, readableId: string, templateId: string) => void
}

export function GenerateReportDialog({
  open,
  onOpenChange,
  reportTemplateId,
  formTemplateId,
  onGenerated,
}: GenerateReportDialogProps) {
  const [instances, setInstances] = useState<InstanceRow[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [generating, setGenerating] = useState(false)

  // Only show submitted instances
  const submittedInstances = useMemo(
    () => instances.filter((i) => i.status === 'submitted'),
    [instances],
  )

  // Filter by search
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return submittedInstances
    return submittedInstances.filter(
      (i) =>
        i.readable_id.toLowerCase().includes(q) ||
        i.group_name.toLowerCase().includes(q),
    )
  }, [submittedInstances, search])

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((i) => selected.has(i.id))

  const loadInstances = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchTemplateInstances(formTemplateId)
      setInstances(data)
    } catch (err) {
      toast.error('Failed to load form instances')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [formTemplateId])

  // Load on open
  useEffect(() => {
    if (open) {
      setSelected(new Set())
      setSearch('')
      void loadInstances()
    }
  }, [open, loadInstances])

  function handleSelectAll() {
    if (allFilteredSelected) {
      // Deselect all filtered
      setSelected((prev) => {
        const next = new Set(prev)
        for (const i of filtered) next.delete(i.id)
        return next
      })
    } else {
      // Select all filtered
      setSelected((prev) => {
        const next = new Set(prev)
        for (const i of filtered) next.add(i.id)
        return next
      })
    }
  }

  function handleToggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  async function handleGenerate() {
    if (selected.size === 0 || generating) return
    setGenerating(true)
    try {
      const result = await generateReport(
        reportTemplateId,
        Array.from(selected),
      )
      toast.success('Report generation started')
      onGenerated(result.report_instance_id, result.readable_id, reportTemplateId)
      onOpenChange(false)
    } catch (err: unknown) {
      const error = err as { code?: string; message: string }
      const mapped = mapSupabaseError(
        error.code,
        error.message,
        'database',
        'create_record',
      )
      toast.error(mapped.title, { description: mapped.description })
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Generate Report</SheetTitle>
          <SheetDescription>
            Select submitted form instances to include in this report.
          </SheetDescription>
        </SheetHeader>

        {/* Search */}
        <div className="px-3">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by ID or group..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Instances table */}
        <div className="flex-1 overflow-auto border rounded-lg mx-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {search.trim()
                ? 'No matching submitted instances.'
                : 'No submitted form instances available.'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={allFilteredSelected}
                      onCheckedChange={handleSelectAll}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead className="min-w-[140px]">Instance ID</TableHead>
                  <TableHead className="min-w-[120px]">Group</TableHead>
                  <TableHead className="min-w-[100px]">Status</TableHead>
                  <TableHead className="text-right min-w-[120px]">
                    Submitted Date
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((instance) => (
                  <TableRow
                    key={instance.id}
                    className="cursor-pointer"
                    onClick={() => handleToggle(instance.id)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(instance.id)}
                        onCheckedChange={() => handleToggle(instance.id)}
                        aria-label={`Select ${instance.readable_id}`}
                      />
                    </TableCell>
                    <TableCell>{instance.readable_id}</TableCell>
                    <TableCell>{instance.group_name}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="bg-green-50 text-green-700 border-green-200"
                      >
                        Submitted
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {format(new Date(instance.created_at), 'dd/MM/yyyy')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <SheetFooter className="flex-row justify-between gap-2">
          <SheetClose asChild>
            <Button variant="outline">Close</Button>
          </SheetClose>
          <Button
            disabled={selected.size === 0 || generating}
            onClick={() => void handleGenerate()}
          >
            {generating ? (
              <>
                <Loader2Icon className="size-4 animate-spin" />
                Generating...
              </>
            ) : (
              `Generate (${selected.size})`
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
