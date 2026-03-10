import { useState } from 'react'

import { UserIcon, UserCheckIcon, XIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'

import type { GroupMember } from '../../services/form-templates'

interface FieldAssignmentPopoverProps {
  fieldId: string
  instanceId: string
  assignedTo: string | null
  members: GroupMember[]
  onAssigned: (memberId: string | null) => void
  disabled: boolean
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function FieldAssignmentPopover({
  assignedTo,
  members,
  onAssigned,
  disabled,
}: FieldAssignmentPopoverProps) {
  const [open, setOpen] = useState(false)

  if (disabled) return null

  const assignedMember = assignedTo
    ? members.find((m) => m.id === assignedTo) ?? null
    : null

  const isAssigned = assignedTo !== null

  function handleAssign(memberId: string | null) {
    onAssigned(memberId)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6 shrink-0"
        >
          {isAssigned ? (
            <UserCheckIcon className="size-3.5 text-blue-500" />
          ) : (
            <UserIcon className="size-3.5 text-muted-foreground" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        {/* Header */}
        <div className="px-3 py-2">
          <p className="text-sm font-medium">
            {isAssigned ? 'Reassign field' : 'Assign field'}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {assignedMember ? (
              <span className="flex items-center gap-1.5">
                {assignedMember.full_name}
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {capitalize(assignedMember.role)}
                </Badge>
              </span>
            ) : (
              'Open to all'
            )}
          </p>
        </div>

        <Separator />

        {/* Member list */}
        <div className="max-h-48 overflow-y-auto py-1">
          {members.map((member) => (
            <button
              key={member.id}
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent transition-colors text-left"
              onClick={() => handleAssign(member.id)}
            >
              <span className="truncate flex-1">{member.full_name}</span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                {capitalize(member.role)}
              </Badge>
            </button>
          ))}
          {members.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              No members available
            </p>
          )}
        </div>

        {/* Unassign option */}
        {isAssigned && (
          <>
            <Separator />
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-destructive hover:bg-accent transition-colors"
              onClick={() => handleAssign(null)}
            >
              <XIcon className="size-3.5" />
              Unassign
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
