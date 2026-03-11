import { useCallback, useEffect, useState } from 'react'

import { format } from 'date-fns'
import { CalendarIcon, Loader2Icon } from 'lucide-react'
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
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Sheet,
  SheetClose,
  SheetContent,
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import type { ReportVersionRow } from '../../services/reports'
import {
  fetchReportTemplateVersions,
  restoreReportTemplateVersion,
} from '../../services/reports'

interface VersionHistorySheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  templateId: string
  onRestored: () => void
}

export function VersionHistorySheet({
  open,
  onOpenChange,
  templateId,
  onRestored,
}: VersionHistorySheetProps) {
  const [versions, setVersions] = useState<ReportVersionRow[]>([])
  const [loading, setLoading] = useState(false)
  const [startDate, setStartDate] = useState<Date | undefined>()
  const [endDate, setEndDate] = useState<Date | undefined>()

  // Restore confirmation state
  const [restoreTarget, setRestoreTarget] = useState<ReportVersionRow | null>(
    null,
  )
  const [restoring, setRestoring] = useState(false)

  const loadVersions = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchReportTemplateVersions(templateId)
      // Client-side date filtering
      const filtered = data.filter((v) => {
        const created = new Date(v.created_at)
        if (startDate && created < startDate) return false
        if (endDate) {
          const end = new Date(endDate)
          end.setHours(23, 59, 59, 999)
          if (created > end) return false
        }
        return true
      })
      setVersions(filtered)
    } catch (err) {
      toast.error('Failed to load version history')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [templateId, startDate, endDate])

  // Load on open and when date range changes
  useEffect(() => {
    if (open) {
      void loadVersions()
    }
  }, [open, loadVersions])

  async function handleRestore() {
    if (!restoreTarget || restoring) return
    setRestoring(true)
    try {
      await restoreReportTemplateVersion(templateId, restoreTarget.id)
      toast.success(
        `Restored from v${String(restoreTarget.version_number)} — new version created`,
      )
      setRestoreTarget(null)
      void loadVersions()
      onRestored()
    } catch (err) {
      toast.error('Failed to restore version')
      console.error(err)
    } finally {
      setRestoring(false)
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="flex flex-col sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Version History</SheetTitle>
          </SheetHeader>

          {/* Date range filter */}
          <div className="flex gap-2.5 px-3">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="flex-1 justify-start font-normal text-left"
                >
                  <CalendarIcon className="size-4" />
                  {startDate ? (
                    format(startDate, 'yyyy-MM-dd')
                  ) : (
                    <span className="text-muted-foreground">Start Date</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={setStartDate}
                  autoFocus
                />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="flex-1 justify-start font-normal text-left"
                >
                  <CalendarIcon className="size-4" />
                  {endDate ? (
                    format(endDate, 'yyyy-MM-dd')
                  ) : (
                    <span className="text-muted-foreground">End Date</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={endDate}
                  onSelect={setEndDate}
                  autoFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Versions table */}
          <div className="flex-1 overflow-auto border rounded-lg mx-3">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : versions.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No versions found.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[80px]">Version</TableHead>
                    <TableHead className="min-w-[120px]">Created By</TableHead>
                    <TableHead className="min-w-[160px]">Date</TableHead>
                    <TableHead className="text-right min-w-[140px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {versions.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell>v{v.version_number}</TableCell>
                      <TableCell>{v.created_by_name}</TableCell>
                      <TableCell>
                        {format(
                          new Date(v.created_at),
                          'yyyy-MM-dd HH:mm:ss',
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {v.is_latest ? (
                          <Badge variant="outline">Current</Badge>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-primary"
                                  disabled
                                >
                                  View
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Coming soon</TooltipContent>
                            </Tooltip>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-primary"
                              onClick={() => setRestoreTarget(v)}
                            >
                              Restore
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          <SheetFooter>
            <SheetClose asChild>
              <Button variant="outline" className="max-w-[80px]">Close</Button>
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Restore confirmation dialog */}
      <AlertDialog
        open={restoreTarget !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setRestoreTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Restore v{restoreTarget?.version_number}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will create a new version with the content from v
              {restoreTarget?.version_number}. The current version will remain in
              the history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void handleRestore()
              }}
              disabled={restoring}
            >
              {restoring ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" />
                  Restoring...
                </>
              ) : (
                'Restore'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
