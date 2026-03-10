/**
 * CreateInstanceSheet — right-side sheet for creating form instances.
 *
 * Matches the Figma "Create instance" design:
 * - Header: "Create instance" title
 * - Info banner: "You are creating an instance of [template name]"
 * - Radio selection: "All groups" / "Selected groups"
 * - When "Selected groups": shows a Card with search + checkbox table
 * - Footer: Cancel (outline) + Create instance (primary)
 */
import { useEffect, useMemo, useState } from 'react'

import { InfoIcon, SearchIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Checkbox } from '../../components/ui/checkbox'
import { Input } from '../../components/ui/input'
import { ScrollArea } from '../../components/ui/scroll-area'
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
import {
  fetchActiveGroups,
  createFormInstances,
} from '../../services/form-templates'
import { mapSupabaseError } from '../../lib/supabase-errors'

import type { SimpleGroup, CreatedInstance } from '../../services/form-templates'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CreateInstanceSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  templateId: string
  templateName: string
  onCreated: (instances: CreatedInstance[]) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateInstanceSheet({
  open,
  onOpenChange,
  templateId,
  templateName,
  onCreated,
}: CreateInstanceSheetProps) {
  const [groups, setGroups] = useState<SimpleGroup[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [groupMode, setGroupMode] = useState<'all' | 'selected'>('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)

  // Load groups when sheet opens
  useEffect(() => {
    if (!open) return

    async function load() {
      setLoading(true)
      try {
        const data = await fetchActiveGroups()
        setGroups(data)
        setSelectedIds(new Set())
        setGroupMode('all')
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
  }, [open])

  // Filter groups by search
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return groups
    return groups.filter((g) => g.name.toLowerCase().includes(q))
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
    filtered.length > 0 && filtered.every((g) => selectedIds.has(g.id))

  function toggleSelectAll() {
    setSelectedIds((prev) => {
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
    return [...selectedIds]
  }

  // Submit handler
  async function handleCreate() {
    const groupIds = getGroupIds()
    if (groupIds.length === 0) {
      toast.error('No groups selected', {
        description: 'Please select at least one group to create an instance for.',
      })
      return
    }

    setCreating(true)
    try {
      const result = await createFormInstances(templateId, groupIds)
      onCreated(result)
      onOpenChange(false)
    } catch (err: unknown) {
      const error = err as { code?: string; message: string }
      const mapped = mapSupabaseError(error.code, error.message, 'database', 'create_record')
      toast.error(mapped.title, { description: mapped.description })
    } finally {
      setCreating(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex min-w-[480px] flex-col sm:max-w-[640px]"
      >
        <SheetHeader>
          <SheetTitle>Create instance</SheetTitle>
          <SheetDescription className="sr-only">
            Create a new form instance from the selected template.
          </SheetDescription>
        </SheetHeader>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-4 overflow-hidden border-y px-4 py-4">
          {/* Info banner */}
          <div className="flex items-start gap-3 rounded-lg bg-muted px-4 py-3">
            <InfoIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              You are creating an instance of{' '}
              <span className="underline text-muted-foreground">
                {templateName}
              </span>
            </p>
          </div>

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
            <Card className="flex flex-1 flex-col gap-3 overflow-hidden py-4">
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
                        const isSelected = selectedIds.has(group.id)
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

        {/* Footer */}
        <SheetFooter className="flex-row justify-end gap-2 px-4 pb-4 pt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={creating}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={creating || loading}
          >
            {creating ? 'Creating...' : 'Create instance'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
