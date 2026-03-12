import { useEffect, useState } from 'react'

import { createFileRoute } from '@tanstack/react-router'

import { useCurrentUser } from '../../hooks/use-current-user'
import { usePageTitle } from '../../hooks/use-page-title'
import { useDashboardData } from '../../features/dashboard/use-dashboard-data'
import { DashboardGreeting } from '../../features/dashboard/components/dashboard-greeting'
import { ActionBanner } from '../../features/dashboard/components/action-banner'
import { RootAdminDashboard } from '../../features/dashboard/layouts/root-admin-dashboard'
import { AdminDashboard } from '../../features/dashboard/layouts/admin-dashboard'
import { EditorDashboard } from '../../features/dashboard/layouts/editor-dashboard'
import { ViewerDashboard } from '../../features/dashboard/layouts/viewer-dashboard'
import type { TimeRange } from '../../features/dashboard/types'

export const Route = createFileRoute('/_authenticated/')({
  component: DashboardPage,
})

function DashboardPage() {
  const currentUser = useCurrentUser()
  const { setPageTitle } = usePageTitle()
  const [timeRange, setTimeRange] = useState<TimeRange>('7d')

  useEffect(() => {
    setPageTitle('Dashboard')
    return () => setPageTitle(null)
  }, [setPageTitle])

  // Must call hook unconditionally
  const data = useDashboardData(
    currentUser?.role ?? 'viewer',
    timeRange,
    currentUser?.groupId ?? undefined,
    currentUser?.id,
  )

  if (!currentUser) return null

  return (
    <div className="flex flex-col gap-6 p-6">
      <DashboardGreeting
        firstName={currentUser.firstName}
        actionItemCount={data.actionItems.data?.length ?? 0}
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
      />
      <ActionBanner items={data.actionItems.data} isLoading={data.actionItems.isLoading} />
      {currentUser.role === 'root_admin' && <RootAdminDashboard data={data} />}
      {currentUser.role === 'admin' && <AdminDashboard data={data} groupId={currentUser.groupId!} />}
      {currentUser.role === 'editor' && <EditorDashboard data={data} />}
      {currentUser.role === 'viewer' && <ViewerDashboard data={data} />}
    </div>
  )
}
