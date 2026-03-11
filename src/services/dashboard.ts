/**
 * Dashboard service — query functions for role-adaptive dashboard widgets.
 *
 * All queries use the Supabase Client SDK with RLS.
 * The currently authenticated user's JWT determines what they can see.
 */
import { supabase } from './supabase'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RecentSubmission {
  id: string
  readable_id: string
  template_name: string
  group_name: string | null
  submitted_at: string | null
  status: string
}

export interface GroupActivity {
  id: string
  name: string
  member_count: number
  instance_count: number
}

export interface SystemStats {
  total_users: number
  total_groups: number
  total_templates: number
  total_instances: number
}

export interface GroupMemberRow {
  id: string
  full_name: string
  role: string
  avatar_url: string | null
}

export interface DraftInstance {
  id: string
  readable_id: string
  template_name: string
  created_at: string
}

export interface AssignedField {
  instance_id: string
  readable_id: string
  template_name: string
  field_label: string
  field_id: string
}

// ---------------------------------------------------------------------------
// Root Admin queries
// ---------------------------------------------------------------------------

/** Count of pending member_requests (all groups). */
export async function fetchPendingRequestCount(): Promise<number> {
  const { count, error } = await supabase
    .from('member_requests')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')

  if (error) throw error
  return count ?? 0
}

/** Recent submitted form_instances (all groups, limited). */
export async function fetchRecentSubmissions(limit = 5): Promise<RecentSubmission[]> {
  const { data, error } = await supabase
    .from('form_instances')
    .select(`
      id,
      readable_id,
      status,
      submitted_at,
      template_version:template_versions!form_instances_template_version_id_fkey(
        template:form_templates!template_versions_template_id_fkey(name)
      ),
      group:groups!form_instances_group_id_fkey(name)
    `)
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: false })
    .limit(limit)

  if (error) throw error

  return (data ?? []).map((row) => ({
    id: row.id,
    readable_id: row.readable_id,
    template_name: (row.template_version as unknown as { template: { name: string } })?.template?.name ?? 'Unknown',
    group_name: (row.group as unknown as { name: string })?.name ?? null,
    submitted_at: row.submitted_at,
    status: row.status,
  }))
}

/** Count of active instance_schedules. */
export async function fetchActiveScheduleCount(): Promise<number> {
  const { count, error } = await supabase
    .from('instance_schedules')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)

  if (error) throw error
  return count ?? 0
}

/** Group activity: for each group, count of members and instances. */
export async function fetchGroupActivity(): Promise<GroupActivity[]> {
  // Get groups with member counts from the view
  const { data: groups, error: groupsError } = await supabase
    .from('groups_with_member_count')
    .select('id, name, member_count')
    .eq('is_active', true)
    .order('name')

  if (groupsError) throw groupsError

  // Get instance counts per group
  const { data: instanceCounts, error: instanceError } = await supabase
    .from('form_instances')
    .select('group_id')

  if (instanceError) throw instanceError

  // Count instances per group
  const countMap = new Map<string, number>()
  for (const row of instanceCounts ?? []) {
    const gid = row.group_id
    countMap.set(gid, (countMap.get(gid) ?? 0) + 1)
  }

  return (groups ?? []).map((g) => ({
    id: g.id!,
    name: g.name!,
    member_count: g.member_count ?? 0,
    instance_count: countMap.get(g.id!) ?? 0,
  }))
}

/** System stats: total users, groups, templates, instances. */
export async function fetchSystemStats(): Promise<SystemStats> {
  const [users, groups, templates, instances] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('groups').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('form_templates').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('form_instances').select('*', { count: 'exact', head: true }),
  ])

  if (users.error) throw users.error
  if (groups.error) throw groups.error
  if (templates.error) throw templates.error
  if (instances.error) throw instances.error

  return {
    total_users: users.count ?? 0,
    total_groups: groups.count ?? 0,
    total_templates: templates.count ?? 0,
    total_instances: instances.count ?? 0,
  }
}

// ---------------------------------------------------------------------------
// Admin / Editor / Viewer queries (scoped by RLS to their group)
// ---------------------------------------------------------------------------

/** Group members for a specific group. */
export async function fetchGroupMembersList(groupId: string): Promise<GroupMemberRow[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, avatar_url')
    .eq('group_id', groupId)
    .eq('is_active', true)
    .order('full_name')

  if (error) throw error

  return (data ?? []).map((row) => ({
    id: row.id,
    full_name: row.full_name ?? 'Unknown',
    role: row.role,
    avatar_url: row.avatar_url,
  }))
}

/** Pending requests count for a specific group. */
export async function fetchGroupPendingRequests(groupId: string): Promise<number> {
  const { count, error } = await supabase
    .from('member_requests')
    .select('*', { count: 'exact', head: true })
    .eq('group_id', groupId)
    .eq('status', 'pending')

  if (error) throw error
  return count ?? 0
}

/** Draft (pending) instances for a group. */
export async function fetchDraftInstances(groupId: string, limit = 5): Promise<DraftInstance[]> {
  const { data, error } = await supabase
    .from('form_instances')
    .select(`
      id,
      readable_id,
      created_at,
      template_version:template_versions!form_instances_template_version_id_fkey(
        template:form_templates!template_versions_template_id_fkey(name)
      )
    `)
    .eq('group_id', groupId)
    .eq('status', 'pending')
    .eq('is_archived', false)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error

  return (data ?? []).map((row) => ({
    id: row.id,
    readable_id: row.readable_id,
    template_name: (row.template_version as unknown as { template: { name: string } })?.template?.name ?? 'Unknown',
    created_at: row.created_at,
  }))
}

/** Fields assigned to a specific user that are in pending instances. */
export async function fetchAssignedFields(userId: string): Promise<AssignedField[]> {
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

  // Filter to only fields in pending instances
  return (data ?? [])
    .filter((row) => {
      const instance = row.form_instance as unknown as { status: string }
      return instance?.status === 'pending'
    })
    .map((row) => {
      const instance = row.form_instance as unknown as {
        id: string
        readable_id: string
        template_version: { template: { name: string } }
      }
      const field = row.template_field as unknown as { label: string }
      return {
        instance_id: instance?.id ?? '',
        readable_id: instance?.readable_id ?? '',
        template_name: instance?.template_version?.template?.name ?? 'Unknown',
        field_label: field?.label ?? 'Unknown field',
        field_id: row.id,
      }
    })
}

/** Recent submissions for a specific group. */
export async function fetchGroupRecentSubmissions(groupId: string, limit = 5): Promise<RecentSubmission[]> {
  const { data, error } = await supabase
    .from('form_instances')
    .select(`
      id,
      readable_id,
      status,
      submitted_at,
      template_version:template_versions!form_instances_template_version_id_fkey(
        template:form_templates!template_versions_template_id_fkey(name)
      ),
      group:groups!form_instances_group_id_fkey(name)
    `)
    .eq('group_id', groupId)
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: false })
    .limit(limit)

  if (error) throw error

  return (data ?? []).map((row) => ({
    id: row.id,
    readable_id: row.readable_id,
    template_name: (row.template_version as unknown as { template: { name: string } })?.template?.name ?? 'Unknown',
    group_name: (row.group as unknown as { name: string })?.name ?? null,
    submitted_at: row.submitted_at,
    status: row.status,
  }))
}
