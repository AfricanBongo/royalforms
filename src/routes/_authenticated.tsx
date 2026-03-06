import { createFileRoute, Outlet, redirect, useMatches } from '@tanstack/react-router'

import { AppSidebar } from '../components/app-sidebar'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from '../components/ui/breadcrumb'
import { Separator } from '../components/ui/separator'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '../components/ui/sidebar'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ context }) => {
    // Still loading auth state -- let it resolve
    if (context.auth.isLoading) return

    // Not authenticated -- redirect to login
    if (!context.auth.session) {
      throw redirect({ to: '/login' })
    }

    // Authenticated but account disabled
    if (context.auth.currentUser && !context.auth.currentUser.isActive) {
      throw redirect({ to: '/login' })
    }
  },
  component: AuthenticatedLayout,
})

// ---------------------------------------------------------------------------
// Route label mapping for breadcrumbs
// ---------------------------------------------------------------------------

const ROUTE_LABELS: Record<string, string> = {
  '/': 'Home',
  '/forms': 'Forms',
  '/reports': 'Reports',
  '/groups': 'Groups',
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

function AuthenticatedLayout() {
  const matches = useMatches()
  const currentPath = matches[matches.length - 1]?.pathname ?? '/'
  const pageLabel = ROUTE_LABELS[currentPath] ?? 'Page'

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        {/* Header bar with sidebar trigger + breadcrumb */}
        <header className="flex h-12 items-center gap-2 border-b border-border px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-6" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage className="text-sm text-muted-foreground">
                  {pageLabel}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
