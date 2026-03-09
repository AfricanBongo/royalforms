/**
 * Auth service — wraps all Supabase Auth operations so UI components
 * never import the Supabase client directly.
 */
import { supabase } from './supabase'

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

/**
 * Get the current session. Returns null if no active session.
 */
export async function getSession() {
  const { data: { session }, error } = await supabase.auth.getSession()
  if (error) throw error
  return session
}

// ---------------------------------------------------------------------------
// Invite verification
// ---------------------------------------------------------------------------

/**
 * Exchange an invite token_hash for a session. Returns the verified user
 * or throws on failure.
 */
export async function verifyInviteOtp(tokenHash: string) {
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'invite',
  })

  if (error) throw error
  if (!data.user) {
    throw new Error(
      'Could not verify the invite link. It may have expired. Please contact your administrator for a new invite.',
    )
  }

  return data.user
}

// ---------------------------------------------------------------------------
// Password operations
// ---------------------------------------------------------------------------

/**
 * Send a password-reset email. The link redirects the user to `redirectTo`.
 */
export async function resetPassword(email: string, redirectTo: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  })
  if (error) throw error
}

/**
 * Update the current user's password.
 * Optionally merges extra metadata (e.g. `onboarding_password_set`).
 */
export async function updatePassword(
  password: string,
  extraMetadata?: Record<string, unknown>,
) {
  const { error } = await supabase.auth.updateUser({
    password,
    ...(extraMetadata ? { data: extraMetadata } : {}),
  })
  if (error) throw error
}

// ---------------------------------------------------------------------------
// User metadata
// ---------------------------------------------------------------------------

/**
 * Update the current user's metadata (first_name, last_name, avatar_url, etc.).
 * Returns the updated user object.
 */
export async function updateUserMetadata(
  metadata: Record<string, unknown>,
) {
  const { data, error } = await supabase.auth.updateUser({
    data: metadata,
  })
  if (error) throw error
  return data.user
}

/**
 * Get the currently authenticated user. Throws if not authenticated.
 */
export async function getCurrentAuthUser() {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  if (!data.user) throw new Error('Not authenticated')
  return data.user
}
