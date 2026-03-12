/**
 * CreateGroupDialog — dialog for creating a new group.
 * Receives a callback prop and has zero DB knowledge.
 */
import { type SubmitEvent, useState } from 'react'

import { toast } from 'sonner'

import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { PlusIcon } from 'lucide-react'

export function CreateGroupDialog({
  onCreated,
}: {
  onCreated: (name: string) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()

    if (!name.trim()) {
      toast.error('Missing name', { description: 'Please enter a group name.' })
      return
    }

    setSubmitting(true)

    const success = await onCreated(name.trim())

    if (success) {
      toast.success('Group created', { description: `"${name.trim()}" has been created.` })
      setName('')
      setOpen(false)
    }

    setSubmitting(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon className="size-4" />
          New Group
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create a new group</DialogTitle>
            <DialogDescription>
              Groups organize members who fill in forms together.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-4">
            <Label htmlFor="group-name">Group Name</Label>
            <Input
              id="group-name"
              placeholder="e.g. RoyalForms Louisiana"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Group'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
