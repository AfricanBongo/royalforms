import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import type { Session, User } from '@supabase/supabase-js'

import { supabase } from '../services/supabase'
import type { CurrentUser, UserRole } from '../types/auth'
import { USER_ROLES } from '../types/auth'

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

export interface AuthContextValue {
  /** Supabase session (null when logged out or still loading) */
  session: Session | null
  /** Raw Supabase user object */
  user: User | null
  /** Parsed current user from user_metadata (null when not authenticated) */
  currentUser: CurrentUser | null
  /** True while the initial session is being resolved */
  isLoading: boolean
  /** Sign in with email + password. Returns code + message on error. */
  signIn: (email: string, password: string) => Promise<{ error: { code: string | undefined; message: string } | null }>
  /** Sign out */
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

// ---------------------------------------------------------------------------
// Helper: extract CurrentUser from Supabase User
// ---------------------------------------------------------------------------

function parseCurrentUser(user: User): CurrentUser | null {
  const meta = user.user_metadata
  if (!meta) return null

  const role = meta.role as string
  if (!USER_ROLES.includes(role as UserRole)) return null

  return {
    id: user.id,
    email: user.email ?? meta.email ?? '',
    firstName: (meta.first_name as string) ?? '',
    lastName: (meta.last_name as string) ?? '',
    role: role as UserRole,
    groupId: (meta.group_id as string) ?? null,
    isActive: meta.is_active !== false,
  }
}

// ---------------------------------------------------------------------------
// Provider hook (internal -- used by AuthProvider component)
// ---------------------------------------------------------------------------

export function useAuthProvider(): AuthContextValue {
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: initial } }) => {
      setSession(initial)
      setIsLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => subscription.unsubscribe()
  }, [])

  const user = session?.user ?? null

  const currentUser = useMemo(
    () => (user ? parseCurrentUser(user) : null),
    [user],
  )

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      return {
        error: error
          ? { code: error.code, message: error.message }
          : null,
      }
    },
    [],
  )

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  return useMemo<AuthContextValue>(
    () => ({ session, user, currentUser, isLoading, signIn, signOut }),
    [session, user, currentUser, isLoading, signIn, signOut],
  )
}

// ---------------------------------------------------------------------------
// Consumer hook
// ---------------------------------------------------------------------------

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
