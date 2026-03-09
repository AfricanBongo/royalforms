/**
 * Page title context — allows child routes to communicate their page title
 * and optional header actions up to the authenticated layout.
 *
 * - `pageTitle` appears in the breadcrumb trail
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

interface PageTitleContextValue {
  /** The dynamic page title set by the current route */
  pageTitle: string | null
  /** Set the page title from a child route */
  setPageTitle: (title: string | null) => void
  /** Optional ReactNode rendered right-aligned in the header bar */
  headerActions: ReactNode | null
  /** Set header action buttons from a child route */
  setHeaderActions: (actions: ReactNode | null) => void
}

const PageTitleContext = createContext<PageTitleContextValue | null>(null)

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [pageTitle, setPageTitleState] = useState<string | null>(null)
  const [headerActions, setHeaderActionsState] = useState<ReactNode | null>(null)

  const setPageTitle = useCallback((title: string | null) => {
    setPageTitleState(title)
  }, [])

  const setHeaderActions = useCallback((actions: ReactNode | null) => {
    setHeaderActionsState(actions)
  }, [])

  const value = useMemo(
    () => ({ pageTitle, setPageTitle, headerActions, setHeaderActions }),
    [pageTitle, setPageTitle, headerActions, setHeaderActions],
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
