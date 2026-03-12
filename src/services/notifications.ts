import { supabase } from './supabase'

/**
 * Send a notification email via the send-notification-email Edge Function.
 * Caller must be admin or root_admin.
 */
export async function sendNotificationEmail(
  to: string,
  template: 'member_request_pending' | 'member_request_approved' | 'member_request_rejected',
  data: Record<string, string>,
): Promise<void> {
  const { data: fnData, error } = await supabase.functions.invoke('send-notification-email', {
    body: { to, template, data },
  })

  if (error) throw error

  const result = typeof fnData === 'string'
    ? JSON.parse(fnData) as { success: boolean; error?: string }
    : fnData as { success: boolean; error?: string }

  if (!result.success) {
    throw new Error(result.error ?? 'Failed to send notification email')
  }
}
