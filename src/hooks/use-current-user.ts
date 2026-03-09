import { useAuth } from './use-auth'
import type { CurrentUser } from '../types/auth'

/**
 * Convenience hook that returns the current user info parsed from JWT metadata.
 * Returns null if the user is not authenticated.
 */
export function useCurrentUser(): CurrentUser | null {
  const { currentUser } = useAuth()
  return currentUser
}
