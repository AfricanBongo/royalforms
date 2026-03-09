/**
 * User role union type matching the profiles.role CHECK constraint.
 */
export const USER_ROLES = ['root_admin', 'admin', 'editor', 'viewer'] as const
export type UserRole = (typeof USER_ROLES)[number]

/**
 * Current user info extracted from Supabase Auth user_metadata.
 */
export interface CurrentUser {
  id: string
  email: string
  firstName: string
  lastName: string
  role: UserRole
  groupId: string | null
  isActive: boolean
}
