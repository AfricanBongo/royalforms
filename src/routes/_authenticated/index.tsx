/**
 * Dashboard page — role-adaptive dashboard with widgets.
 *
 * Renders different widget layouts based on the current user's role:
 * - Root Admin: system-wide stats, pending requests, schedules, group activity
 * - Admin: group members, pending requests, draft instances, recent submissions
 * - Editor: assigned fields, draft instances, recent submissions
 * - Viewer: recent submissions, available reports
 */
import { useEffect, useState } from 'react'

import { createFileRoute } from '@tanstack/react-router'
import { toast } from 'sonner'

import { useCurrentUser } from '../../hooks/use-current-user'
import { usePageTitle } from '../../hooks/use-page-title'
import {
  fetchPendingRequestCount,
  fetchRecentSubmissions,
  fetchActiveScheduleCount,
  fetchGroupActivity,
  fetchSystemStats,
  fetchGroupMembersList,
  fetchGroupPendingRequests,
  fetchDraftInstances,
  fetchAssignedFields,
  fetchGroupRecentSubmissions,
} from '../../services/dashboard'
import { mapSupabaseError } from '../../lib/supabase-errors'
import {
  PendingRequestsWidget,
  RecentSubmissionsWidget,
  ActiveSchedulesWidget,
  GroupActivityWidget,
  SystemStatsWidget,
  GroupMembersWidget,
  DraftInstancesWidget,
  AssignedFieldsWidget,
  AvailableReportsWidget,
} from '../../features/dashboard/widgets'

import type {
  RecentSubmission,
  GroupActivity as GroupActivityData,
  SystemStats as SystemStatsData,
  GroupMemberRow,
  DraftInstance,
  AssignedField,
} from '../../services/dashboard'

export const Route = createFileRoute('/_authenticated/')({
  component: DashboardPage,
})

// ---------------------------------------------------------------------------
// Error helper
// ---------------------------------------------------------------------------

function handleFetchError(err: unknown, context: string) {
  const error = err as { code?: string; message?: string }
  const mapped = mapSupabaseError(
    error.code,
    error.message ?? 'Unknown error',
    'database',
    'read_record',
  )
  toast.error(mapped.title, { description: `${context}: ${mapped.description}` })
}

// ---------------------------------------------------------------------------
// Role-specific dashboards
// ---------------------------------------------------------------------------

function RootAdminDashboard() {
  const [pendingRequests, setPendingRequests] = useState<number | undefined>(undefined)
  const [recentSubmissions, setRecentSubmissions] = useState<RecentSubmission[] | undefined>(undefined)
  const [activeSchedules, setActiveSchedules] = useState<number | undefined>(undefined)
  const [groupActivity, setGroupActivity] = useState<GroupActivityData[] | undefined>(undefined)
  const [systemStats, setSystemStats] = useState<SystemStatsData | undefined>(undefined)

  useEffect(() => {
    fetchPendingRequestCount()
      .then(setPendingRequests)
      .catch((err) => handleFetchError(err, 'Pending requests'))

    fetchRecentSubmissions(5)
      .then(setRecentSubmissions)
      .catch((err) => handleFetchError(err, 'Recent submissions'))

    fetchActiveScheduleCount()
      .then(setActiveSchedules)
      .catch((err) => handleFetchError(err, 'Active schedules'))

    fetchGroupActivity()
      .then(setGroupActivity)
      .catch((err) => handleFetchError(err, 'Group activity'))

    fetchSystemStats()
      .then(setSystemStats)
      .catch((err) => handleFetchError(err, 'System stats'))
  }, [])

  return (
    <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2 lg:grid-cols-3">
      <PendingRequestsWidget count={pendingRequests} />
      <ActiveSchedulesWidget count={activeSchedules} />
      <RecentSubmissionsWidget submissions={recentSubmissions} />
      <SystemStatsWidget stats={systemStats} />
      <GroupActivityWidget groups={groupActivity} />
    </div>
  )
}

interface GroupDashboardProps {
  groupId: string
}

function AdminDashboard({ groupId }: GroupDashboardProps) {
  const [members, setMembers] = useState<GroupMemberRow[] | undefined>(undefined)
  const [pendingRequests, setPendingRequests] = useState<number | undefined>(undefined)
  const [draftInstances, setDraftInstances] = useState<DraftInstance[] | undefined>(undefined)
  const [recentSubmissions, setRecentSubmissions] = useState<RecentSubmission[] | undefined>(undefined)

  useEffect(() => {
    fetchGroupMembersList(groupId)
      .then(setMembers)
      .catch((err) => handleFetchError(err, 'Group members'))

    fetchGroupPendingRequests(groupId)
      .then(setPendingRequests)
      .catch((err) => handleFetchError(err, 'Pending requests'))

    fetchDraftInstances(groupId, 5)
      .then(setDraftInstances)
      .catch((err) => handleFetchError(err, 'Draft instances'))

    fetchGroupRecentSubmissions(groupId, 5)
      .then(setRecentSubmissions)
      .catch((err) => handleFetchError(err, 'Recent submissions'))
  }, [groupId])

  return (
    <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2 lg:grid-cols-3">
      <PendingRequestsWidget count={pendingRequests} />
      <GroupMembersWidget members={members} groupId={groupId} />
      <DraftInstancesWidget instances={draftInstances} />
      <RecentSubmissionsWidget submissions={recentSubmissions} title="Group Submissions" />
    </div>
  )
}

interface EditorDashboardProps {
  groupId: string
  userId: string
}

function EditorDashboard({ groupId, userId }: EditorDashboardProps) {
  const [assignedFields, setAssignedFields] = useState<AssignedField[] | undefined>(undefined)
  const [draftInstances, setDraftInstances] = useState<DraftInstance[] | undefined>(undefined)
  const [recentSubmissions, setRecentSubmissions] = useState<RecentSubmission[] | undefined>(undefined)

  useEffect(() => {
    fetchAssignedFields(userId)
      .then(setAssignedFields)
      .catch((err) => handleFetchError(err, 'Assigned fields'))

    fetchDraftInstances(groupId, 5)
      .then(setDraftInstances)
      .catch((err) => handleFetchError(err, 'Draft instances'))

    fetchGroupRecentSubmissions(groupId, 5)
      .then(setRecentSubmissions)
      .catch((err) => handleFetchError(err, 'Recent submissions'))
  }, [groupId, userId])

  return (
    <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2 lg:grid-cols-3">
      <AssignedFieldsWidget fields={assignedFields} />
      <DraftInstancesWidget instances={draftInstances} />
      <RecentSubmissionsWidget submissions={recentSubmissions} title="Group Submissions" />
    </div>
  )
}

interface ViewerDashboardProps {
  groupId: string
}

function ViewerDashboard({ groupId }: ViewerDashboardProps) {
  const [recentSubmissions, setRecentSubmissions] = useState<RecentSubmission[] | undefined>(undefined)

  useEffect(() => {
    fetchGroupRecentSubmissions(groupId, 10)
      .then(setRecentSubmissions)
      .catch((err) => handleFetchError(err, 'Recent submissions'))
  }, [groupId])

  return (
    <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2 lg:grid-cols-3">
      <RecentSubmissionsWidget submissions={recentSubmissions} title="Recent Submissions" />
      <AvailableReportsWidget />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main dashboard page
// ---------------------------------------------------------------------------

function DashboardPage() {
  const currentUser = useCurrentUser()
  const { setPageTitle } = usePageTitle()

  useEffect(() => {
    setPageTitle('Dashboard')
    return () => setPageTitle(null)
  }, [setPageTitle])

  if (!currentUser) return null

  switch (currentUser.role) {
    case 'root_admin':
      return <RootAdminDashboard />
    case 'admin':
      return <AdminDashboard groupId={currentUser.groupId!} />
    case 'editor':
      return <EditorDashboard groupId={currentUser.groupId!} userId={currentUser.id} />
    case 'viewer':
      return <ViewerDashboard groupId={currentUser.groupId!} />
    default:
      return null
  }
}
