/**
 * useDashboardData — fetches all dashboard sections in parallel, role-aware.
 *
 * Each section loads independently so one failure doesn't cascade.
 * Re-fetches when timeRange, role, groupId, or userId change.
 */
import { useEffect, useState } from 'react'

import { toast } from 'sonner'

import { mapSupabaseError } from '../../lib/supabase-errors'
import {
  fetchAdminActionItems,
  fetchAdminStats,
  fetchAssignedFieldsGrouped,
  fetchEditorActionItems,
  fetchEditorActivityTrend,
  fetchEditorStats,
  fetchGroupBreakdown,
  fetchGroupMembersList,
  fetchRecentFormInstances,
  fetchRecentReportInstances,
  fetchRootAdminActionItems,
  fetchRootAdminStats,
  fetchSubmissionTrend,
  fetchViewerActionItems,
  fetchViewerStats,
} from '../../services/dashboard'
import { supabase } from '../../services/supabase'
import { TIME_RANGES } from './types'
import type {
  ActionItem,
  AssignedFieldGroup,
  GroupBreakdownPoint,
  GroupMemberCompact,
  RecentFormInstance,
  RecentReportInstance,
  StatCardData,
  TimeRange,
  TrendDataPoint,
} from './types'
import type { UserRole } from '../../types/auth'

// ---------------------------------------------------------------------------
// Section state helper
// ---------------------------------------------------------------------------

interface SectionState<T> {
  data: T | undefined
  isLoading: boolean
}

function initialSection<T>(): SectionState<T> {
  return { data: undefined, isLoading: true }
}

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface DashboardData {
  stats: SectionState<StatCardData[]>
  trend: SectionState<TrendDataPoint[]>
  actionItems: SectionState<ActionItem[]>
  recentForms: SectionState<RecentFormInstance[]>
  recentReports: SectionState<RecentReportInstance[]>
  groupBreakdown: SectionState<GroupBreakdownPoint[]> | undefined
  members: SectionState<GroupMemberCompact[]> | undefined
  totalMembers: number | undefined
  assignedFields: SectionState<AssignedFieldGroup[]> | undefined
}

// ---------------------------------------------------------------------------
// Error handler (shared across sections)
// ---------------------------------------------------------------------------

function handleSectionError(err: unknown, section: string) {
  const error = err as { code?: string; message?: string }
  const mapped = mapSupabaseError(
    error.code,
    error.message ?? 'Unknown error',
    'database',
    'read_record',
  )
  toast.error(mapped.title, {
    description: `${section}: ${mapped.description}`,
  })
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDashboardData(
  role: UserRole,
  timeRange: TimeRange,
  groupId?: string,
  userId?: string,
): DashboardData {
  const days = TIME_RANGES[timeRange].days

  // --- Section states ---
  const [stats, setStats] = useState<SectionState<StatCardData[]>>(initialSection)
  const [trend, setTrend] = useState<SectionState<TrendDataPoint[]>>(initialSection)
  const [actionItems, setActionItems] = useState<SectionState<ActionItem[]>>(initialSection)
  const [recentForms, setRecentForms] = useState<SectionState<RecentFormInstance[]>>(initialSection)
  const [recentReports, setRecentReports] = useState<SectionState<RecentReportInstance[]>>(initialSection)
  const [groupBreakdown, setGroupBreakdown] = useState<SectionState<GroupBreakdownPoint[]>>(initialSection)
  const [members, setMembers] = useState<SectionState<GroupMemberCompact[]>>(initialSection)
  const [totalMembers, setTotalMembers] = useState<number | undefined>(undefined)
  const [assignedFields, setAssignedFields] = useState<SectionState<AssignedFieldGroup[]>>(initialSection)

  useEffect(() => {
    let cancelled = false

    // Reset all sections to loading
    setStats(initialSection)
    setTrend(initialSection)
    setActionItems(initialSection)
    setRecentForms(initialSection)
    setRecentReports(initialSection)
    if (role === 'root_admin') setGroupBreakdown(initialSection)
    if (role === 'admin') {
      setMembers(initialSection)
      setTotalMembers(undefined)
    }
    if (role === 'editor') setAssignedFields(initialSection)

    // --- Stats ---
    const loadStats = async () => {
      try {
        let data: StatCardData[]
        switch (role) {
          case 'root_admin':
            data = await fetchRootAdminStats(days)
            break
          case 'admin':
            data = await fetchAdminStats(groupId!, days)
            break
          case 'editor':
            data = await fetchEditorStats(userId!, groupId!, days)
            break
          case 'viewer':
            data = await fetchViewerStats(groupId!, days)
            break
        }
        if (!cancelled) setStats({ data, isLoading: false })
      } catch (err) {
        if (!cancelled) {
          handleSectionError(err, 'Stats')
          setStats({ data: undefined, isLoading: false })
        }
      }
    }

    // --- Trend ---
    const loadTrend = async () => {
      try {
        let data: TrendDataPoint[]
        if (role === 'editor' && userId) {
          data = await fetchEditorActivityTrend(userId, days)
        } else {
          data = await fetchSubmissionTrend(
            days,
            role !== 'root_admin' ? groupId : undefined,
          )
        }
        if (!cancelled) setTrend({ data, isLoading: false })
      } catch (err) {
        if (!cancelled) {
          handleSectionError(err, 'Trend')
          setTrend({ data: undefined, isLoading: false })
        }
      }
    }

    // --- Action Items ---
    const loadActionItems = async () => {
      try {
        let data: ActionItem[]
        switch (role) {
          case 'root_admin':
            data = await fetchRootAdminActionItems()
            break
          case 'admin':
            data = await fetchAdminActionItems(groupId!)
            break
          case 'editor':
            data = await fetchEditorActionItems(userId!)
            break
          case 'viewer':
            data = await fetchViewerActionItems(groupId!)
            break
        }
        if (!cancelled) setActionItems({ data, isLoading: false })
      } catch (err) {
        if (!cancelled) {
          handleSectionError(err, 'Action Items')
          setActionItems({ data: undefined, isLoading: false })
        }
      }
    }

    // --- Recent Forms ---
    const loadRecentForms = async () => {
      try {
        const data = await fetchRecentFormInstances(
          5,
          role !== 'root_admin' ? groupId : undefined,
        )
        if (!cancelled) setRecentForms({ data, isLoading: false })
      } catch (err) {
        if (!cancelled) {
          handleSectionError(err, 'Recent Forms')
          setRecentForms({ data: undefined, isLoading: false })
        }
      }
    }

    // --- Recent Reports ---
    const loadRecentReports = async () => {
      try {
        const data = await fetchRecentReportInstances(
          5,
          role !== 'root_admin' ? groupId : undefined,
        )
        if (!cancelled) setRecentReports({ data, isLoading: false })
      } catch (err) {
        if (!cancelled) {
          handleSectionError(err, 'Recent Reports')
          setRecentReports({ data: undefined, isLoading: false })
        }
      }
    }

    // --- Group Breakdown (root_admin only) ---
    const loadGroupBreakdown = async () => {
      if (role !== 'root_admin') return
      try {
        const data = await fetchGroupBreakdown(days)
        if (!cancelled) setGroupBreakdown({ data, isLoading: false })
      } catch (err) {
        if (!cancelled) {
          handleSectionError(err, 'Group Breakdown')
          setGroupBreakdown({ data: undefined, isLoading: false })
        }
      }
    }

    // --- Members (admin only) ---
    const loadMembers = async () => {
      if (role !== 'admin' || !groupId) return
      try {
        // Fetch limited list + total count in parallel
        const [list, countResult] = await Promise.all([
          fetchGroupMembersList(groupId, 5),
          supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .eq('group_id', groupId)
            .eq('is_active', true),
        ])
        if (countResult.error) throw countResult.error
        if (!cancelled) {
          setMembers({ data: list, isLoading: false })
          setTotalMembers(countResult.count ?? 0)
        }
      } catch (err) {
        if (!cancelled) {
          handleSectionError(err, 'Members')
          setMembers({ data: undefined, isLoading: false })
          setTotalMembers(undefined)
        }
      }
    }

    // --- Assigned Fields (editor only) ---
    const loadAssignedFields = async () => {
      if (role !== 'editor' || !userId) return
      try {
        const data = await fetchAssignedFieldsGrouped(userId)
        if (!cancelled) setAssignedFields({ data, isLoading: false })
      } catch (err) {
        if (!cancelled) {
          handleSectionError(err, 'Assigned Fields')
          setAssignedFields({ data: undefined, isLoading: false })
        }
      }
    }

    // Fire all fetches in parallel
    void loadStats()
    void loadTrend()
    void loadActionItems()
    void loadRecentForms()
    void loadRecentReports()
    void loadGroupBreakdown()
    void loadMembers()
    void loadAssignedFields()

    return () => {
      cancelled = true
    }
  }, [role, days, groupId, userId])

  return {
    stats,
    trend,
    actionItems,
    recentForms,
    recentReports,
    groupBreakdown: role === 'root_admin' ? groupBreakdown : undefined,
    members: role === 'admin' ? members : undefined,
    totalMembers: role === 'admin' ? totalMembers : undefined,
    assignedFields: role === 'editor' ? assignedFields : undefined,
  }
}
