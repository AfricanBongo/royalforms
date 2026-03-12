/**
 * Dashboard service — query functions for role-adaptive dashboard widgets.
 *
 * All queries use the Supabase Client SDK with RLS.
 * The currently authenticated user's JWT determines what they can see.
 */
import { supabase } from './supabase'

import type {
  TrendDataPoint,
  GroupBreakdownPoint,
  StatCardData,
  ActionItem,
  RecentFormInstance,
  RecentReportInstance,
  GroupMemberCompact,
  AssignedFieldGroup,
} from '../features/dashboard/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns an ISO date string for `now - days`. */
function computeSinceDate(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

/** Human-readable label for a time range. */
function rangeLabel(days: number): string {
  if (days <= 7) return 'this week'
  if (days <= 30) return 'this month'
  return 'this quarter'
}

/**
 * Fill missing dates with count=0 so trend charts have a complete date series.
 * `data` must have `date` in YYYY-MM-DD format.
 */
function fillDateGaps(
  data: { date: string; count: number }[],
  days: number,
): TrendDataPoint[] {
  const map = new Map<string, number>()
  for (const d of data) {
    map.set(d.date, (map.get(d.date) ?? 0) + d.count)
  }

  const result: TrendDataPoint[] = []
  const now = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    result.push({ date: key, count: map.get(key) ?? 0 })
  }
  return result
}

// ---------------------------------------------------------------------------
// Trend queries
// ---------------------------------------------------------------------------

/**
 * Submission trend: count of submitted form instances per day.
 * Optionally filtered by group.
 */
export async function fetchSubmissionTrend(
  days: number,
  groupId?: string,
): Promise<TrendDataPoint[]> {
  const sinceDate = computeSinceDate(days)

  let query = supabase
    .from('form_instances')
    .select('submitted_at')
    .eq('status', 'submitted')
    .gte('submitted_at', sinceDate)

  if (groupId) {
    query = query.eq('group_id', groupId)
  }

  const { data, error } = await query

  if (error) throw error

  const grouped = (data ?? []).map((row) => ({
    date: row.submitted_at!.slice(0, 10),
    count: 1,
  }))

  return fillDateGaps(grouped, days)
}

/**
 * Editor activity trend: count of submissions the editor contributed to per day.
 * Looks for form instances where the editor has assigned field_values.
 */
export async function fetchEditorActivityTrend(
  userId: string,
  days: number,
): Promise<TrendDataPoint[]> {
  const sinceDate = computeSinceDate(days)

  // Get field_values assigned to this user in submitted instances
  const { data, error } = await supabase
    .from('field_values')
    .select(`
      form_instance:form_instances!field_values_form_instance_id_fkey(
        submitted_at,
        status
      )
    `)
    .eq('assigned_to', userId)

  if (error) throw error

  // Filter to submitted instances within the date range, deduplicate by date
  const grouped = (data ?? [])
    .filter((row) => {
      const instance = row.form_instance as unknown as {
        status: string
        submitted_at: string | null
      }
      return (
        instance?.status === 'submitted' &&
        instance?.submitted_at &&
        instance.submitted_at >= sinceDate
      )
    })
    .map((row) => {
      const instance = row.form_instance as unknown as {
        submitted_at: string
      }
      return { date: instance.submitted_at.slice(0, 10), count: 1 }
    })

  return fillDateGaps(grouped, days)
}

/**
 * Group breakdown: count of submitted instances per group within the time range.
 * If >8 groups, top 7 + aggregate the rest as "Other".
 */
export async function fetchGroupBreakdown(
  days: number,
): Promise<GroupBreakdownPoint[]> {
  const sinceDate = computeSinceDate(days)

  const { data, error } = await supabase
    .from('form_instances')
    .select(`
      group_id,
      group:groups!form_instances_group_id_fkey(name)
    `)
    .eq('status', 'submitted')
    .gte('submitted_at', sinceDate)

  if (error) throw error

  // Group by group_id in JS
  const countMap = new Map<string, { name: string; count: number }>()
  for (const row of data ?? []) {
    const gid = row.group_id
    const gname = (row.group as unknown as { name: string })?.name ?? 'Unknown'
    const existing = countMap.get(gid)
    if (existing) {
      existing.count++
    } else {
      countMap.set(gid, { name: gname, count: 1 })
    }
  }

  // Sort descending by count
  const sorted = [...countMap.entries()]
    .map(([group_id, { name, count }]) => ({
      group_id,
      group_name: name,
      count,
    }))
    .sort((a, b) => b.count - a.count)

  // If >8 groups, take top 7 + aggregate the rest as "Other"
  if (sorted.length > 8) {
    const top7 = sorted.slice(0, 7)
    const restCount = sorted.slice(7).reduce((sum, g) => sum + g.count, 0)
    top7.push({ group_id: 'other', group_name: 'Other', count: restCount })
    return top7
  }

  return sorted
}

// ---------------------------------------------------------------------------
// Stat queries
// ---------------------------------------------------------------------------

/** Root Admin stats: Total Users, Groups, Templates, Instances. */
export async function fetchRootAdminStats(
  days: number,
): Promise<StatCardData[]> {
  const sinceDate = computeSinceDate(days)
  const label = rangeLabel(days)

  const [users, groups, templates, instances, newUsers, newGroups, newTemplates, newInstances] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true),
      supabase
        .from('groups')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true),
      supabase
        .from('form_templates')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true),
      supabase
        .from('form_instances')
        .select('*', { count: 'exact', head: true }),
      // Delta counts (created within time range)
      supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true)
        .gte('created_at', sinceDate),
      supabase
        .from('groups')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true)
        .gte('created_at', sinceDate),
      supabase
        .from('form_templates')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true)
        .gte('created_at', sinceDate),
      supabase
        .from('form_instances')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', sinceDate),
    ])

  if (users.error) throw users.error
  if (groups.error) throw groups.error
  if (templates.error) throw templates.error
  if (instances.error) throw instances.error
  if (newUsers.error) throw newUsers.error
  if (newGroups.error) throw newGroups.error
  if (newTemplates.error) throw newTemplates.error
  if (newInstances.error) throw newInstances.error

  return [
    {
      label: 'Total Users',
      value: users.count ?? 0,
      delta: `+${newUsers.count ?? 0} ${label}`,
      icon: 'users',
      iconColor: 'chart-1',
    },
    {
      label: 'Groups',
      value: groups.count ?? 0,
      delta: `+${newGroups.count ?? 0} ${label}`,
      icon: 'building-2',
      iconColor: 'chart-2',
    },
    {
      label: 'Templates',
      value: templates.count ?? 0,
      delta: `+${newTemplates.count ?? 0} ${label}`,
      icon: 'file-text',
      iconColor: 'chart-3',
    },
    {
      label: 'Instances',
      value: instances.count ?? 0,
      delta: `+${newInstances.count ?? 0} ${label}`,
      icon: 'clipboard-list',
      iconColor: 'chart-4',
    },
  ]
}

/** Admin stats: Group Members, Total Instances, Submitted. */
export async function fetchAdminStats(
  groupId: string,
  days: number,
): Promise<StatCardData[]> {
  const sinceDate = computeSinceDate(days)
  const label = rangeLabel(days)

  const [members, pendingInvites, totalInstances, draftInstances, submitted, submittedDelta] =
    await Promise.all([
      // Active members in group
      supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', groupId)
        .eq('is_active', true),
      // Pending invites (member_requests)
      supabase
        .from('member_requests')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', groupId)
        .eq('status', 'pending'),
      // Total instances for group
      supabase
        .from('form_instances')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', groupId),
      // Draft (pending) instances for group
      supabase
        .from('form_instances')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', groupId)
        .eq('status', 'pending'),
      // Submitted instances for group
      supabase
        .from('form_instances')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', groupId)
        .eq('status', 'submitted'),
      // Submitted in time range
      supabase
        .from('form_instances')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', groupId)
        .eq('status', 'submitted')
        .gte('submitted_at', sinceDate),
    ])

  if (members.error) throw members.error
  if (pendingInvites.error) throw pendingInvites.error
  if (totalInstances.error) throw totalInstances.error
  if (draftInstances.error) throw draftInstances.error
  if (submitted.error) throw submitted.error
  if (submittedDelta.error) throw submittedDelta.error

  const pendingCount = pendingInvites.count ?? 0

  return [
    {
      label: 'Group Members',
      value: members.count ?? 0,
      delta: pendingCount > 0 ? `${pendingCount} pending` : 'no pending invites',
      icon: 'users',
      iconColor: 'chart-2',
    },
    {
      label: 'Total Instances',
      value: totalInstances.count ?? 0,
      delta: `${draftInstances.count ?? 0} drafts`,
      icon: 'clipboard-list',
      iconColor: 'chart-4',
    },
    {
      label: 'Submitted',
      value: submitted.count ?? 0,
      delta: `+${submittedDelta.count ?? 0} ${label}`,
      icon: 'check-circle',
      iconColor: 'chart-1',
    },
  ]
}

/** Editor stats: Assigned Fields, My Draft Forms, My Submissions. */
export async function fetchEditorStats(
  userId: string,
  groupId: string,
  days: number,
): Promise<StatCardData[]> {
  const sinceDate = computeSinceDate(days)
  const label = rangeLabel(days)

  // Assigned fields in pending instances for this user
  const { data: assignedData, error: assignedError } = await supabase
    .from('field_values')
    .select(`
      id,
      form_instance:form_instances!field_values_form_instance_id_fkey(
        id,
        status
      )
    `)
    .eq('assigned_to', userId)

  if (assignedError) throw assignedError

  // Filter to fields in pending instances
  const pendingFields = (assignedData ?? []).filter((row) => {
    const instance = row.form_instance as unknown as { status: string }
    return instance?.status === 'pending'
  })

  // Count unique instances for the "across N forms" delta
  const uniqueInstances = new Set(
    pendingFields.map((row) => {
      const instance = row.form_instance as unknown as { id: string }
      return instance?.id
    }),
  )

  // Pending instances in group (editor's drafts)
  const { count: draftCount, error: draftError } = await supabase
    .from('form_instances')
    .select('*', { count: 'exact', head: true })
    .eq('group_id', groupId)
    .eq('status', 'pending')

  if (draftError) throw draftError

  // Submitted instances that this editor contributed to (has field_values)
  const { data: submittedData, error: submittedError } = await supabase
    .from('field_values')
    .select(`
      form_instance:form_instances!field_values_form_instance_id_fkey(
        id,
        status,
        submitted_at
      )
    `)
    .eq('assigned_to', userId)

  if (submittedError) throw submittedError

  // Count unique submitted instances
  const submittedInstances = new Set<string>()
  const submittedDeltaInstances = new Set<string>()
  for (const row of submittedData ?? []) {
    const instance = row.form_instance as unknown as {
      id: string
      status: string
      submitted_at: string | null
    }
    if (instance?.status === 'submitted') {
      submittedInstances.add(instance.id)
      if (instance.submitted_at && instance.submitted_at >= sinceDate) {
        submittedDeltaInstances.add(instance.id)
      }
    }
  }

  return [
    {
      label: 'Assigned Fields',
      value: pendingFields.length,
      delta: `across ${uniqueInstances.size} form${uniqueInstances.size === 1 ? '' : 's'}`,
      icon: 'target',
      iconColor: 'chart-1',
    },
    {
      label: 'My Draft Forms',
      value: draftCount ?? 0,
      delta: 'need completion',
      icon: 'pen-line',
      iconColor: 'chart-4',
    },
    {
      label: 'My Submissions',
      value: submittedInstances.size,
      delta: `+${submittedDeltaInstances.size} ${label}`,
      icon: 'check-circle',
      iconColor: 'chart-2',
    },
  ]
}

/** Viewer stats: Group Submissions, Reports Available. */
export async function fetchViewerStats(
  groupId: string,
  days: number,
): Promise<StatCardData[]> {
  const sinceDate = computeSinceDate(days)
  const label = rangeLabel(days)

  const [submitted, submittedDelta, reports, reportsDelta] = await Promise.all([
    // Total submitted for group
    supabase
      .from('form_instances')
      .select('*', { count: 'exact', head: true })
      .eq('group_id', groupId)
      .eq('status', 'submitted'),
    // Submitted in time range
    supabase
      .from('form_instances')
      .select('*', { count: 'exact', head: true })
      .eq('group_id', groupId)
      .eq('status', 'submitted')
      .gte('submitted_at', sinceDate),
    // Total report instances (RLS handles visibility)
    supabase
      .from('report_instances')
      .select('*', { count: 'exact', head: true }),
    // Reports created in time range
    supabase
      .from('report_instances')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', sinceDate),
  ])

  if (submitted.error) throw submitted.error
  if (submittedDelta.error) throw submittedDelta.error
  if (reports.error) throw reports.error
  if (reportsDelta.error) throw reportsDelta.error

  return [
    {
      label: 'Group Submissions',
      value: submitted.count ?? 0,
      delta: `+${submittedDelta.count ?? 0} ${label}`,
      icon: 'clipboard-list',
      iconColor: 'chart-1',
    },
    {
      label: 'Reports Available',
      value: reports.count ?? 0,
      delta: `+${reportsDelta.count ?? 0} ${label}`,
      icon: 'bar-chart-3',
      iconColor: 'chart-5',
    },
  ]
}

// ---------------------------------------------------------------------------
// Action item queries
// ---------------------------------------------------------------------------

/** Root Admin action items: pending requests, draft instances, overdue schedules. */
export async function fetchRootAdminActionItems(): Promise<ActionItem[]> {
  const [requests, drafts, overdue] = await Promise.all([
    supabase
      .from('member_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase
      .from('form_instances')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase
      .from('instance_schedules')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)
      .lt('next_run_at', new Date().toISOString()),
  ])

  if (requests.error) throw requests.error
  if (drafts.error) throw drafts.error
  if (overdue.error) throw overdue.error

  const items: ActionItem[] = []

  if ((requests.count ?? 0) > 0) {
    items.push({
      label: 'Pending Requests',
      description: `${requests.count} member request${requests.count === 1 ? '' : 's'} awaiting approval`,
      count: requests.count ?? 0,
      color: 'amber',
      linkTo: '/members?tab=requests',
    })
  }

  if ((drafts.count ?? 0) > 0) {
    items.push({
      label: 'Draft Instances',
      description: `${drafts.count} form instance${drafts.count === 1 ? '' : 's'} still in progress`,
      count: drafts.count ?? 0,
      color: 'blue',
      linkTo: '/forms?status=pending',
    })
  }

  if ((overdue.count ?? 0) > 0) {
    items.push({
      label: 'Overdue Schedules',
      description: `${overdue.count} schedule${overdue.count === 1 ? '' : 's'} past due`,
      count: overdue.count ?? 0,
      color: 'red',
      linkTo: '/forms?tab=schedules',
    })
  }

  return items
}

/** Admin action items: pending requests for group, draft instances for group. */
export async function fetchAdminActionItems(
  groupId: string,
): Promise<ActionItem[]> {
  const [requests, drafts] = await Promise.all([
    supabase
      .from('member_requests')
      .select('*', { count: 'exact', head: true })
      .eq('group_id', groupId)
      .eq('status', 'pending'),
    supabase
      .from('form_instances')
      .select('*', { count: 'exact', head: true })
      .eq('group_id', groupId)
      .eq('status', 'pending'),
  ])

  if (requests.error) throw requests.error
  if (drafts.error) throw drafts.error

  const items: ActionItem[] = []

  if ((requests.count ?? 0) > 0) {
    items.push({
      label: 'Pending Requests',
      description: `${requests.count} member request${requests.count === 1 ? '' : 's'} awaiting approval`,
      count: requests.count ?? 0,
      color: 'amber',
      linkTo: '/members?tab=requests',
    })
  }

  if ((drafts.count ?? 0) > 0) {
    items.push({
      label: 'Draft Instances',
      description: `${drafts.count} form instance${drafts.count === 1 ? '' : 's'} still in progress`,
      count: drafts.count ?? 0,
      color: 'blue',
      linkTo: '/forms?status=pending',
    })
  }

  return items
}

/** Editor action items: assigned fields in pending instances. */
export async function fetchEditorActionItems(
  userId: string,
): Promise<ActionItem[]> {
  const { data, error } = await supabase
    .from('field_values')
    .select(`
      id,
      form_instance:form_instances!field_values_form_instance_id_fkey(
        status
      )
    `)
    .eq('assigned_to', userId)

  if (error) throw error

  const count = (data ?? []).filter((row) => {
    const instance = row.form_instance as unknown as { status: string }
    return instance?.status === 'pending'
  }).length

  const items: ActionItem[] = []

  if (count > 0) {
    items.push({
      label: 'Assigned Fields',
      description: `${count} field${count === 1 ? '' : 's'} assigned to you need completion`,
      count,
      color: 'blue',
      linkTo: '/forms?tab=assigned',
    })
  }

  return items
}

/** Viewer action items: new report instances created in last 7 days. */
export async function fetchViewerActionItems(): Promise<ActionItem[]> {
  const sevenDaysAgo = computeSinceDate(7)

  // RLS handles group visibility for viewers
  const { count, error } = await supabase
    .from('report_instances')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', sevenDaysAgo)

  if (error) throw error

  const items: ActionItem[] = []

  if ((count ?? 0) > 0) {
    items.push({
      label: 'New Reports',
      description: `${count} report${count === 1 ? '' : 's'} generated in the last 7 days`,
      count: count ?? 0,
      color: 'purple',
      linkTo: '/reports',
    })
  }

  return items
}

// ---------------------------------------------------------------------------
// Recent list queries
// ---------------------------------------------------------------------------

/** Recent form instances, optionally filtered by group. */
export async function fetchRecentFormInstances(
  limit: number,
  groupId?: string,
): Promise<RecentFormInstance[]> {
  let query = supabase
    .from('form_instances')
    .select(`
      id,
      readable_id,
      status,
      updated_at,
      template_version:template_versions!form_instances_template_version_id_fkey(
        template:form_templates!template_versions_template_id_fkey(name)
      ),
      group:groups!form_instances_group_id_fkey(name)
    `)
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (groupId) {
    query = query.eq('group_id', groupId)
  }

  const { data, error } = await query

  if (error) throw error

  return (data ?? []).map((row) => ({
    id: row.id,
    readable_id: row.readable_id,
    template_name:
      (row.template_version as unknown as { template: { name: string } })
        ?.template?.name ?? 'Unknown',
    group_name:
      (row.group as unknown as { name: string })?.name ?? null,
    status: row.status as 'pending' | 'submitted',
    updated_at: row.updated_at,
  }))
}

/** Recent report instances. RLS handles group visibility. */
export async function fetchRecentReportInstances(
  limit: number,
): Promise<RecentReportInstance[]> {
  // RLS handles visibility — viewers can only see reports for their group.
  // No explicit group filter needed; just rely on RLS policies.
  const { data, error } = await supabase
    .from('report_instances')
    .select(`
      id,
      readable_id,
      status,
      created_at,
      report_template_version:report_template_versions!report_instances_report_template_version_id_fkey(
        report_template:report_templates!report_template_versions_report_template_id_fkey(name)
      )
    `)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error

  return (data ?? []).map((row) => ({
    id: row.id,
    readable_id: row.readable_id,
    template_name:
      (
        row.report_template_version as unknown as {
          report_template: { name: string }
        }
      )?.report_template?.name ?? 'Unknown',
    status: row.status,
    created_at: row.created_at,
  }))
}

// ---------------------------------------------------------------------------
// Retained queries (updated signatures)
// ---------------------------------------------------------------------------

/** Group members list with optional limit. */
export async function fetchGroupMembersList(
  groupId: string,
  limit = 5,
): Promise<GroupMemberCompact[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, avatar_url')
    .eq('group_id', groupId)
    .eq('is_active', true)
    .order('full_name')
    .limit(limit)

  if (error) throw error

  return (data ?? []).map((row) => ({
    id: row.id,
    full_name: row.full_name ?? 'Unknown',
    role: row.role,
    avatar_url: row.avatar_url,
  }))
}

/** Assigned fields grouped by instance. */
export async function fetchAssignedFieldsGrouped(
  userId: string,
): Promise<AssignedFieldGroup[]> {
  const { data, error } = await supabase
    .from('field_values')
    .select(`
      id,
      form_instance:form_instances!field_values_form_instance_id_fkey(
        id,
        readable_id,
        status,
        template_version:template_versions!form_instances_template_version_id_fkey(
          template:form_templates!template_versions_template_id_fkey(name)
        )
      ),
      template_field:template_fields!field_values_template_field_id_fkey(label)
    `)
    .eq('assigned_to', userId)

  if (error) throw error

  // Filter to pending instances and group by instance
  const instanceMap = new Map<
    string,
    { readable_id: string; template_name: string; fields: { field_id: string; field_label: string }[] }
  >()

  for (const row of data ?? []) {
    const instance = row.form_instance as unknown as {
      id: string
      readable_id: string
      status: string
      template_version: { template: { name: string } }
    }
    if (instance?.status !== 'pending') continue

    const field = row.template_field as unknown as { label: string }
    const instanceId = instance.id

    const existing = instanceMap.get(instanceId)
    if (existing) {
      existing.fields.push({
        field_id: row.id,
        field_label: field?.label ?? 'Unknown field',
      })
    } else {
      instanceMap.set(instanceId, {
        readable_id: instance.readable_id,
        template_name: instance.template_version?.template?.name ?? 'Unknown',
        fields: [
          {
            field_id: row.id,
            field_label: field?.label ?? 'Unknown field',
          },
        ],
      })
    }
  }

  return [...instanceMap.entries()].map(([instance_id, data]) => ({
    instance_id,
    readable_id: data.readable_id,
    template_name: data.template_name,
    fields: data.fields,
  }))
}
