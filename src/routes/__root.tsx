import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'

import { MinWidthGate } from '../components/min-width-gate'
import { Toaster } from '../components/ui/sonner'
import { TooltipProvider } from '../components/ui/tooltip'
import type { AuthContextValue } from '../hooks/use-auth'

export interface RouterContext {
  auth: AuthContextValue
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
})

function RootLayout() {
  return (
    <TooltipProvider>
      <MinWidthGate>
        <Outlet />
        <Toaster position="bottom-right" />
      </MinWidthGate>
    </TooltipProvider>
  )
}
