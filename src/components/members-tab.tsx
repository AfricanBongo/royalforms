/**
 * MembersTab — renders the Members tab content for the group detail page.
 * Shows a searchable table of group members with role-based dropdown
 * actions for Root Admin.
 */
import { useEffect, useState } from 'react'

import { MoreHorizontalIcon, SearchIcon } from 'lucide-react'
import { toast } from 'sonner'

import { getDefaultAvatarUri } from '../lib/avatar'
import { mapSupabaseError } from '../lib/supabase-errors'
import {
  fetchGroupMembers,
  changeRole,
  deactivateMember,
  moveMemberToGroup,
} from '../services/members'
import type { MemberRow } from '../services/members'
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { Input } from './ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table'
import { MoveToGroupDialog } from './move-to-group-dialog'

interface MembersTabProps {
  groupId: string
  isRootAdmin: boolean
}

const ASSIGNABLE_ROLES = ['admin', 'editor', 'viewer'] as const

export function MembersTab({ groupId, isRootAdmin }: MembersTabProps) {
  const [members, setMembers] = useState<MemberRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [moveDialogOpen, setMoveDialogOpen] = useState(false)
  const [memberToMove, setMemberToMove] = useState<MemberRow | null>(null)

  async function loadMembers() {
    try {
      setLoading(true)
      const data = await fetchGroupMembers(groupId)
      setMembers(data)
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string }
      const mapped = mapSupabaseError(
        error.code,
        error.message ?? 'Unknown error',
        'database',
        'read_record',
      )
      toast.error(mapped.title, { description: mapped.description })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadMembers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId])

  async function handleChangeRole(memberId: string, newRole: string) {
    try {
      await changeRole(memberId, newRole, groupId)
      toast.success('Role updated')
      await loadMembers()
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string }
      const mapped = mapSupabaseError(
        error.code,
        error.message ?? 'Unknown error',
        'database',
        'update_record',
      )
      toast.error(mapped.title, { description: mapped.description })
    }
  }

  async function handleDeactivate(memberId: string) {
    try {
      await deactivateMember(memberId, groupId)
      toast.success('Member deactivated')
      await loadMembers()
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string }
      const mapped = mapSupabaseError(
        error.code,
        error.message ?? 'Unknown error',
        'database',
        'update_record',
      )
      toast.error(mapped.title, { description: mapped.description })
    }
  }

  async function handleMoveConfirm(newGroupId: string) {
    if (!memberToMove) return

    try {
      await moveMemberToGroup(memberToMove.id, newGroupId, memberToMove.role)
      toast.success('Member moved')
      await loadMembers()
      setMoveDialogOpen(false)
      setMemberToMove(null)
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string }
      const mapped = mapSupabaseError(
        error.code,
        error.message ?? 'Unknown error',
        'database',
        'update_record',
      )
      toast.error(mapped.title, { description: mapped.description })
    }
  }

  const filtered = members.filter((m) => {
    const q = search.toLowerCase()
    return (
      m.full_name.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q)
    )
  })

  if (loading) {
    return <p className="py-8 text-center text-muted-foreground">Loading members...</p>
  }

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative w-[320px]">
        <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Members table */}
      {filtered.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">No members found.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="font-normal">Name</TableHead>
              <TableHead className="font-normal">Email</TableHead>
              <TableHead className="font-normal">Role</TableHead>
              <TableHead className="font-normal text-right">Joined On</TableHead>
              <TableHead className="font-normal text-right">Status</TableHead>
              {isRootAdmin && (
                <TableHead className="font-normal text-right">Actions</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((member) => (
              <TableRow key={member.id}>
                {/* Name with avatar */}
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Avatar className="size-8">
                      <AvatarImage
                        src={getDefaultAvatarUri(member.full_name)}
                        alt={member.full_name}
                      />
                      <AvatarFallback>
                        {member.full_name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span>{member.full_name}</span>
                  </div>
                </TableCell>

                {/* Email */}
                <TableCell>{member.email}</TableCell>

                {/* Role */}
                <TableCell>
                  <Badge variant="outline" className="capitalize">
                    {member.role === 'root_admin' ? 'Root Admin' : member.role}
                  </Badge>
                </TableCell>

                {/* Joined On */}
                <TableCell className="text-right">
                  {new Date(member.created_at).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  })}
                </TableCell>

                {/* Status */}
                <TableCell className="text-right">
                  <Badge
                    variant="outline"
                    className={
                      member.is_active
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }
                  >
                    {member.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>

                {/* Actions (Root Admin only) */}
                {isRootAdmin && (
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreHorizontalIcon className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {/* Change Role sub-menu */}
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>Change Role</DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            {ASSIGNABLE_ROLES.filter((r) => r !== member.role).map(
                              (role) => (
                                <DropdownMenuItem
                                  key={role}
                                  onClick={() => void handleChangeRole(member.id, role)}
                                  className="capitalize"
                                >
                                  {role}
                                </DropdownMenuItem>
                              ),
                            )}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>

                        {/* Move to Group */}
                        <DropdownMenuItem
                          onClick={() => {
                            setMemberToMove(member)
                            setMoveDialogOpen(true)
                          }}
                        >
                          Move to Group
                        </DropdownMenuItem>

                        <DropdownMenuSeparator />

                        {/* Deactivate Member */}
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => void handleDeactivate(member.id)}
                        >
                          Deactivate Member
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Move to Group dialog */}
      <MoveToGroupDialog
        open={moveDialogOpen}
        onOpenChange={setMoveDialogOpen}
        memberName={memberToMove?.full_name ?? ''}
        currentGroupId={groupId}
        onConfirm={handleMoveConfirm}
      />
    </div>
  )
}
