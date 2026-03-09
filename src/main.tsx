import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { RouterProvider, createRouter } from '@tanstack/react-router'

import { AuthProvider } from './components/auth-provider'
import { useAuth } from './hooks/use-auth'
import { routeTree } from './routeTree.gen'

import './index.css'

const router = createRouter({
  routeTree,
  context: {
    // Will be populated at render time by InnerApp
    auth: undefined!,
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
  return <RouterProvider router={router} context={{ auth }} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <InnerApp />
    </AuthProvider>
  </StrictMode>,
)
