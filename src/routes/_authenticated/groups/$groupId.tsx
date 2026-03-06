import { type FormEvent, useEffect, useState } from 'react'

import { createFileRoute } from '@tanstack/react-router'
import { Loader2Icon, PencilIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../../components/ui/tabs'
import { MembersTab } from '../../../components/members-tab'
import { RequestsTab } from '../../../components/requests-tab'
import { useCurrentUser } from '../../../hooks/use-current-user'
import { usePageTitle } from '../../../hooks/use-page-title'
import {
  deactivateGroup,
  fetchGroup,
  reactivateGroup,
  updateGroupName,
} from '../../../services/groups'
import type { GroupDetail } from '../../../services/groups'
import { mapSupabaseError } from '../../../lib/supabase-errors'

export const Route = createFileRoute('/_authenticated/groups/$groupId')({
  component: GroupDetailPage,
})

function GroupDetailPage() {
  const { groupId } = Route.useParams()
  const currentUser = useCurrentUser()
  const { setPageTitle } = usePageTitle()

  const [group, setGroup] = useState<GroupDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [saving, setSaving] = useState(false)

  const isRootAdmin = currentUser?.role === 'root_admin'
  const isAdminOrAbove =
    currentUser?.role === 'root_admin' || currentUser?.role === 'admin'

  // Set breadcrumb title when group loads
  useEffect(() => {
    if (group) {
      setPageTitle(group.name)
    }
    return () => setPageTitle(null)
  }, [group, setPageTitle])

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        setError(null)
        const data = await fetchGroup(groupId)
        setGroup(data)
      } catch (err: unknown) {
        const e = err as { code?: string; message?: string }
        const mapped = mapSupabaseError(
          e.code,
          e.message ?? 'Unknown error',
          'database',
          'read_record',
        )
        setError(`${mapped.title}: ${mapped.description}`)
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [groupId])

  async function handleEditName(e: FormEvent) {
    e.preventDefault()
    if (!editName.trim() || !group) return

    try {
      setSaving(true)
      await updateGroupName(groupId, editName)
      setGroup({ ...group, name: editName.trim() })
      setEditDialogOpen(false)
      toast.success('Group name updated')
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string }
      const mapped = mapSupabaseError(
        error.code,
        error.message ?? 'Unknown error',
        'database',
        'update_record',
      )
      toast.error(mapped.title, { description: mapped.description })
    } finally {
      setSaving(false)
    }
  }

  async function handleDeactivate() {
    if (!group) return

    try {
      await deactivateGroup(groupId)
      setGroup({ ...group, is_active: false })
      toast.success('Group deactivated')
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string }
      const mapped = mapSupabaseError(
        e.code,
        e.message ?? 'Unknown error',
        'database',
        'update_record',
      )
      toast.error(mapped.title, { description: mapped.description })
    }
  }

  async function handleReactivate() {
    if (!group) return

    try {
      await reactivateGroup(groupId)
      setGroup({ ...group, is_active: true })
      toast.success('Group reactivated')
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string }
      const mapped = mapSupabaseError(
        e.code,
        e.message ?? 'Unknown error',
        'database',
        'update_record',
      )
      toast.error(mapped.title, { description: mapped.description })
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Error state
  if (error || !group) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4">
        <p className="text-sm text-destructive">
          {error ?? 'Group not found.'}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">{group.name}</h1>
          <Badge
            variant="outline"
            className={
              group.is_active
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }
          >
            {group.is_active ? 'Active' : 'Inactive'}
          </Badge>
        </div>

        {isRootAdmin && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setEditName(group.name)
                setEditDialogOpen(true)
              }}
            >
              <PencilIcon className="mr-1.5 size-4" />
              Edit Name
            </Button>

            {group.is_active ? (
              <Button
                variant="outline"
                className="text-destructive"
                onClick={() => void handleDeactivate()}
              >
                Deactivate
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => void handleReactivate()}
              >
                Reactivate
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members">Members</TabsTrigger>
          {isAdminOrAbove && (
            <TabsTrigger value="requests">Requests</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="members">
          <MembersTab groupId={groupId} isRootAdmin={isRootAdmin} />
        </TabsContent>

        {isAdminOrAbove && (
          <TabsContent value="requests">
            <RequestsTab groupId={groupId} isRootAdmin={isRootAdmin} />
          </TabsContent>
        )}
      </Tabs>

      {/* Edit Name Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Group Name</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => void handleEditName(e)}>
            <div className="flex flex-col gap-4 py-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="group-name">Name</Label>
                <Input
                  id="group-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Group name"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !editName.trim()}>
                {saving && <Loader2Icon className="mr-1.5 size-4 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
