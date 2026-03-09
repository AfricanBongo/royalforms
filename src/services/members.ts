/**
 * Members service — data access and business logic for managing
 * group members: listing, deactivating, changing roles, and moving.
 */
import { supabase } from './supabase'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MemberRow {
  id: string
  email: string
  full_name: string
  role: string
  is_active: boolean
  invite_status: string
  last_invite_sent_at: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Fetch all members belonging to a group, ordered by full_name.
 * RLS ensures the current user has visibility.
 */
export async function fetchGroupMembers(
  groupId: string,
): Promise<MemberRow[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, is_active, invite_status, last_invite_sent_at, created_at')
    .eq('group_id', groupId)
    .order('full_name')

  if (error) throw error

  return data
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Deactivate a member by setting `is_active = false` in the profiles table,
 * then syncing the change to JWT metadata via the update-user-role Edge Function.
 */
export async function deactivateMember(
  userId: string,
  groupId: string,
): Promise<void> {
  // Read the user's current role so we can pass it to the Edge Function
  const { data: profile, error: fetchError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()

  if (fetchError) throw fetchError

  // Update the profile row
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ is_active: false })
    .eq('id', userId)

  if (updateError) throw updateError

  // Sync JWT metadata via Edge Function
  const { data, error: fnError } = await supabase.functions.invoke(
    'update-user-role',
    {
      body: {
        user_id: userId,
        role: profile.role,
        group_id: groupId,
        is_active: false,
      },
    },
  )

  if (fnError) throw fnError

  const result = typeof data === 'string' ? JSON.parse(data) : data
  if (!result.success) {
    throw new Error(result.error ?? 'Failed to sync user metadata')
  }
}

/**
 * Change a member's role, then sync the new role to JWT metadata
 * via the update-user-role Edge Function.
 */
export async function changeRole(
  userId: string,
  newRole: string,
  groupId: string,
): Promise<void> {
  // Update the profile row
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ role: newRole })
    .eq('id', userId)

  if (updateError) throw updateError

  // Sync JWT metadata via Edge Function
  const { data, error: fnError } = await supabase.functions.invoke(
    'update-user-role',
    {
      body: {
        user_id: userId,
        role: newRole,
        group_id: groupId,
        is_active: true,
      },
    },
  )

  if (fnError) throw fnError

  const result = typeof data === 'string' ? JSON.parse(data) : data
  if (!result.success) {
    throw new Error(result.error ?? 'Failed to sync user metadata')
  }
}

/**
 * Move a member to a different group, then sync the new group_id
 * to JWT metadata via the update-user-role Edge Function.
 */
export async function moveMemberToGroup(
  userId: string,
  newGroupId: string,
  currentRole: string,
): Promise<void> {
  // Update the profile row
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ group_id: newGroupId })
    .eq('id', userId)

  if (updateError) throw updateError

  // Sync JWT metadata via Edge Function
  const { data, error: fnError } = await supabase.functions.invoke(
    'update-user-role',
    {
      body: {
        user_id: userId,
        role: currentRole,
        group_id: newGroupId,
        is_active: true,
      },
    },
  )

  if (fnError) throw fnError

  const result = typeof data === 'string' ? JSON.parse(data) : data
  if (!result.success) {
    throw new Error(result.error ?? 'Failed to sync user metadata')
  }
}
