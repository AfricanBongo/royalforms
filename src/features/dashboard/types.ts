/**
 * Dashboard types — shared across all dashboard widgets and service functions.
 */

// ---------------------------------------------------------------------------
// Time range
// ---------------------------------------------------------------------------

export const TIME_RANGES = {
  '7d': { label: '7 days', days: 7 },
  '30d': { label: '30 days', days: 30 },
  '90d': { label: '90 days', days: 90 },
} as const

export type TimeRange = keyof typeof TIME_RANGES

// ---------------------------------------------------------------------------
// Stat cards
// ---------------------------------------------------------------------------

export interface StatCardData {
  label: string
  value: number
  delta: string
  iconColor: 'chart-1' | 'chart-2' | 'chart-3' | 'chart-4' | 'chart-5'
  icon: string
}

// ---------------------------------------------------------------------------
// Trend / chart data
// ---------------------------------------------------------------------------

export interface TrendDataPoint {
  date: string // YYYY-MM-DD
  count: number
}

export interface GroupBreakdownPoint {
  group_id: string
  group_name: string
  count: number
}

// ---------------------------------------------------------------------------
// Action items
// ---------------------------------------------------------------------------

export type ActionColor = 'amber' | 'blue' | 'red' | 'purple'

export interface ActionItem {
  label: string
  description: string
  count: number
  color: ActionColor
  linkTo: string
}

// ---------------------------------------------------------------------------
// Recent lists
// ---------------------------------------------------------------------------

export type FormInstanceStatus = 'pending' | 'submitted'

export interface RecentFormInstance {
  id: string
  readable_id: string
  template_name: string
  group_name: string | null
  status: FormInstanceStatus
  updated_at: string
}

export interface RecentReportInstance {
  id: string
  readable_id: string
  template_name: string
  status: string
  created_at: string
}

// ---------------------------------------------------------------------------
// Group members
// ---------------------------------------------------------------------------

export interface GroupMemberCompact {
  id: string
  full_name: string
  role: string
  avatar_url: string | null
}

// ---------------------------------------------------------------------------
// Assigned fields (grouped by instance)
// ---------------------------------------------------------------------------

export interface AssignedFieldGroup {
  instance_id: string
  readable_id: string
  template_name: string
  fields: { field_id: string; field_label: string }[]
}
