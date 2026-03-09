/**
 * Profiles service — data access for user profiles, avatar uploads,
 * and group name lookups used during onboarding.
 */
import { supabase } from './supabase'

// ---------------------------------------------------------------------------
// Profile updates
// ---------------------------------------------------------------------------

/**
 * Update a profile row in the profiles table.
 */
export async function updateProfile(
  userId: string,
  data: { full_name?: string; invite_status?: string },
) {
  const { error } = await supabase
    .from('profiles')
    .update(data)
    .eq('id', userId)

  if (error) throw error
}

// ---------------------------------------------------------------------------
// Group name lookup (used during onboarding)
// ---------------------------------------------------------------------------

/**
 * Fetch the name of a group by ID. Returns null if not found.
 */
export async function fetchGroupName(
  groupId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('groups')
    .select('name')
    .eq('id', groupId)
    .single()

  if (error) throw error
  return data?.name ?? null
}

// ---------------------------------------------------------------------------
// Avatar storage
// ---------------------------------------------------------------------------

/**
 * Upload an avatar image to the `avatars` storage bucket.
 * Returns the public URL of the uploaded file.
 */
export async function uploadAvatar(
  userId: string,
  file: File,
): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'png'
  const filePath = `${userId}/avatar.${ext}`

  const { error } = await supabase.storage
    .from('avatars')
    .upload(filePath, file, { upsert: true })

  if (error) throw error

  const { data: urlData } = supabase.storage
    .from('avatars')
    .getPublicUrl(filePath)

  return urlData.publicUrl
}
