/**
 * Groups service — data access and business logic for groups.
 */
import { supabase } from './supabase'
import { getCurrentAuthUser } from './auth'

// ---------------------------------------------------------------------------
// Types (derived from generated Database types)
// ---------------------------------------------------------------------------

/** Row from the groups_with_member_count view. */
export type GroupRow = {
  id: string
  name: string
  is_active: boolean
  created_at: string
  member_count: number
}

/** Full group detail from the groups table. */
export interface GroupDetail {
  id: string
  name: string
  is_active: boolean
  is_bootstrap: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Fetch all groups visible to the current user (RLS-scoped),
 * with active member counts per group.
 *
 * Uses the `groups_with_member_count` view to avoid N+1 queries.
 */
export async function fetchGroups(): Promise<GroupRow[]> {
  const { data, error } = await supabase
    .from('groups_with_member_count')
    .select('id, name, is_active, created_at, member_count')
    .order('name')

  if (error) throw error

  // The view columns are nullable (Postgres view inference), so coalesce here
  return (data ?? []).map((row) => ({
    id: row.id!,
    name: row.name!,
    is_active: row.is_active ?? true,
    created_at: row.created_at!,
    member_count: row.member_count ?? 0,
  }))
}

/**
 * Fetch a single group by ID.
 */
export async function fetchGroup(groupId: string): Promise<GroupDetail> {
  const { data, error } = await supabase
    .from('groups')
    .select('id, name, is_active, is_bootstrap, created_at, created_by, updated_at')
    .eq('id', groupId)
    .single()

  if (error) throw error

  return data as unknown as GroupDetail
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Create a new group. Only Root Admin can do this (enforced by RLS).
 * Returns the newly created group.
 */
export async function createGroup(
  name: string,
): Promise<{ id: string; name: string; is_active: boolean; created_at: string }> {
  const user = await getCurrentAuthUser()

  const { data, error } = await supabase
    .from('groups')
    .insert({ name: name.trim(), created_by: user.id })
    .select('id, name, is_active, created_at')
    .single()

  if (error) throw error

  return data
}

/**
 * Soft-delete a group by setting is_active to false.
 * Only Root Admin can do this (enforced by RLS).
 */
export async function deactivateGroup(groupId: string): Promise<void> {
  const { error } = await supabase
    .from('groups')
    .update({ is_active: false })
    .eq('id', groupId)

  if (error) throw error
}

/**
 * Update a group's name.
 * Only Root Admin can do this (enforced by RLS).
 */
export async function updateGroupName(groupId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('groups')
    .update({ name: name.trim() })
    .eq('id', groupId)

  if (error) throw error
}

/**
 * Reactivate a previously deactivated group by setting is_active to true.
 * Only Root Admin can do this (enforced by RLS).
 */
export async function reactivateGroup(groupId: string): Promise<void> {
  const { error } = await supabase
    .from('groups')
    .update({ is_active: true })
    .eq('id', groupId)

  if (error) throw error
}
