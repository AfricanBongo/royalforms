import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { RouterProvider, createRouter } from '@tanstack/react-router'

import { AuthProvider } from './components/auth-provider'
import { SetupProvider } from './components/setup-provider'
import { useAuth } from './hooks/use-auth'
import { useSetup } from './hooks/use-setup'
import { routeTree } from './routeTree.gen'

import './index.css'

const router = createRouter({
  routeTree,
  context: {
    // Will be populated at render time by InnerApp
    auth: undefined!,
    setup: undefined!,
  },
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// eslint-disable-next-line react-refresh/only-export-components
function InnerApp() {
  const auth = useAuth()
  const setup = useSetup()

  // Block all routing until setup status is resolved.
  // Without this gate, route guards that check `isSetupComplete === false`
  // would not redirect to /setup while the value is still `null` (loading).
  if (setup.isSetupComplete === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      </div>
    )
  }

  return <RouterProvider router={router} context={{ auth, setup }} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SetupProvider>
      <AuthProvider>
        <InnerApp />
      </AuthProvider>
    </SetupProvider>
  </StrictMode>,
)
