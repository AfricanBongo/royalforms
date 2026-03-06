/**
 * MoveToGroupDialog — confirmation dialog for moving a member to another group.
 * Fetches available groups on open, lets Root Admin pick a target group,
 * then delegates the actual move to the parent via onConfirm.
 */
import { useEffect, useState } from 'react'

import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'

import { fetchGroups, type GroupRow } from '../services/groups'

interface MoveToGroupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  memberName: string
  currentGroupId: string
  onConfirm: (newGroupId: string) => Promise<void>
}

export function MoveToGroupDialog({
  open,
  onOpenChange,
  memberName,
  currentGroupId,
  onConfirm,
}: MoveToGroupDialogProps) {
  const [groups, setGroups] = useState<GroupRow[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Fetch groups when the dialog opens; reset state when it closes
  useEffect(() => {
    if (!open) {
      setSelectedGroupId('')
      setGroups([])
      return
    }

    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const allGroups = await fetchGroups()
        if (!cancelled) {
          // Only show active groups that are not the member's current group
          setGroups(
            allGroups.filter(
              (g) => g.is_active && g.id !== currentGroupId,
            ),
          )
        }
      } catch {
        // Parent handles errors globally; keep dialog usable
        if (!cancelled) setGroups([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [open, currentGroupId])

  async function handleConfirm() {
    if (!selectedGroupId) return

    setSubmitting(true)
    try {
      await onConfirm(selectedGroupId)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move {memberName} to another group</DialogTitle>
          <DialogDescription>
            This will revoke their access to the current group&apos;s data.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Select
            value={selectedGroupId}
            onValueChange={setSelectedGroupId}
            disabled={loading || submitting}
          >
            <SelectTrigger className="w-full">
              <SelectValue
                placeholder={loading ? 'Loading groups...' : 'Select a group'}
              />
            </SelectTrigger>
            <SelectContent>
              {groups.map((group) => (
                <SelectItem key={group.id} value={group.id}>
                  {group.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedGroupId || submitting}
          >
            {submitting ? 'Moving...' : 'Move Member'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
