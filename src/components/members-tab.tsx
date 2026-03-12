/**
 * MembersTab — renders the Members tab content for the group detail page.
 * Shows a searchable table of group members with role-based dropdown
 * actions for Root Admin.
 */
import { useEffect, useState } from 'react'

import { MailIcon, MoreHorizontalIcon, PencilIcon, SearchIcon, Trash2Icon } from 'lucide-react'
import { toast } from 'sonner'

import { getDefaultAvatarUri } from '../lib/avatar'
import { mapSupabaseError } from '../lib/supabase-errors'
import { resendInvite, changeInviteEmail, deleteInvite } from '../services/invite-management'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { ScrollArea, ScrollBar } from './ui/scroll-area'
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
  reloadKey: number
}

const ASSIGNABLE_ROLES = ['admin', 'editor', 'viewer'] as const

export function MembersTab({ groupId, isRootAdmin, reloadKey }: MembersTabProps) {
  const [members, setMembers] = useState<MemberRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [moveDialogOpen, setMoveDialogOpen] = useState(false)
  const [memberToMove, setMemberToMove] = useState<MemberRow | null>(null)
  const [changeEmailDialogOpen, setChangeEmailDialogOpen] = useState(false)
  const [memberToChangeEmail, setMemberToChangeEmail] = useState<MemberRow | null>(null)
  const [newEmail, setNewEmail] = useState('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [memberToDelete, setMemberToDelete] = useState<MemberRow | null>(null)

  /**
   * Returns the number of minutes remaining in the invite cooldown,
   * or 0 if the cooldown has elapsed (resend is allowed).
   */
  function getInviteCooldownMinutes(member: MemberRow): number {
    if (!member.last_invite_sent_at) return 0
    const RATE_LIMIT_MS = 60 * 60 * 1000 // 1 hour
    const elapsed = Date.now() - new Date(member.last_invite_sent_at).getTime()
    if (elapsed >= RATE_LIMIT_MS) return 0
    return Math.ceil((RATE_LIMIT_MS - elapsed) / 60000)
  }

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
  }, [groupId, reloadKey]) // eslint-disable-line react-hooks/exhaustive-deps

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

  async function handleResendInvite(member: MemberRow) {
    try {
      await resendInvite(member.id)
      toast.success('Invite resent', {
        description: `A new invite email has been sent to ${member.email}.`,
      })
    } catch (err: unknown) {
      const error = err as { code?: string; message: string }
      const mapped = mapSupabaseError(error.code, error.message, 'auth', 'general')
      toast.error(mapped.title, { description: mapped.description })
    }
  }

  async function handleChangeEmail() {
    if (!memberToChangeEmail || !newEmail.trim()) return
    try {
      await changeInviteEmail(memberToChangeEmail.id, newEmail.trim())
      toast.success('Email changed', {
        description: `Invite resent to ${newEmail.trim()}.`,
      })
      void loadMembers()
    } catch (err: unknown) {
      const error = err as { code?: string; message: string }
      const mapped = mapSupabaseError(error.code, error.message, 'auth', 'general')
      toast.error(mapped.title, { description: mapped.description })
    } finally {
      setChangeEmailDialogOpen(false)
      setMemberToChangeEmail(null)
      setNewEmail('')
    }
  }

  async function handleDeleteInvite() {
    if (!memberToDelete) return
    try {
      await deleteInvite(memberToDelete.id)
      toast.success('Invite deleted', {
        description: `${memberToDelete.full_name}'s invite has been deleted.`,
      })
      void loadMembers()
    } catch (err: unknown) {
      const error = err as { code?: string; message: string }
      const mapped = mapSupabaseError(error.code, error.message, 'auth', 'general')
      toast.error(mapped.title, { description: mapped.description })
    } finally {
      setDeleteDialogOpen(false)
      setMemberToDelete(null)
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
        <ScrollArea className="w-full">
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
                        src={member.avatar_url ?? getDefaultAvatarUri(member.full_name)}
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
                  {member.invite_status === 'invite_sent' ? (
                    <Badge
                      variant="outline"
                      className="bg-amber-50 text-amber-700 border-amber-200"
                    >
                      Invite Sent
                    </Badge>
                  ) : (
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
                  )}
                </TableCell>

                {/* Actions (Root Admin only) */}
                {isRootAdmin && (
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8" title="More actions">
                          <MoreHorizontalIcon className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {member.invite_status === 'invite_sent' ? (
                          (() => {
                            const cooldown = getInviteCooldownMinutes(member)
                            const MAX_FREE_CHANGES = 3
                            const changeCount = member.email_change_count ?? 0
                            const freeChangesLeft = Math.max(0, MAX_FREE_CHANGES - changeCount)
                            // Change email is only rate-limited after exhausting free changes
                            const changeEmailCooldown = changeCount >= MAX_FREE_CHANGES ? cooldown : 0
                            return (
                              <>
                                <DropdownMenuItem
                                  disabled={cooldown > 0}
                                  onClick={() => void handleResendInvite(member)}
                                >
                                  <MailIcon className="mr-2 size-4" />
                                  {cooldown > 0
                                    ? `Resend (${cooldown}m remaining)`
                                    : 'Resend Invite'}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={changeEmailCooldown > 0}
                                  onClick={() => {
                                    setMemberToChangeEmail(member)
                                    setNewEmail(member.email)
                                    setChangeEmailDialogOpen(true)
                                  }}
                                >
                                  <PencilIcon className="mr-2 size-4" />
                                  {changeEmailCooldown > 0
                                    ? `Change Email (${changeEmailCooldown}m remaining)`
                                    : freeChangesLeft > 0
                                      ? `Change Email (${freeChangesLeft} free left)`
                                      : 'Change Email'}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => {
                                    setMemberToDelete(member)
                                    setDeleteDialogOpen(true)
                                  }}
                                >
                                   <Trash2Icon className="mr-2 size-4" />
                                  Delete Invite
                                </DropdownMenuItem>
                              </>
                            )
                          })()
                        ) : (
                          <>
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
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
          </Table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      )}

      {/* Move to Group dialog */}
      <MoveToGroupDialog
        open={moveDialogOpen}
        onOpenChange={setMoveDialogOpen}
        memberName={memberToMove?.full_name ?? ''}
        currentGroupId={groupId}
        onConfirm={handleMoveConfirm}
      />

      {/* Change Email dialog */}
      <Dialog
        open={changeEmailDialogOpen}
        onOpenChange={(open) => {
          setChangeEmailDialogOpen(open)
          if (!open) {
            setMemberToChangeEmail(null)
            setNewEmail('')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change invite email</DialogTitle>
            <DialogDescription>
              Update the email address for {memberToChangeEmail?.full_name} and resend the invite.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-email">New email address</Label>
            <Input
              id="new-email"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="Enter new email address"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setChangeEmailDialogOpen(false)
                setMemberToChangeEmail(null)
                setNewEmail('')
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleChangeEmail()}
              disabled={!newEmail.trim() || newEmail.trim() === memberToChangeEmail?.email}
            >
              Change & Resend
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Invite dialog */}
      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open)
          if (!open) setMemberToDelete(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete invite</DialogTitle>
            <DialogDescription>
              This will permanently delete {memberToDelete?.full_name}&apos;s account and cancel their invite. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false)
                setMemberToDelete(null)
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDeleteInvite()}
            >
              Delete Invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
