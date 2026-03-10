/**
 * Page title context — allows child routes to communicate their page title
 * and optional header actions up to the authenticated layout.
 *
 * - `pageTitle` appears as the final breadcrumb crumb (simple single-crumb case)
 * - `breadcrumbs` allows child routes to define multiple crumbs
 *   (e.g. "Form Name" > "Edit") that the HeaderBar appends after known segments
 * - `headerActions` renders in the header bar, right-aligned (e.g. Publish button)
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'

import type { ReactNode } from 'react'

export interface BreadcrumbSegment {
  label: string
  path: string
}

interface PageTitleContextValue {
  /** The dynamic page title set by the current route (simple single-crumb) */
  pageTitle: string | null
  /** Set the page title from a child route (single crumb) */
  setPageTitle: (title: string | null) => void
  /** Multi-segment breadcrumbs set by child routes */
  breadcrumbs: BreadcrumbSegment[]
  /** Set multiple breadcrumb segments from a child route */
  setBreadcrumbs: (crumbs: BreadcrumbSegment[]) => void
  /** Optional ReactNode rendered right-aligned in the header bar */
  headerActions: ReactNode | null
  /** Set header action buttons from a child route */
  setHeaderActions: (actions: ReactNode | null) => void
}

const PageTitleContext = createContext<PageTitleContextValue | null>(null)

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [pageTitle, setPageTitleState] = useState<string | null>(null)
  const [breadcrumbs, setBreadcrumbsState] = useState<BreadcrumbSegment[]>([])
  const [headerActions, setHeaderActionsState] = useState<ReactNode | null>(null)

  const setPageTitle = useCallback((title: string | null) => {
    setPageTitleState(title)
    // Clear breadcrumbs when using simple pageTitle
    setBreadcrumbsState([])
  }, [])

  const setBreadcrumbs = useCallback((crumbs: BreadcrumbSegment[]) => {
    setBreadcrumbsState(crumbs)
    // Clear pageTitle when using breadcrumbs
    setPageTitleState(null)
  }, [])

  const setHeaderActions = useCallback((actions: ReactNode | null) => {
    setHeaderActionsState(actions)
  }, [])

  const value = useMemo(
    () => ({ pageTitle, setPageTitle, breadcrumbs, setBreadcrumbs, headerActions, setHeaderActions }),
    [pageTitle, setPageTitle, breadcrumbs, setBreadcrumbs, headerActions, setHeaderActions],
  )

  return (
    <PageTitleContext.Provider value={value}>
      {children}
    </PageTitleContext.Provider>
  )
}

/**
 * Hook for child routes to set their dynamic page title and header actions.
 */
export function usePageTitle() {
  const ctx = useContext(PageTitleContext)
  if (!ctx) {
    throw new Error('usePageTitle must be used within a PageTitleProvider')
  }
  return ctx
}
