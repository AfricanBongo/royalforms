/**
 * Shared filter types and helpers used by FilterPopover and list pages.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StatusOption {
  value: string
  label: string
}

export interface GroupOption {
  id: string
  name: string
}

export interface FilterState {
  statuses: string[]
  groupIds: string[]
  dateFrom: Date | undefined
  dateTo: Date | undefined
}

export const EMPTY_FILTERS: FilterState = {
  statuses: [],
  groupIds: [],
  dateFrom: undefined,
  dateTo: undefined,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function countActiveFilters(filters: FilterState): number {
  let count = 0
  if (filters.statuses.length > 0) count += 1
  if (filters.groupIds.length > 0) count += 1
  if (filters.dateFrom) count += 1
  if (filters.dateTo) count += 1
  return count
}

/**
 * Apply filters to a list of items. Generic so it works for any row type.
 *
 * - `getStatus`: extract the status string from a row
 * - `getGroupId`: extract the group id from a row (optional)
 * - `getDate`: extract the created_at date string from a row
 */
export function applyFilters<T>(
  items: T[],
  filters: FilterState,
  accessors: {
    getStatus: (item: T) => string
    getGroupId?: (item: T) => string
    getDate: (item: T) => string
  },
): T[] {
  return items.filter((item) => {
    // Status filter
    if (
      filters.statuses.length > 0 &&
      !filters.statuses.includes(accessors.getStatus(item))
    ) {
      return false
    }

    // Group filter
    if (
      filters.groupIds.length > 0 &&
      accessors.getGroupId &&
      !filters.groupIds.includes(accessors.getGroupId(item))
    ) {
      return false
    }

    // Date from
    if (filters.dateFrom) {
      const itemDate = new Date(accessors.getDate(item))
      const from = new Date(filters.dateFrom)
      from.setHours(0, 0, 0, 0)
      if (itemDate < from) return false
    }

    // Date to
    if (filters.dateTo) {
      const itemDate = new Date(accessors.getDate(item))
      const to = new Date(filters.dateTo)
      to.setHours(23, 59, 59, 999)
      if (itemDate > to) return false
    }

    return true
  })
}
