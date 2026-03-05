import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'

import { MinWidthGate } from '../components/min-width-gate'
import { Toaster } from '../components/ui/sonner'
import type { AuthContextValue } from '../hooks/use-auth'

export interface RouterContext {
  auth: AuthContextValue
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
})

function RootLayout() {
  return (
    <MinWidthGate>
      <Outlet />
      <Toaster position="bottom-right" />
    </MinWidthGate>
  )
}
