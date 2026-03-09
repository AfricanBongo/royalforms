/**
 * Member-requests service — data access and business logic for
 * member invitation requests (request → approve/reject → invite).
 */
import { supabase } from './supabase'
import { getCurrentAuthUser } from './auth'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MemberRequestRow {
  id: string
  email: string
  full_name: string
  proposed_role: string
  status: string
  created_at: string
  decided_at: string | null
  requested_by: string | null
  requested_by_name: string
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Fetch all member requests for a group, newest first.
 * Joins the requester's profile to surface their display name.
 */
export async function fetchRequests(groupId: string): Promise<MemberRequestRow[]> {
  const { data, error } = await supabase
    .from('member_requests')
    .select(
      'id, email, full_name, proposed_role, status, created_at, decided_at, requested_by, profiles!member_requests_requested_by_fkey(full_name)',
    )
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    proposed_role: row.proposed_role,
    status: row.status,
    created_at: row.created_at,
    decided_at: row.decided_at,
    requested_by: row.requested_by,
    requested_by_name:
      (row.profiles as unknown as { full_name: string } | null)?.full_name ?? '',
  }))
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Create a single pending member request.
 */
export async function createRequest(data: {
  email: string
  full_name: string
  proposed_role: string
  group_id: string
}): Promise<void> {
  const currentUser = await getCurrentAuthUser()

  const { error } = await supabase
    .from('member_requests')
    .insert({
      email: data.email.trim(),
      full_name: data.full_name.trim(),
      proposed_role: data.proposed_role,
      group_id: data.group_id,
      requested_by: currentUser.id,
      status: 'pending',
    })

  if (error) throw error
}

/**
 * Create multiple pending member requests in a single batch insert.
 * Returns counts of successfully created vs failed rows.
 */
export async function createBulkRequests(
  requests: Array<{ email: string; full_name: string; proposed_role: string }>,
  groupId: string,
): Promise<{ created: number; failed: number }> {
  const currentUser = await getCurrentAuthUser()

  const rows = requests.map((req) => ({
    email: req.email.trim(),
    full_name: req.full_name.trim(),
    proposed_role: req.proposed_role,
    group_id: groupId,
    requested_by: currentUser.id,
    status: 'pending' as const,
  }))

  const { data, error } = await supabase
    .from('member_requests')
    .insert(rows)
    .select('id')

  if (error) throw error

  const created = data?.length ?? 0
  return { created, failed: requests.length - created }
}

/**
 * Approve a pending request and trigger the invite-user Edge Function
 * so the invitee receives an email.
 */
export async function approveRequest(requestId: string): Promise<void> {
  const currentUser = await getCurrentAuthUser()

  // 1. Fetch the request to get invite details
  const { data: request, error: fetchError } = await supabase
    .from('member_requests')
    .select('email, full_name, proposed_role, group_id')
    .eq('id', requestId)
    .single()

  if (fetchError) throw fetchError

  // 2. Mark as approved
  const { error: updateError } = await supabase
    .from('member_requests')
    .update({
      status: 'approved',
      decided_by: currentUser.id,
      decided_at: new Date().toISOString(),
    })
    .eq('id', requestId)

  if (updateError) throw updateError

  // 3. Invoke the Edge Function to send the invite
  const { data: fnData, error: fnError } = await supabase.functions.invoke(
    'invite-user',
    {
      body: {
        email: request.email,
        full_name: request.full_name,
        role: request.proposed_role,
        group_id: request.group_id,
      },
    },
  )

  if (fnError) throw fnError

  const result = typeof fnData === 'string' ? JSON.parse(fnData) as { success: boolean; error?: string } : fnData as { success: boolean; error?: string }
  if (!result.success) {
    throw new Error(result.error ?? 'Failed to send invite')
  }
}

/**
 * Reject a pending request. No invite is sent.
 */
export async function rejectRequest(requestId: string): Promise<void> {
  const currentUser = await getCurrentAuthUser()

  const { error } = await supabase
    .from('member_requests')
    .update({
      status: 'rejected',
      decided_by: currentUser.id,
      decided_at: new Date().toISOString(),
    })
    .eq('id', requestId)

  if (error) throw error
}

// ---------------------------------------------------------------------------
// Direct add (Root Admin only — skips the request/approval flow)
// ---------------------------------------------------------------------------

/**
 * Directly add a member: insert an audit row in `member_requests` with
 * `status: approved`, then call the `invite-user` Edge Function so the
 * invitee receives an email. Root Admin only.
 *
 * Acts as a client-side transaction: if the Edge Function call fails,
 * the audit row is deleted so the database stays consistent.
 */
export async function addMemberDirectly(data: {
  email: string
  full_name: string
  role: string
  group_id: string
}): Promise<void> {
  const currentUser = await getCurrentAuthUser()
  const now = new Date().toISOString()

  // 1. Insert audit row and capture its id for potential rollback
  const { data: inserted, error: insertError } = await supabase
    .from('member_requests')
    .insert({
      email: data.email.trim(),
      full_name: data.full_name.trim(),
      proposed_role: data.role,
      group_id: data.group_id,
      requested_by: currentUser.id,
      status: 'approved',
      decided_by: currentUser.id,
      decided_at: now,
    })
    .select()
    .single()

  if (insertError) throw insertError

  // 2. Invoke Edge Function to send invite — rollback audit row on failure
  try {
    const { data: fnData, error: fnError } = await supabase.functions.invoke(
      'invite-user',
      { body: data },
    )

    if (fnError) throw fnError

    const result = typeof fnData === 'string'
      ? JSON.parse(fnData) as { success: boolean; error?: string }
      : fnData as { success: boolean; error?: string }
    if (!result.success) {
      throw new Error(result.error ?? 'Failed to invite member')
    }
  } catch (err) {
    // Rollback: delete the audit row that was just inserted
    await supabase
      .from('member_requests')
      .delete()
      .eq('id', inserted.id)

    throw err
  }
}

/**
 * Directly add multiple members in batch. Inserts audit rows with
 * `status: approved`, then calls the `invite-user` Edge Function for
 * each member. Root Admin only.
 *
 * Returns counts of successfully invited vs failed members.
 */
export async function addMembersBulk(
  members: Array<{ email: string; full_name: string; role: string }>,
  groupId: string,
): Promise<{ invited: number; failed: number; errors: string[] }> {
  let invited = 0
  let failed = 0
  const errors: string[] = []

  for (const member of members) {
    try {
      await addMemberDirectly({
        email: member.email,
        full_name: member.full_name,
        role: member.role,
        group_id: groupId,
      })
      invited++
    } catch (err: unknown) {
      failed++
      const message = err instanceof Error ? err.message : 'Unknown error'
      errors.push(`${member.email}: ${message}`)
    }
  }

  return { invited, failed, errors }
}
