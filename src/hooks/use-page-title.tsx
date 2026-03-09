/**
 * Page title context — allows child routes to communicate their page title
 * up to the authenticated layout for dynamic breadcrumbs.
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
}

const PageTitleContext = createContext<PageTitleContextValue | null>(null)

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [pageTitle, setPageTitleState] = useState<string | null>(null)

  const setPageTitle = useCallback((title: string | null) => {
    setPageTitleState(title)
  }, [])

  const value = useMemo(
    () => ({ pageTitle, setPageTitle }),
    [pageTitle, setPageTitle],
  )

  return (
    <PageTitleContext.Provider value={value}>
      {children}
    </PageTitleContext.Provider>
  )
}

/**
 * Hook for child routes to set their dynamic page title.
 */
export function usePageTitle() {
  const ctx = useContext(PageTitleContext)
  if (!ctx) {
    throw new Error('usePageTitle must be used within a PageTitleProvider')
  }
  return ctx
}
