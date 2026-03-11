import type { ReactNode } from 'react'

import { SetupContext, useSetupProvider } from '../hooks/use-setup'

interface SetupProviderProps {
  children: ReactNode
}

export function SetupProvider({ children }: SetupProviderProps) {
  const setup = useSetupProvider()
  return <SetupContext.Provider value={setup}>{children}</SetupContext.Provider>
}
