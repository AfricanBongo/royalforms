import { useEffect, useState } from 'react'

import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { FilterIcon, SearchIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Separator } from '../../../components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table'
import { StatCard } from '../../../components/stat-card'
import { CreateGroupDialog } from '../../../components/create-group-dialog'
import { useCurrentUser } from '../../../hooks/use-current-user'
import {
  createGroup,
  fetchGroups,
} from '../../../services/groups'
import type { GroupRow } from '../../../services/groups'
import { mapSupabaseError } from '../../../lib/supabase-errors'

export const Route = createFileRoute('/_authenticated/groups/')({
  component: GroupListPage,
})

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function GroupListPage() {
  const currentUser = useCurrentUser()
  const navigate = useNavigate()

  const [groups, setGroups] = useState<GroupRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const isRootAdmin = currentUser?.role === 'root_admin'

  // Non-root-admin users get redirected to their own group detail page
  useEffect(() => {
    if (currentUser && !isRootAdmin && currentUser.groupId) {
      void navigate({
        to: '/groups/$groupId',
        params: { groupId: currentUser.groupId },
        replace: true,
      })
    }
  }, [currentUser, isRootAdmin, navigate])

  // Filter groups by search term (UI-only logic)
  const filteredGroups = search.trim()
    ? groups.filter((g) =>
        g.name.toLowerCase().includes(search.trim().toLowerCase()),
      )
    : groups

  // Load groups on mount
  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const data = await fetchGroups()
        setGroups(data)
      } catch (err: unknown) {
        const error = err as { code?: string; message: string }
        const mapped = mapSupabaseError(error.code, error.message, 'database', 'read_record')
        toast.error(mapped.title, { description: mapped.description })
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [])

  // Handle group creation callback
  async function handleGroupCreated(name: string): Promise<boolean> {
    try {
      const newGroup = await createGroup(name)
      setGroups((prev) => [...prev, { ...newGroup, member_count: 0 }])
      return true
    } catch (err: unknown) {
      const error = err as { code?: string; message: string }
      const mapped = mapSupabaseError(error.code, error.message, 'database', 'create_record')
      toast.error(mapped.title, { description: mapped.description })
      return false
    }
  }

  // Stats (derived from UI state)
  const totalGroups = groups.length
  const activeGroups = groups.filter((g) => g.is_active).length
  const totalMembers = groups.reduce((sum, g) => sum + g.member_count, 0)

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      {/* Stat cards */}
      <div className="flex gap-2.5">
        <StatCard label="Total Groups" value={totalGroups} />
        <StatCard label="Active Groups" value={activeGroups} />
        <StatCard label="Total Members" value={totalMembers} />
      </div>

      {/* Toolbar (Root Admin only) */}
      {isRootAdmin && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative w-[320px]">
              <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search anything"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button variant="outline" size="default">
              <FilterIcon className="size-4" />
              Filters
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Separator orientation="vertical" className="h-6" />
            <CreateGroupDialog onCreated={handleGroupCreated} />
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading groups...</p>
      ) : filteredGroups.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {search.trim() ? 'No groups match your search.' : 'No groups found.'}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[240px] font-normal">Group Name</TableHead>
              <TableHead className="text-right font-normal">Members</TableHead>
              <TableHead className="text-right font-normal">Status</TableHead>
              <TableHead className="text-right font-normal">Created On</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredGroups.map((group) => (
              <TableRow
                key={group.id}
                className="cursor-pointer"
                onClick={() => void navigate({ to: '/groups/$groupId', params: { groupId: group.id } })}
              >
                <TableCell>{group.name}</TableCell>
                <TableCell className="text-right">{group.member_count}</TableCell>
                <TableCell className="text-right">
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
                </TableCell>
                <TableCell className="text-right">
                  {new Date(group.created_at).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
