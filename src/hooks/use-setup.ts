import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { checkSetupComplete } from '../services/setup'

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

export interface SetupContextValue {
  /** Whether the initial setup has been completed (null = loading) */
  isSetupComplete: boolean | null
  /** True while the initial check is being resolved */
  isLoading: boolean
  /** Re-check setup status (call after wizard completes) */
  refresh: () => void
}

export const SetupContext = createContext<SetupContextValue | null>(null)

// ---------------------------------------------------------------------------
// Provider hook (internal -- used by SetupProvider component)
// ---------------------------------------------------------------------------

export function useSetupProvider(): SetupContextValue {
  const [isSetupComplete, setIsSetupComplete] = useState<boolean | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const check = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await checkSetupComplete()
      setIsSetupComplete(result)
    } catch (err) {
      console.error('Setup check failed:', err)
      // On error, assume setup is complete to avoid blocking the app
      setIsSetupComplete(true)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void check()
  }, [check])

  const refresh = useCallback(() => {
    void check()
  }, [check])

  return useMemo(
    () => ({ isSetupComplete, isLoading, refresh }),
    [isSetupComplete, isLoading, refresh],
  )
}

// ---------------------------------------------------------------------------
// Consumer hook
// ---------------------------------------------------------------------------

export function useSetup(): SetupContextValue {
  const ctx = useContext(SetupContext)
  if (!ctx) {
    throw new Error('useSetup must be used within a SetupProvider')
  }
  return ctx
}
