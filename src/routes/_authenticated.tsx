import { useEffect } from 'react'

import { createFileRoute, Link, Outlet, redirect, useMatches, useNavigate } from '@tanstack/react-router'

import { AppSidebar } from '../components/app-sidebar'
import { useAuth } from '../hooks/use-auth'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '../components/ui/breadcrumb'
import { Separator } from '../components/ui/separator'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '../components/ui/sidebar'
import { PageTitleProvider, usePageTitle } from '../hooks/use-page-title'
import { ReportGenerationWatchProvider } from '../hooks/use-report-generation-watch'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ context }) => {
    // Setup not complete -- redirect to setup wizard
    if (context.setup.isSetupComplete === false) {
      throw redirect({ to: '/setup' })
    }

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

const SEGMENT_LABELS: Record<string, string> = {
  groups: 'Groups',
  forms: 'Forms',
  reports: 'Reports',
  settings: 'Settings',
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

function AuthenticatedLayout() {
  const { session, isLoading } = useAuth()
  const navigate = useNavigate()

  // Redirect to login when session is cleared (e.g. sign-out, token expiry).
  // The beforeLoad guard only runs on navigation events, so this effect
  // covers the case where the session drops while the user is on a page.
  useEffect(() => {
    if (!isLoading && !session) {
      void navigate({ to: '/login' })
    }
  }, [isLoading, session, navigate])

  return (
    <PageTitleProvider>
      <ReportGenerationWatchProvider>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset className="max-h-svh overflow-hidden">
            <HeaderBar />

            {/* Page content */}
            <div className="flex-1 overflow-auto">
              <Outlet />
            </div>
          </SidebarInset>
        </SidebarProvider>
      </ReportGenerationWatchProvider>
    </PageTitleProvider>
  )
}

// ---------------------------------------------------------------------------
// Header bar with breadcrumbs (extracted so it can use usePageTitle)
// ---------------------------------------------------------------------------

function HeaderBar() {
  const matches = useMatches()
  const { pageTitle, breadcrumbs: contextBreadcrumbs, headerActions } = usePageTitle()

  // Build breadcrumb trail from URL path
  const currentPath = matches[matches.length - 1]?.pathname ?? '/'

  // Remove trailing slash, split into segments, filter empties
  const segments = currentPath.replace(/\/$/, '').split('/').filter(Boolean)

  // Build crumbs: each known segment gets a label + link
  const crumbs: Array<{ label: string; path: string }> = []

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    const label = SEGMENT_LABELS[segment]

    if (label) {
      // Known segment — add as a crumb
      const path = '/' + segments.slice(0, i + 1).join('/')
      crumbs.push({ label, path })
    }
  }

  // Append child-route breadcrumbs (multi-segment) or pageTitle (single crumb)
  if (contextBreadcrumbs.length > 0) {
    crumbs.push(...contextBreadcrumbs)
  } else if (pageTitle && crumbs.length > 0) {
    crumbs.push({ label: pageTitle, path: currentPath })
  }

  // If no crumbs at all, show "Home"
  if (crumbs.length === 0) {
    crumbs.push({ label: 'Home', path: '/' })
  }

  return (
    <header className="flex h-12 items-center gap-2 border-b border-border px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="h-6" />
      <Breadcrumb>
        <BreadcrumbList>
          {crumbs.map((crumb, index) => {
            const isLast = index === crumbs.length - 1

            return (
              <BreadcrumbItem key={crumb.path}>
                {index > 0 && <BreadcrumbSeparator />}
                {isLast ? (
                  <BreadcrumbPage className="text-sm text-foreground">
                    {crumb.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={crumb.path}>
                      {crumb.label}
                    </Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            )
          })}
        </BreadcrumbList>
      </Breadcrumb>

      {/* Right-aligned header actions injected by child routes */}
      {headerActions && (
        <div className="ml-auto flex items-center gap-2">
          {headerActions}
        </div>
      )}
    </header>
  )
}
