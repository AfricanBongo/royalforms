/**
 * ScheduleInstanceSheet — right-side sheet for creating or editing
 * instance schedules.
 *
 * Matches the Figma "Schedule instance" design:
 * - Header: "Schedule instance" title + X close button
 * - Info banner: scheduling context message
 * - "Send On" row: date picker
 * - "Should repeat" card with checkbox, day toggles, interval select
 * - Group mode selection: all / selected with searchable table
 * - Footer: Delete schedule (destructive, edit only) | Cancel + Create/Save
 */
import { useEffect, useMemo, useState } from 'react'

import { Link } from '@tanstack/react-router'
import { CalendarIcon, InfoIcon, SearchIcon } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'

import { Button } from '../../components/ui/button'
import { Calendar } from '../../components/ui/calendar'
import { Card } from '../../components/ui/card'
import { Checkbox } from '../../components/ui/checkbox'
import { Input } from '../../components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover'
import { ScrollArea } from '../../components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '../../components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group'
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
import {
  fetchActiveGroups,
  createInstanceSchedule,
  updateInstanceSchedule,
  deleteInstanceSchedule,
} from '../../services/form-templates'
import { supabase } from '../../services/supabase'
import { mapSupabaseError } from '../../lib/supabase-errors'

import type { SimpleGroup, ScheduleData } from '../../services/form-templates'

// ---------------------------------------------------------------------------
// Day config
// ---------------------------------------------------------------------------

const DAYS = [
  { value: 'mon', label: 'Mon' },
  { value: 'tue', label: 'Tue' },
  { value: 'wed', label: 'Wed' },
  { value: 'thu', label: 'Thur' },
  { value: 'fri', label: 'Fri' },
  { value: 'sat', label: 'Sat' },
  { value: 'sun', label: 'Sun' },
] as const

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ScheduleInstanceSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  templateId: string
  templateName: string
  existingSchedule: ScheduleData | null
  onSaved: () => void
  onDeleted: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScheduleInstanceSheet({
  open,
  onOpenChange,
  templateId,
  templateName,
  existingSchedule,
  onSaved,
  onDeleted,
}: ScheduleInstanceSheetProps) {
  const isEditing = existingSchedule !== null

  // Groups state
  const [groups, setGroups] = useState<SimpleGroup[]>([])
  const [loading, setLoading] = useState(false)

  // Form state
  const [sendDate, setSendDate] = useState<Date | undefined>(undefined)
  const [shouldRepeat, setShouldRepeat] = useState(false)
  const [daysOfWeek, setDaysOfWeek] = useState<string[]>([])
  const [repeatInterval, setRepeatInterval] = useState<string>('')
  const [groupMode, setGroupMode] = useState<'all' | 'selected'>('all')
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')

  // Action state
  const [saving, setSaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Linked report templates (for auto-generate notice)
  const [linkedReports, setLinkedReports] = useState<{ id: string; name: string; auto_generate: boolean }[]>([])

  // Load groups when sheet opens and pre-fill if editing
  useEffect(() => {
    if (!open) return

    async function load() {
      setLoading(true)
      try {
        const data = await fetchActiveGroups()
        setGroups(data)

        // Fetch linked report templates for auto-generate notice
        const { data: reports } = await supabase
          .from('report_templates')
          .select('id, name, auto_generate')
          .eq('form_template_id', templateId)
          .eq('is_active', true)
        setLinkedReports(reports ?? [])

        if (existingSchedule) {
          setSendDate(new Date(existingSchedule.start_date))
          const hasRepeat =
            existingSchedule.days_of_week !== null &&
            existingSchedule.days_of_week.length > 0
          setShouldRepeat(hasRepeat)
          setDaysOfWeek(existingSchedule.days_of_week ?? [])
          setRepeatInterval(existingSchedule.repeat_interval)
          setSelectedGroupIds(new Set(existingSchedule.group_ids))
          setGroupMode(
            existingSchedule.group_ids.length === data.length ? 'all' : 'selected',
          )
        } else {
          setSendDate(undefined)
          setShouldRepeat(false)
          setDaysOfWeek([])
          setRepeatInterval('')
          setGroupMode('all')
          setSelectedGroupIds(new Set())
        }

        setSearch('')
      } catch (err: unknown) {
        const error = err as { code?: string; message: string }
        const mapped = mapSupabaseError(error.code, error.message, 'database', 'read_record')
        toast.error(mapped.title, { description: mapped.description })
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [open, existingSchedule, templateId])

  // Filter groups by search
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return groups
    return groups.filter((g) => g.name.toLowerCase().includes(q))
  }, [groups, search])

  // Toggle a single group
  function toggleGroup(groupId: string) {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) {
        next.delete(groupId)
      } else {
        next.add(groupId)
      }
      return next
    })
  }

  // Toggle all visible groups
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((g) => selectedGroupIds.has(g.id))

  function toggleSelectAll() {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev)
      if (allFilteredSelected) {
        for (const g of filtered) next.delete(g.id)
      } else {
        for (const g of filtered) next.add(g.id)
      }
      return next
    })
  }

  // Determine which group IDs to submit
  function getGroupIds(): string[] {
    if (groupMode === 'all') {
      return groups.map((g) => g.id)
    }
    return [...selectedGroupIds]
  }

  // Validate form before submit
  function validate(): boolean {
    if (!sendDate) {
      toast.error('Send date required', {
        description: 'Please select a date to send the instance.',
      })
      return false
    }

    if (shouldRepeat) {
      if (daysOfWeek.length === 0) {
        toast.error('Repeat days required', {
          description: 'Please select at least one day of the week to repeat on.',
        })
        return false
      }
      if (!repeatInterval) {
        toast.error('Repeat interval required', {
          description: 'Please select how often the schedule should repeat.',
        })
        return false
      }
    }

    const groupIds = getGroupIds()
    if (groupIds.length === 0) {
      toast.error('No groups selected', {
        description: 'Please select at least one group to send the instance to.',
      })
      return false
    }

    return true
  }

  // Submit handler
  async function handleSubmit() {
    if (!validate()) return

    const groupIds = getGroupIds()

    setSaving(true)
    try {
      if (isEditing) {
        await updateInstanceSchedule({
          scheduleId: existingSchedule.id,
          startDate: format(sendDate!, 'yyyy-MM-dd'),
          repeatInterval: shouldRepeat ? repeatInterval : 'daily',
          repeatEvery: 1,
          daysOfWeek: shouldRepeat ? daysOfWeek : null,
          groupIds,
        })
        toast.success('Schedule updated')
      } else {
        await createInstanceSchedule({
          templateId,
          startDate: format(sendDate!, 'yyyy-MM-dd'),
          repeatInterval: shouldRepeat ? repeatInterval : 'daily',
          repeatEvery: 1,
          daysOfWeek: shouldRepeat ? daysOfWeek : null,
          groupIds,
        })
        toast.success('Schedule created')
      }
      onSaved()
      onOpenChange(false)
    } catch (err: unknown) {
      const error = err as { code?: string; message: string }
      const mapped = mapSupabaseError(error.code, error.message, 'database', 'create_record')
      toast.error(mapped.title, { description: mapped.description })
    } finally {
      setSaving(false)
    }
  }

  // Delete handler
  async function handleDelete() {
    if (!existingSchedule) return

    setDeleting(true)
    try {
      await deleteInstanceSchedule(existingSchedule.id)
      toast.success('Schedule deleted')
      onDeleted()
      onOpenChange(false)
    } catch (err: unknown) {
      const error = err as { code?: string; message: string }
      const mapped = mapSupabaseError(error.code, error.message, 'database', 'delete_record')
      toast.error(mapped.title, { description: mapped.description })
    } finally {
      setDeleting(false)
      setDeleteOpen(false)
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="flex min-w-[480px] flex-col sm:max-w-[640px]"
        >
          <SheetHeader>
            <SheetTitle>Schedule instance</SheetTitle>
            <SheetDescription className="sr-only">
              {isEditing
                ? 'Edit the schedule for creating form instances.'
                : 'Schedule automatic creation of form instances.'}
            </SheetDescription>
          </SheetHeader>

          {/* Body */}
          <ScrollArea className="flex-1 border-y">
          <div className="flex flex-col gap-4 px-4 py-4">
            {/* Info banner */}
            <div className="flex items-start gap-3 rounded-lg bg-muted px-4 py-3">
              <InfoIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {isEditing ? (
                  <>
                    You are editing schedule of{' '}
                    <span className="underline text-muted-foreground">
                      {templateName}
                    </span>
                  </>
                ) : (
                  <>
                    You are scheduling an instance of{' '}
                    <span className="underline text-muted-foreground">
                      {templateName}
                    </span>
                  </>
                )}
              </p>
            </div>

            {/* Linked report auto-generate notice */}
            {linkedReports.length > 0 && (
              <div className="rounded-lg border border-border bg-muted/50 px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  This form has {linkedReports.length === 1 ? 'a linked report' : `${linkedReports.length} linked reports`}:
                </p>
                <ul className="mt-1 space-y-1">
                  {linkedReports.map((r) => (
                    <li key={r.id} className="flex items-center justify-between text-sm">
                      <span className="font-medium text-foreground">{r.name}</span>
                      <span className="flex items-center gap-2">
                        <span className={r.auto_generate ? 'text-green-600' : 'text-muted-foreground'}>
                          Auto-generate {r.auto_generate ? 'on' : 'off'}
                        </span>
                        <Link
                          to="/reports/$templateId/edit"
                          params={{ templateId: r.id }}
                          className="text-xs text-primary underline-offset-4 hover:underline"
                        >
                          Manage
                        </Link>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Send On row */}
            <div className="flex items-center gap-1">
              <span className="w-[120px] shrink-0 text-sm font-medium">
                Send On
              </span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="min-w-0 flex-1 justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 size-4" />
                    {sendDate ? format(sendDate, 'PPP') : (
                      <span className="text-muted-foreground">Send Date</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={sendDate}
                    onSelect={setSendDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Should repeat card */}
            <Card className="border p-4 shadow-sm">
              <div className="flex flex-col gap-4">
                {/* Checkbox */}
                <label className="flex cursor-pointer items-center gap-3">
                  <Checkbox
                    checked={shouldRepeat}
                    onCheckedChange={(checked) => setShouldRepeat(checked === true)}
                  />
                  <span className="text-sm font-medium">Should repeat</span>
                </label>

                {/* Repeat options (shown when checked) */}
                {shouldRepeat && (
                  <>
                    {/* Repeat On row */}
                    <div className="flex items-center gap-4">
                      <span className="w-[120px] shrink-0 text-sm font-medium">
                        Repeat On
                      </span>
                      <ToggleGroup
                        type="multiple"
                        variant="outline"
                        value={daysOfWeek}
                        onValueChange={setDaysOfWeek}
                        className="flex-wrap"
                      >
                        {DAYS.map((day) => (
                          <ToggleGroupItem
                            key={day.value}
                            value={day.value}
                            aria-label={day.label}
                          >
                            {day.label}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                    </div>

                    {/* Repeat Every row */}
                    <div className="flex items-center gap-4">
                      <span className="w-[120px] shrink-0 text-sm font-medium">
                        Repeat Every
                      </span>
                      <Select
                        value={repeatInterval}
                        onValueChange={setRepeatInterval}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select interval" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="bi_weekly">Bi-weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
              </div>
            </Card>

            {/* Share heading */}
            <h3 className="text-lg font-medium">
              Share and send instance to:
            </h3>

            {/* Group mode selection */}
            <div className="flex flex-col gap-3">
              <label
                className="flex cursor-pointer items-center gap-3"
                onClick={() => setGroupMode('all')}
              >
                <Checkbox
                  checked={groupMode === 'all'}
                  onCheckedChange={() => setGroupMode('all')}
                />
                <span className="text-sm font-medium">All groups</span>
              </label>

              <label
                className="flex cursor-pointer items-center gap-3"
                onClick={() => setGroupMode('selected')}
              >
                <Checkbox
                  checked={groupMode === 'selected'}
                  onCheckedChange={() => setGroupMode('selected')}
                />
                <span className="text-sm font-medium">Selected groups</span>
              </label>
            </div>

            {/* Group selection table (only when "Selected groups" is active) */}
            {groupMode === 'selected' && (
              <Card className="flex max-h-[320px] flex-col gap-3 overflow-hidden py-4">
                {/* Search input */}
                <div className="relative w-[280px] px-4">
                  <SearchIcon className="absolute left-7 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search groups"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>

                {/* Groups table */}
                {loading ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Loading groups...
                  </p>
                ) : filtered.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {search.trim()
                      ? 'No groups match your search.'
                      : 'No groups available.'}
                  </p>
                ) : (
                  <ScrollArea className="flex-1 px-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[40px]">
                            <Checkbox
                              checked={allFilteredSelected}
                              onCheckedChange={toggleSelectAll}
                              aria-label="Select all groups"
                            />
                          </TableHead>
                          <TableHead className="font-medium">
                            Group
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.map((group) => {
                          const isSelected = selectedGroupIds.has(group.id)
                          return (
                            <TableRow
                              key={group.id}
                              className="cursor-pointer"
                              onClick={() => toggleGroup(group.id)}
                            >
                              <TableCell
                                className="w-[40px]"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleGroup(group.id)}
                                  aria-label={`Toggle ${group.name}`}
                                />
                              </TableCell>
                              <TableCell>{group.name}</TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </Card>
            )}
          </div>
          </ScrollArea>

          {/* Footer */}
          <SheetFooter className="flex-row justify-between gap-2 px-4 pb-4 pt-2">
            <div>
              {isEditing && (
                <Button
                  variant="destructive"
                  onClick={() => setDeleteOpen(true)}
                  disabled={saving || deleting}
                >
                  Delete schedule
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={saving || loading}
              >
                {saving
                  ? 'Saving...'
                  : isEditing
                    ? 'Save changes'
                    : 'Create instance'}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              Upcoming scheduled instances will no longer be created. This cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void handleDelete()
              }}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
