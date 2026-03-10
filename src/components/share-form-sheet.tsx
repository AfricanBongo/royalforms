/**
 * ShareFormSheet — right-side sheet for managing group access to a form template.
 *
 * Matches the Figma "Share Form" design:
 * - Header: "Share Form" title
 * - Body: search input + table with Checkbox | Group name | Status
 * - Footer: Close (outline) + Share (primary) buttons
 *
 * Fetches all active groups on open, shows current access status,
 * and lets the user toggle checkboxes then save.
 */
import { useEffect, useMemo, useState } from 'react'

import { SearchIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from './ui/button'
import { Checkbox } from './ui/checkbox'
import { Input } from './ui/input'
import { ScrollArea } from './ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from './ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table'
import {
  fetchGroupsWithAccess,
  updateTemplateAccess,
} from '../services/form-templates'
import { mapSupabaseError } from '../lib/supabase-errors'

import type { GroupAccessRow } from '../services/form-templates'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ShareFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  templateId: string
  sharingMode?: string
  /** Called after a successful save so the parent can refresh stats. */
  onUpdated?: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ShareFormSheet({
  open,
  onOpenChange,
  templateId,
  sharingMode,
  onUpdated,
}: ShareFormSheetProps) {
  const [groups, setGroups] = useState<GroupAccessRow[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Load groups when sheet opens
  useEffect(() => {
    if (!open) return

    async function load() {
      setLoading(true)
      try {
        const data = await fetchGroupsWithAccess(templateId, sharingMode)
        setGroups(data)
        // Initialise checkboxes from current access
        setSelectedIds(new Set(
          data.filter((g) => g.has_access).map((g) => g.group_id),
        ))
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
  }, [open, templateId, sharingMode])

  // Filter groups by search
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return groups
    return groups.filter((g) => g.group_name.toLowerCase().includes(q))
  }, [groups, search])

  // Toggle a single group
  function toggleGroup(groupId: string) {
    setSelectedIds((prev) => {
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
    filtered.length > 0 && filtered.every((g) => selectedIds.has(g.group_id))

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allFilteredSelected) {
        for (const g of filtered) next.delete(g.group_id)
      } else {
        for (const g of filtered) next.add(g.group_id)
      }
      return next
    })
  }

  // Save access changes
  async function handleShare() {
    setSaving(true)
    try {
      await updateTemplateAccess(
        templateId,
        [...selectedIds],
        groups.length,
      )
      toast.success('Sharing settings updated')
      onUpdated?.()
      onOpenChange(false)
    } catch (err: unknown) {
      const error = err as { code?: string; message: string }
      const mapped = mapSupabaseError(error.code, error.message, 'database', 'create_record')
      toast.error(mapped.title, { description: mapped.description })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex min-w-[480px] flex-col sm:max-w-[640px]"
      >
        <SheetHeader>
          <SheetTitle>Share Form</SheetTitle>
          <SheetDescription className="sr-only">
            Select groups that should have access to this form template.
          </SheetDescription>
        </SheetHeader>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-3 overflow-hidden border-y px-4 py-4">
          {/* Search input */}
          <div className="relative w-[320px]">
            <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
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
            <ScrollArea className="flex-1">
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
                    <TableHead className="min-w-[240px] font-medium">
                      Group
                    </TableHead>
                    <TableHead className="text-right font-medium">
                      Status
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((group) => {
                    const isSelected = selectedIds.has(group.group_id)
                    return (
                      <TableRow
                        key={group.group_id}
                        className="cursor-pointer"
                        onClick={() => toggleGroup(group.group_id)}
                      >
                        <TableCell
                          className="w-[40px]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleGroup(group.group_id)}
                            aria-label={`Toggle access for ${group.group_name}`}
                          />
                        </TableCell>
                        <TableCell className="min-w-[240px]">
                          {group.group_name}
                        </TableCell>
                        <TableCell className="text-right">
                          {isSelected ? (
                            <span className="text-sm text-green-700">
                              Has Access
                            </span>
                          ) : (
                            <span className="text-sm text-red-600">
                              No Access
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </div>

        {/* Footer */}
        <SheetFooter className="flex-row justify-end gap-2 px-4 pb-4 pt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Close
          </Button>
          <Button
            onClick={handleShare}
            disabled={saving || loading}
          >
            {saving ? 'Saving...' : 'Share'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
