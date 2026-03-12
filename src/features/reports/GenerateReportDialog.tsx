import { useCallback, useEffect, useMemo, useState } from 'react'

import { format, parseISO } from 'date-fns'
import { ChevronDownIcon, ChevronRightIcon, Loader2Icon } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

import type { FormInstanceRound } from '../../services/reports'
import { fetchFormInstanceRounds, generateReport } from '../../services/reports'
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
  const [rounds, setRounds] = useState<FormInstanceRound[]>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  // Map<roundDate, Set<formInstanceId>>
  const [selectedInstances, setSelectedInstances] = useState<Map<string, Set<string>>>(
    new Map(),
  )
  // Track which rounds are expanded
  const [expandedRounds, setExpandedRounds] = useState<Set<string>>(new Set())

  const totalSelectedCount = useMemo(() => {
    let count = 0
    for (const ids of selectedInstances.values()) {
      count += ids.size
    }
    return count
  }, [selectedInstances])

  const loadRounds = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchFormInstanceRounds(formTemplateId)
      setRounds(data)

      // Pre-select the latest round's submitted instances
      if (data.length > 0) {
        const latest = data[0]
        const submittedIds = new Set(
          latest.groups
            .filter((g) => g.status === 'submitted')
            .map((g) => g.formInstanceId),
        )
        if (submittedIds.size > 0) {
          setSelectedInstances(new Map([[latest.date, submittedIds]]))
        }
      }
    } catch (err) {
      toast.error('Failed to load form instance rounds')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [formTemplateId])

  useEffect(() => {
    if (open) {
      setSelectedInstances(new Map())
      setExpandedRounds(new Set())
      void loadRounds()
    }
  }, [open, loadRounds])

  function toggleRoundExpanded(date: string) {
    setExpandedRounds((prev) => {
      const next = new Set(prev)
      if (next.has(date)) {
        next.delete(date)
      } else {
        next.add(date)
      }
      return next
    })
  }

  function isRoundFullySelected(round: FormInstanceRound): boolean {
    const submittedIds = round.groups
      .filter((g) => g.status === 'submitted')
      .map((g) => g.formInstanceId)
    if (submittedIds.length === 0) return false
    const selected = selectedInstances.get(round.date)
    if (!selected) return false
    return submittedIds.every((id) => selected.has(id))
  }

  function isRoundPartiallySelected(round: FormInstanceRound): boolean {
    const selected = selectedInstances.get(round.date)
    if (!selected || selected.size === 0) return false
    const submittedIds = round.groups
      .filter((g) => g.status === 'submitted')
      .map((g) => g.formInstanceId)
    const selectedCount = submittedIds.filter((id) => selected.has(id)).length
    return selectedCount > 0 && selectedCount < submittedIds.length
  }

  function handleToggleRound(round: FormInstanceRound) {
    const submittedIds = round.groups
      .filter((g) => g.status === 'submitted')
      .map((g) => g.formInstanceId)
    if (submittedIds.length === 0) return

    setSelectedInstances((prev) => {
      const next = new Map(prev)
      if (isRoundFullySelected(round)) {
        // Deselect all from this round
        next.delete(round.date)
      } else {
        // Select all submitted from this round
        next.set(round.date, new Set(submittedIds))
      }
      return next
    })
  }

  function handleToggleGroup(roundDate: string, formInstanceId: string) {
    setSelectedInstances((prev) => {
      const next = new Map(prev)
      const roundSet = new Set(next.get(roundDate) ?? [])
      if (roundSet.has(formInstanceId)) {
        roundSet.delete(formInstanceId)
      } else {
        roundSet.add(formInstanceId)
      }
      if (roundSet.size === 0) {
        next.delete(roundDate)
      } else {
        next.set(roundDate, roundSet)
      }
      return next
    })
  }

  async function handleGenerate() {
    if (totalSelectedCount === 0 || generating) return
    setGenerating(true)
    try {
      // Flatten all selected instance IDs
      const allIds: string[] = []
      for (const ids of selectedInstances.values()) {
        for (const id of ids) {
          allIds.push(id)
        }
      }

      const result = await generateReport(reportTemplateId, allIds)
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

  function formatRoundDate(dateStr: string): string {
    return format(parseISO(dateStr), 'EEEE, MMMM d, yyyy')
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Generate Report</SheetTitle>
          <SheetDescription>
            Select rounds to include in this report. Expand a round to
            filter individual groups.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 px-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : rounds.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No form instance rounds available. Create and submit form
              instances first.
            </p>
          ) : (
            <div className="space-y-2">
              {rounds.map((round) => {
                const fullySelected = isRoundFullySelected(round)
                const partiallySelected = isRoundPartiallySelected(round)
                const hasSubmitted = round.submittedCount > 0
                const isExpanded = expandedRounds.has(round.date)

                return (
                  <Collapsible
                    key={round.date}
                    open={isExpanded}
                    onOpenChange={() => toggleRoundExpanded(round.date)}
                  >
                    <div className="rounded-lg border">
                      {/* Round header row */}
                      <div className="flex items-center gap-3 p-3">
                        <Checkbox
                          checked={fullySelected ? true : partiallySelected ? 'indeterminate' : false}
                          onCheckedChange={() => handleToggleRound(round)}
                          disabled={!hasSubmitted}
                          aria-label={`Select round ${round.date}`}
                        />
                        <CollapsibleTrigger asChild>
                          <button
                            type="button"
                            className="flex flex-1 items-center gap-2 text-left hover:opacity-80 transition-opacity"
                          >
                            {isExpanded ? (
                              <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {formatRoundDate(round.date)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {round.submittedCount}/{round.totalCount} groups
                                submitted
                              </p>
                            </div>
                          </button>
                        </CollapsibleTrigger>
                        {round.submittedCount === round.totalCount ? (
                          <Badge
                            variant="outline"
                            className="bg-green-50 text-green-700 border-green-200 shrink-0"
                          >
                            Complete
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-amber-50 text-amber-700 border-amber-200 shrink-0"
                          >
                            Partial
                          </Badge>
                        )}
                      </div>

                      {/* Expandable group details */}
                      <CollapsibleContent>
                        <div className="border-t px-3 pb-3 pt-2 space-y-1">
                          {round.groups.map((group) => {
                            const isSubmitted = group.status === 'submitted'
                            const roundSelected = selectedInstances.get(round.date)
                            const isGroupSelected = roundSelected?.has(group.formInstanceId) ?? false

                            return (
                              <div
                                key={group.formInstanceId}
                                className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50"
                              >
                                <Checkbox
                                  checked={isGroupSelected}
                                  onCheckedChange={() =>
                                    handleToggleGroup(round.date, group.formInstanceId)
                                  }
                                  disabled={!isSubmitted}
                                  aria-label={`Select ${group.groupName}`}
                                />
                                <span
                                  className={`flex-1 text-sm ${
                                    isSubmitted
                                      ? 'text-foreground'
                                      : 'text-muted-foreground'
                                  }`}
                                >
                                  {group.groupName}
                                </span>
                                {isSubmitted ? (
                                  <Badge
                                    variant="outline"
                                    className="bg-green-50 text-green-700 border-green-200 text-xs"
                                  >
                                    Submitted
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="outline"
                                    className="bg-muted text-muted-foreground text-xs"
                                  >
                                    Pending
                                  </Badge>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                )
              })}
            </div>
          )}
        </ScrollArea>

        <SheetFooter className="flex-row justify-between gap-2">
          <SheetClose asChild>
            <Button variant="outline">Close</Button>
          </SheetClose>
          <Button
            disabled={totalSelectedCount === 0 || generating}
            onClick={() => void handleGenerate()}
          >
            {generating ? (
              <>
                <Loader2Icon className="size-4 animate-spin" />
                Generating...
              </>
            ) : (
              `Generate Report (${totalSelectedCount})`
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
