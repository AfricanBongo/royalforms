/**
 * Invite management service — resend invites, change invitee email,
 * and delete invited users. Root Admin only.
 */
import { supabase } from './supabase'

interface ManageInviteResult {
  success: boolean
  error?: string
}

function parseResult(data: unknown): ManageInviteResult {
  const result = typeof data === 'string'
    ? JSON.parse(data) as ManageInviteResult
    : data as ManageInviteResult
  return result
}

/**
 * Resend the invite email to a user with invite_status = 'invite_sent'.
 */
export async function resendInvite(userId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('manage-invite', {
    body: { action: 'resend', user_id: userId },
  })

  if (error) throw error

  const result = parseResult(data)
  if (!result.success) {
    throw new Error(result.error ?? 'Failed to resend invite')
  }
}

/**
 * Change the email address of an invited user and resend the invite
 * to the new address. Only works if invite_status = 'invite_sent'.
 */
export async function changeInviteEmail(
  userId: string,
  newEmail: string,
): Promise<void> {
  const { data, error } = await supabase.functions.invoke('manage-invite', {
    body: { action: 'change_email', user_id: userId, new_email: newEmail },
  })

  if (error) throw error

  const result = parseResult(data)
  if (!result.success) {
    throw new Error(result.error ?? 'Failed to change invite email')
  }
}

/**
 * Hard-delete an invited user (auth record + profile). Related
 * member_requests are set to status='cancelled'. Only works if
 * invite_status = 'invite_sent'.
 */
export async function deleteInvite(userId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('manage-invite', {
    body: { action: 'delete', user_id: userId },
  })

  if (error) throw error

  const result = parseResult(data)
  if (!result.success) {
    throw new Error(result.error ?? 'Failed to delete invite')
  }
}
