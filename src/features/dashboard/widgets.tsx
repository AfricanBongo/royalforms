/**
 * Dashboard widget components — all widgets as named exports.
 *
 * Each widget receives its data as props, shows a loading skeleton
 * when data is undefined, and renders inside a Shadcn Card.
 */
import { Link } from '@tanstack/react-router'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'

import type { RecentSubmission, GroupActivity, SystemStats, GroupMemberRow, DraftInstance, AssignedField } from '../../services/dashboard'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// ---------------------------------------------------------------------------
// Stat Card (reusable internal component)
// ---------------------------------------------------------------------------

interface StatCardProps {
  title: string
  value: number | undefined
  linkTo: string
  linkLabel: string
}

function StatCard({ title, value, linkTo, linkLabel }: StatCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {value === undefined ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <span className="text-3xl font-bold">{value}</span>
        )}
        <Link
          to={linkTo}
          className="text-sm text-primary hover:underline"
        >
          {linkLabel}
        </Link>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Widgets
// ---------------------------------------------------------------------------

interface PendingRequestsWidgetProps {
  count: number | undefined
}

export function PendingRequestsWidget({ count }: PendingRequestsWidgetProps) {
  return (
    <StatCard
      title="Pending Member Requests"
      value={count}
      linkTo="/groups"
      linkLabel="Manage requests"
    />
  )
}

interface RecentSubmissionsWidgetProps {
  submissions: RecentSubmission[] | undefined
  title?: string
}

export function RecentSubmissionsWidget({ submissions, title = 'Recent Submissions' }: RecentSubmissionsWidgetProps) {
  return (
    <Card className="col-span-1 md:col-span-2">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {submissions === undefined ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : submissions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No submissions yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Form</TableHead>
                <TableHead>Group</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {submissions.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link
                      to="/instances/$readableId"
                      params={{ readableId: s.readable_id }}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {s.template_name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {s.group_name ?? '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(s.submitted_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

interface ActiveSchedulesWidgetProps {
  count: number | undefined
}

export function ActiveSchedulesWidget({ count }: ActiveSchedulesWidgetProps) {
  return (
    <StatCard
      title="Active Schedules"
      value={count}
      linkTo="/forms"
      linkLabel="View forms"
    />
  )
}

interface GroupActivityWidgetProps {
  groups: GroupActivity[] | undefined
}

export function GroupActivityWidget({ groups }: GroupActivityWidgetProps) {
  return (
    <Card className="col-span-1 md:col-span-2 lg:col-span-3">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Group Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        {groups === undefined ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active groups.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Group</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Instances</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((g) => (
                <TableRow key={g.id}>
                  <TableCell>
                    <Link
                      to="/groups/$groupId"
                      params={{ groupId: g.id }}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {g.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {g.member_count}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {g.instance_count}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

interface SystemStatsWidgetProps {
  stats: SystemStats | undefined
}

export function SystemStatsWidget({ stats }: SystemStatsWidgetProps) {
  return (
    <Card className="col-span-1 md:col-span-2 lg:col-span-3">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          System Overview
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">Users</span>
            {stats === undefined ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <span className="text-2xl font-bold">{stats.total_users}</span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">Groups</span>
            {stats === undefined ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <span className="text-2xl font-bold">{stats.total_groups}</span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">Templates</span>
            {stats === undefined ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <span className="text-2xl font-bold">{stats.total_templates}</span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">Instances</span>
            {stats === undefined ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <span className="text-2xl font-bold">{stats.total_instances}</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

interface GroupMembersWidgetProps {
  members: GroupMemberRow[] | undefined
  groupId: string
}

export function GroupMembersWidget({ members, groupId }: GroupMembersWidgetProps) {
  return (
    <Card className="col-span-1 md:col-span-2">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Group Members
        </CardTitle>
      </CardHeader>
      <CardContent>
        {members === undefined ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : members.length === 0 ? (
          <p className="text-sm text-muted-foreground">No members in this group.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {members.slice(0, 5).map((m) => (
              <div key={m.id} className="flex items-center gap-3">
                <Avatar size="sm">
                  {m.avatar_url && <AvatarImage src={m.avatar_url} alt={m.full_name} />}
                  <AvatarFallback>{getInitials(m.full_name)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{m.full_name}</p>
                </div>
                <Badge variant="secondary" className="text-xs capitalize">
                  {m.role.replace('_', ' ')}
                </Badge>
              </div>
            ))}
            {members.length > 5 && (
              <Link
                to="/groups/$groupId"
                params={{ groupId }}
                className="text-sm text-primary hover:underline"
              >
                View all {members.length} members
              </Link>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface DraftInstancesWidgetProps {
  instances: DraftInstance[] | undefined
}

export function DraftInstancesWidget({ instances }: DraftInstancesWidgetProps) {
  return (
    <Card className="col-span-1 md:col-span-2">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Draft Instances
        </CardTitle>
      </CardHeader>
      <CardContent>
        {instances === undefined ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : instances.length === 0 ? (
          <p className="text-sm text-muted-foreground">No draft instances.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Form</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {instances.map((inst) => (
                <TableRow key={inst.id}>
                  <TableCell>
                    <Link
                      to="/instances/$readableId"
                      params={{ readableId: inst.readable_id }}
                      search={{ mode: 'edit' }}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {inst.template_name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {inst.readable_id}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(inst.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

interface AssignedFieldsWidgetProps {
  fields: AssignedField[] | undefined
}

export function AssignedFieldsWidget({ fields }: AssignedFieldsWidgetProps) {
  return (
    <Card className="col-span-1 md:col-span-2">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Assigned Fields
        </CardTitle>
      </CardHeader>
      <CardContent>
        {fields === undefined ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">No fields assigned to you.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Form</TableHead>
                <TableHead>Field</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((f) => (
                <TableRow key={f.field_id}>
                  <TableCell>
                    <Link
                      to="/instances/$readableId"
                      params={{ readableId: f.readable_id }}
                      search={{ mode: 'edit' }}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {f.template_name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {f.field_label}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

export function AvailableReportsWidget() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Available Reports
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Reports are coming soon. You will be able to view and export submitted form data here.
        </p>
      </CardContent>
    </Card>
  )
}
