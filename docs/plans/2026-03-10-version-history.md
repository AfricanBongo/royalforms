# Version History Sheet — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a version history side sheet to the template detail page with date filtering and version restore.

**Architecture:** New service functions (`fetchVersionHistory`, `restoreVersion`) query/write via Supabase client SDK. A `VersionHistorySheet` component uses Shadcn Sheet + Table + AlertDialog. Opened from the existing "Versions" button on the detail page.

**Tech Stack:** React, Shadcn UI (Sheet, Table, AlertDialog, Calendar, Popover), Supabase client SDK, date-fns, sonner toasts.

---

## Task 1: Install missing Shadcn components

**Step 1: Install alert-dialog, calendar, and popover**

Run:
```bash
npx shadcn@latest add @shadcn/alert-dialog @shadcn/calendar @shadcn/popover
```

**Step 2: Install date-fns and react-day-picker (calendar deps)**

These are peer deps of the Shadcn calendar component. Check if already installed:
```bash
npm ls date-fns react-day-picker 2>/dev/null || npm install date-fns@latest react-day-picker@latest
```

**Step 3: Verify files exist**

Confirm these files exist:
- `src/components/ui/alert-dialog.tsx`
- `src/components/ui/calendar.tsx`
- `src/components/ui/popover.tsx`

**Step 4: Commit**

```bash
git add src/components/ui/alert-dialog.tsx src/components/ui/calendar.tsx src/components/ui/popover.tsx package.json package-lock.json
git commit -m "chore(deps): add alert-dialog, calendar, and popover shadcn components"
```

---

## Task 2: Add `fetchVersionHistory` service function

**Files:**
- Modify: `src/services/form-templates.ts`

**Step 1: Add the `VersionHistoryRow` type**

After the `LoadedField` interface (around line 103), add:

```typescript
export interface VersionHistoryRow {
  id: string
  version_number: number
  is_latest: boolean
  restored_from: string | null
  status: string
  created_at: string
}
```

**Step 2: Add `fetchVersionHistory` function**

Add after the existing `fetchTemplateForEditing` function (after line 932). Place it in a new section:

```typescript
// ---------------------------------------------------------------------------
// Version History
// ---------------------------------------------------------------------------

export async function fetchVersionHistory(
  templateId: string,
  dateRange?: { from?: Date; to?: Date },
): Promise<VersionHistoryRow[]> {
  let query = supabase
    .from('template_versions')
    .select('id, version_number, is_latest, restored_from, status, created_at')
    .eq('template_id', templateId)
    .eq('status', 'published')
    .order('version_number', { ascending: false })

  if (dateRange?.from) {
    query = query.gte('created_at', dateRange.from.toISOString())
  }
  if (dateRange?.to) {
    // Set to end of day for inclusive filtering
    const endOfDay = new Date(dateRange.to)
    endOfDay.setHours(23, 59, 59, 999)
    query = query.lte('created_at', endOfDay.toISOString())
  }

  const { data, error } = await query

  if (error) throw error
  return data ?? []
}
```

**Step 3: Verify build**

Run: `npx tsc -b`

**Step 4: Commit**

```bash
git add src/services/form-templates.ts
git commit -m "feat(forms): add fetchVersionHistory service function"
```

---

## Task 3: Add `restoreVersion` service function

**Files:**
- Modify: `src/services/form-templates.ts`

**Step 1: Add `restoreVersion` function**

Add after `fetchVersionHistory`. This follows the exact same deep-copy pattern as `createDraftVersion` (lines 648-742):

```typescript
export async function restoreVersion(
  templateId: string,
  sourceVersionId: string,
): Promise<{ versionNumber: number; sourceVersionNumber: number }> {
  const user = await getCurrentAuthUser()

  // Get the source version's number for the return value
  const { data: sourceVer, error: svErr } = await supabase
    .from('template_versions')
    .select('version_number')
    .eq('id', sourceVersionId)
    .single()

  if (svErr) throw svErr

  // Get current latest version to determine new version number
  const { data: current, error: cvErr } = await supabase
    .from('template_versions')
    .select('id, version_number')
    .eq('template_id', templateId)
    .eq('is_latest', true)
    .single()

  if (cvErr) throw cvErr

  // Unset is_latest on current version
  const { error: unErr } = await supabase
    .from('template_versions')
    .update({ is_latest: false })
    .eq('id', current.id)

  if (unErr) throw unErr

  // Create new version as published, with restored_from pointing to source
  const newNum = current.version_number + 1
  const { data: newVer, error: nErr } = await supabase
    .from('template_versions')
    .insert({
      template_id: templateId,
      version_number: newNum,
      is_latest: true,
      status: 'published',
      restored_from: sourceVersionId,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (nErr) throw nErr

  // Deep-copy sections and fields from the source version
  const { data: sections, error: secErr } = await supabase
    .from('template_sections')
    .select('title, description, sort_order, template_fields(label, description, field_type, sort_order, is_required, options, validation_rules)')
    .eq('template_version_id', sourceVersionId)
    .order('sort_order')

  if (secErr) throw secErr

  for (const sec of sections ?? []) {
    const { data: newSec, error: nsErr } = await supabase
      .from('template_sections')
      .insert({
        template_version_id: newVer.id,
        title: sec.title,
        description: sec.description,
        sort_order: sec.sort_order,
      })
      .select('id')
      .single()

    if (nsErr) throw nsErr

    const fields = (sec.template_fields ?? []) as unknown as Array<{
      label: string
      description: string | null
      field_type: string
      sort_order: number
      is_required: boolean
      options: Json | null
      validation_rules: Json | null
    }>

    if (fields.length > 0) {
      const fieldRows = fields.map((f) => ({
        template_section_id: newSec.id,
        label: f.label,
        description: f.description,
        field_type: f.field_type,
        sort_order: f.sort_order,
        is_required: f.is_required,
        options: f.options,
        validation_rules: f.validation_rules,
      }))

      const { error: fErr } = await supabase
        .from('template_fields')
        .insert(fieldRows)

      if (fErr) throw fErr
    }
  }

  return { versionNumber: newNum, sourceVersionNumber: sourceVer.version_number }
}
```

**Step 2: Verify build**

Run: `npx tsc -b`

**Step 3: Commit**

```bash
git add src/services/form-templates.ts
git commit -m "feat(forms): add restoreVersion service function with deep-copy"
```

---

## Task 4: Create VersionHistorySheet component

**Files:**
- Create: `src/features/forms/VersionHistorySheet.tsx`

**Step 1: Create the component file**

This is a side sheet with a date range filter, a table of versions, and restore confirmation. Key behaviors:
- Loads version history on open
- Date range filtering via two date pickers (Start Date / End Date) with Shadcn Calendar+Popover
- Current version shows "Current" badge, no actions
- Past versions show disabled "View" button + active "Restore" button
- Restore triggers AlertDialog confirmation, then calls `restoreVersion`, toasts, and refreshes

```tsx
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

import type { VersionHistoryRow } from '../../services/form-templates'
import {
  fetchVersionHistory,
  restoreVersion,
} from '../../services/form-templates'

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
  const [versions, setVersions] = useState<VersionHistoryRow[]>([])
  const [loading, setLoading] = useState(false)
  const [startDate, setStartDate] = useState<Date | undefined>()
  const [endDate, setEndDate] = useState<Date | undefined>()

  // Restore confirmation state
  const [restoreTarget, setRestoreTarget] = useState<VersionHistoryRow | null>(null)
  const [restoring, setRestoring] = useState(false)

  const loadVersions = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchVersionHistory(templateId, {
        from: startDate,
        to: endDate,
      })
      setVersions(data)
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
    if (!restoreTarget) return
    setRestoring(true)
    try {
      const { versionNumber, sourceVersionNumber } = await restoreVersion(
        templateId,
        restoreTarget.id,
      )
      toast.success(
        `Restored from v${String(sourceVersionNumber)} — created v${String(versionNumber)}`,
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
        <SheetContent className="flex flex-col sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Form Versions</SheetTitle>
          </SheetHeader>

          {/* Date range filter */}
          <div className="flex gap-2.5">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="flex-1 justify-start font-normal text-left"
                >
                  <CalendarIcon className="size-4" />
                  {startDate ? format(startDate, 'yyyy-MM-dd') : (
                    <span className="text-muted-foreground">Start Date</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={setStartDate}
                  initialFocus
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
                  {endDate ? format(endDate, 'yyyy-MM-dd') : (
                    <span className="text-muted-foreground">End Date</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={endDate}
                  onSelect={setEndDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Versions table */}
          <div className="flex-1 overflow-auto border rounded-lg">
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
                    <TableHead className="min-w-[160px]">Date</TableHead>
                    <TableHead className="text-right min-w-[140px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {versions.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell>v{v.version_number}</TableCell>
                      <TableCell>
                        {format(new Date(v.created_at), 'yyyy-MM-dd HH:mm:ss')}
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
              <Button variant="outline">Close</Button>
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
              This will create a new published version with the content from
              v{restoreTarget?.version_number}. The current version will remain
              in the history.
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
```

**Step 2: Verify build**

Run: `npx tsc -b`

**Step 3: Commit**

```bash
git add src/features/forms/VersionHistorySheet.tsx
git commit -m "feat(forms): add VersionHistorySheet component with restore flow"
```

---

## Task 5: Wire up the Versions button on the detail page

**Files:**
- Modify: `src/routes/_authenticated/forms/$templateId/index.tsx`

**Step 1: Add state and import**

At the top of the file, add to imports:
```typescript
import { VersionHistorySheet } from '../../../../features/forms/VersionHistorySheet'
```

Next to the existing `shareOpen` state (line 69), add:
```typescript
const [versionsOpen, setVersionsOpen] = useState(false)
```

**Step 2: Wire the Versions button onClick**

Change the Versions button (lines 233-236) from:
```tsx
<Button variant="outline" size="default">
  <ClockIcon className="size-4" />
  Versions
</Button>
```
to:
```tsx
<Button variant="outline" size="default" onClick={() => setVersionsOpen(true)}>
  <ClockIcon className="size-4" />
  Versions
</Button>
```

**Step 3: Add the VersionHistorySheet component**

Place it next to the existing `ShareFormSheet` (around line 384). Add:
```tsx
<VersionHistorySheet
  open={versionsOpen}
  onOpenChange={setVersionsOpen}
  templateId={templateId}
  onRestored={() => void loadTemplate()}
/>
```

This calls `loadTemplate()` after a restore so the detail page refreshes to show the new current version.

Verify that `loadTemplate` is the function that refreshes the template data — it should be defined in the component's load effect. If it's inlined, extract it into a named function first.

**Step 4: Verify build**

Run: `npx tsc -b`

**Step 5: Commit**

```bash
git add src/routes/_authenticated/forms/\$templateId/index.tsx
git commit -m "feat(forms): wire Versions button to open version history sheet"
```

---

## Task 6: Update TODO.md and final verification

**Files:**
- Modify: `docs/TODO.md`

**Step 1: Check off the version history item**

Change:
```markdown
- [ ] Version history side sheet (view, restore)
```
to:
```markdown
- [x] Version history side sheet (restore only; view deferred to form instances)
```

**Step 2: Full build verification**

Run:
```bash
npm run build
```
Expected: exit 0

**Step 3: Lint check**

Run:
```bash
npm run lint
```
Verify no new lint errors.

**Step 4: Commit**

```bash
git add docs/TODO.md
git commit -m "docs(todo): check off version history sheet"
```
