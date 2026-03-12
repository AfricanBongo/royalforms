import { Link } from '@tanstack/react-router'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

import type { GroupMemberCompact } from '../types.ts'

interface GroupMembersListProps {
  members: GroupMemberCompact[] | undefined
  isLoading: boolean
  groupId: string
  totalMembers?: number
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

const roleBadgeVariant: Record<string, 'default' | 'secondary' | 'outline'> = {
  admin: 'default',
  editor: 'secondary',
  viewer: 'outline',
}

export function GroupMembersList({
  members,
  isLoading,
  groupId,
  totalMembers,
}: GroupMembersListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Group Members</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-8 rounded-full" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
            ))}
          </div>
        ) : !members?.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No members in this group
          </p>
        ) : (
          <div className="space-y-3">
            {members.map((member) => (
              <div key={member.id} className="flex items-center gap-3">
                <Avatar size="sm">
                  {member.avatar_url && (
                    <AvatarImage src={member.avatar_url} alt={member.full_name} />
                  )}
                  <AvatarFallback>{getInitials(member.full_name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{member.full_name}</p>
                </div>
                <Badge variant={roleBadgeVariant[member.role] ?? 'outline'}>
                  {member.role}
                </Badge>
              </div>
            ))}
          </div>
        )}
        {totalMembers != null && totalMembers > 0 && (
          <div className="mt-4 text-center">
            <Link
              to="/groups/$groupId"
              params={{ groupId }}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              View all {totalMembers} members &rarr;
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
