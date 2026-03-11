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
  data: {
    full_name?: string
    first_name?: string
    last_name?: string
    avatar_url?: string | null
    invite_status?: string
  },
) {
  const { error } = await supabase
    .from('profiles')
    .update(data)
    .eq('id', userId)

  if (error) throw error
}

/**
 * Fetch a user's profile by ID.
 */
export async function fetchProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, first_name, last_name, avatar_url, role, group_id, is_active')
    .eq('id', userId)
    .single()

  if (error) throw error
  return data
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

/**
 * Delete the user's avatar from the storage bucket.
 * Lists all files under the user's folder and removes them.
 */
export async function deleteAvatar(userId: string): Promise<void> {
  const { data: files, error: listError } = await supabase.storage
    .from('avatars')
    .list(userId)

  if (listError) throw listError

  if (files && files.length > 0) {
    const paths = files.map((f) => `${userId}/${f.name}`)
    const { error: removeError } = await supabase.storage
      .from('avatars')
      .remove(paths)

    if (removeError) throw removeError
  }
}
