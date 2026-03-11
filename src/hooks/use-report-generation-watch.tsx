/**
 * Realtime report generation watch — monitors report instances that are
 * currently generating and shows toast notifications when they complete.
 *
 * Mounted in the authenticated layout via <ReportGenerationWatchProvider>.
 * Child components consume via useReportGenerationWatch().
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'

import type { ReactNode } from 'react'

import { supabase } from '../services/supabase'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WatchedReport {
  instanceId: string
  readableId: string
  templateId: string
}

interface ReportGenerationWatchContextValue {
  watch: (report: WatchedReport) => void
  watchCount: number
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ReportGenerationWatchContext =
  createContext<ReportGenerationWatchContextValue | null>(null)

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ReportGenerationWatchProvider({
  children,
}: {
  children: ReactNode
}) {
  const [watched, setWatched] = useState<WatchedReport[]>([])
  const navigate = useNavigate()
  const navigateRef = useRef(navigate)

  useEffect(() => {
    navigateRef.current = navigate
  }, [navigate])

  const watch = useCallback((report: WatchedReport) => {
    setWatched((prev) => {
      // Don't add duplicates
      if (prev.some((r) => r.instanceId === report.instanceId)) return prev
      return [...prev, report]
    })
  }, [])

  // Manage realtime channels for each watched report
  useEffect(() => {
    if (watched.length === 0) return

    const channels = watched.map((report) => {
      const channel = supabase
        .channel(`report-watch-${report.instanceId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'report_instances',
            filter: `id=eq.${report.instanceId}`,
          },
          (payload) => {
            const newStatus = (payload.new as Record<string, unknown>)?.status

            if (newStatus === 'ready') {
              toast.success(`Report ${report.readableId} is ready`, {
                action: {
                  label: 'View Report',
                  onClick: () =>
                    void navigateRef.current({
                      to: '/reports/$templateId/instances/$readableId',
                      params: {
                        templateId: report.templateId,
                        readableId: report.readableId,
                      },
                    }),
                },
              })
              setWatched((prev) =>
                prev.filter((r) => r.instanceId !== report.instanceId),
              )
            } else if (newStatus === 'failed') {
              toast.error(`Report ${report.readableId} failed`, {
                action: {
                  label: 'View Details',
                  onClick: () =>
                    void navigateRef.current({
                      to: '/reports/$templateId/instances/$readableId',
                      params: {
                        templateId: report.templateId,
                        readableId: report.readableId,
                      },
                    }),
                },
              })
              setWatched((prev) =>
                prev.filter((r) => r.instanceId !== report.instanceId),
              )
            }
          },
        )
        .subscribe()

      return { instanceId: report.instanceId, channel }
    })

    return () => {
      for (const { channel } of channels) {
        void supabase.removeChannel(channel)
      }
    }
  }, [watched])

  const value = useMemo(
    () => ({ watch, watchCount: watched.length }),
    [watch, watched.length],
  )

  return (
    <ReportGenerationWatchContext.Provider value={value}>
      {children}
    </ReportGenerationWatchContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useReportGenerationWatch() {
  const ctx = useContext(ReportGenerationWatchContext)
  if (!ctx) {
    throw new Error(
      'useReportGenerationWatch must be used within a ReportGenerationWatchProvider',
    )
  }
  return ctx
}
