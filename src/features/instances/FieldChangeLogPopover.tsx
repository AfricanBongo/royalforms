import { ClockIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'

import type { ChangeLogEntry, GroupMember } from '../../services/form-templates'

interface FieldChangeLogPopoverProps {
  changeLog: ChangeLogEntry[]
  members: GroupMember[]
  /** Current user ID — used to show "You" for own changes */
  currentUserId?: string
  /** Whether the viewer is admin/root_admin — admins see all names */
  isAdmin?: boolean
}

function resolveUserName(
  userId: string,
  members: GroupMember[],
  currentUserId?: string,
  isAdmin?: boolean,
  fallbackName?: string,
): string {
  if (currentUserId && userId === currentUserId) return 'You'
  if (isAdmin) {
    const member = members.find((m) => m.id === userId)
    if (member) return member.full_name
    if (fallbackName) return fallbackName
    return 'Unknown user'
  }
  // Non-admins see generic label for other users
  return 'Another user'
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  const month = date.toLocaleString('en-US', { month: 'short' })
  const day = date.getDate()
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${month} ${day}, ${hours}:${minutes}`
}

function DisplayValue({ value }: { value: string | null }) {
  if (value === null || value === '') {
    return <span className="text-muted-foreground italic">(empty)</span>
  }
  return <span className="break-all">{value}</span>
}

export function FieldChangeLogPopover({
  changeLog,
  members,
  currentUserId,
  isAdmin,
}: FieldChangeLogPopoverProps) {
  const sorted = [...changeLog].sort(
    (a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime(),
  )

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6 shrink-0"
          title="View change history"
        >
          <ClockIcon className="size-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="px-3 py-2">
          <p className="text-sm font-medium">Change history</p>
        </div>

        {sorted.length === 0 ? (
          <div className="px-3 pb-3">
            <p className="text-xs text-muted-foreground">No changes yet</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[280px]">
            <div className="space-y-0">
              {sorted.map((entry, i) => (
                <div
                  key={`${entry.changed_at}-${entry.changed_by}-${i}`}
                  className="px-3 py-2 border-t text-xs"
                >
                  <div className="flex items-center justify-between gap-2 text-muted-foreground mb-1">
                    <span className="truncate">
                      {resolveUserName(entry.changed_by, members, currentUserId, isAdmin, entry.changed_by_name)}
                    </span>
                    <span className="shrink-0">{formatTimestamp(entry.changed_at)}</span>
                  </div>
                  <div className="leading-relaxed">
                    <DisplayValue value={entry.old_value} />
                    <span className="text-muted-foreground mx-1">&rarr;</span>
                    <DisplayValue value={entry.new_value} />
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  )
}
