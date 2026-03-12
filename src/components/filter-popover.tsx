/**
 * FilterPopover — shared filter dropdown used across list pages.
 *
 * Renders a "Filters" button that opens a popover with:
 * - Status toggle group (multi-select)
 * - Optional group multi-select (for form instances)
 * - Date range picker (from / to)
 * - Active filter count badge
 * - Clear all button
 */
import { useState } from 'react'

import { CalendarIcon, FilterIcon, XIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

import type { FilterState, GroupOption, StatusOption } from '../lib/filter-utils.ts'
import { countActiveFilters, EMPTY_FILTERS } from '../lib/filter-utils.ts'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface FilterPopoverProps {
  filters: FilterState
  onChange: (filters: FilterState) => void
  statusOptions: StatusOption[]
  groupOptions?: GroupOption[]
  /** Label for the status section (default: "Status") */
  statusLabel?: string
}

export function FilterPopover({
  filters,
  onChange,
  statusOptions,
  groupOptions,
  statusLabel = 'Status',
}: FilterPopoverProps) {
  const [open, setOpen] = useState(false)
  const [datePickerTarget, setDatePickerTarget] = useState<
    'from' | 'to' | null
  >(null)

  const activeCount = countActiveFilters(filters)

  function handleStatusToggle(values: string[]) {
    onChange({ ...filters, statuses: values })
  }

  function handleGroupToggle(groupId: string) {
    const next = filters.groupIds.includes(groupId)
      ? filters.groupIds.filter((id) => id !== groupId)
      : [...filters.groupIds, groupId]
    onChange({ ...filters, groupIds: next })
  }

  function handleDateSelect(date: Date | undefined) {
    if (datePickerTarget === 'from') {
      onChange({ ...filters, dateFrom: date })
    } else if (datePickerTarget === 'to') {
      onChange({ ...filters, dateTo: date })
    }
    setDatePickerTarget(null)
  }

  function handleClearAll() {
    onChange(EMPTY_FILTERS)
  }

  function formatDate(d: Date | undefined): string {
    if (!d) return ''
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="default" className="gap-2">
          <FilterIcon className="size-4" />
          Filters
          {activeCount > 0 && (
            <Badge
              variant="secondary"
              className="ml-0.5 h-5 min-w-5 rounded-full px-1.5 text-xs"
            >
              {activeCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        {datePickerTarget ? (
          // Date picker sub-view
          <div className="flex flex-col">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="text-sm font-medium">
                {datePickerTarget === 'from' ? 'From date' : 'To date'}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setDatePickerTarget(null)}
              >
                Back
              </Button>
            </div>
            <div className="flex justify-center p-2">
              <Calendar
                mode="single"
                selected={
                  datePickerTarget === 'from'
                    ? filters.dateFrom
                    : filters.dateTo
                }
                onSelect={handleDateSelect}
                disabled={(date) => date > new Date()}
                initialFocus
              />
            </div>
          </div>
        ) : (
          // Main filter view
          <div className="flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="text-sm font-medium">Filters</span>
              {activeCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground"
                  onClick={handleClearAll}
                >
                  Clear all
                </Button>
              )}
            </div>

            <div className="flex flex-col gap-4 px-4 py-3">
              {/* Status filter */}
              <div className="flex flex-col gap-2">
                <Label className="text-xs font-medium text-muted-foreground">
                  {statusLabel}
                </Label>
                <ToggleGroup
                  type="multiple"
                  value={filters.statuses}
                  onValueChange={handleStatusToggle}
                  className="flex flex-wrap justify-start gap-1"
                >
                  {statusOptions.map((opt) => (
                    <ToggleGroupItem
                      key={opt.value}
                      value={opt.value}
                      size="sm"
                      className="h-7 rounded-full px-3 text-xs"
                    >
                      {opt.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>

              {/* Group filter (optional) */}
              {groupOptions && groupOptions.length > 0 && (
                <>
                  <Separator />
                  <div className="flex flex-col gap-2">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Group
                    </Label>
                    <div className="flex max-h-32 flex-col gap-1.5 overflow-auto">
                      {groupOptions.map((group) => (
                        <label
                          key={group.id}
                          className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted"
                        >
                          <Checkbox
                            checked={filters.groupIds.includes(group.id)}
                            onCheckedChange={() =>
                              handleGroupToggle(group.id)
                            }
                          />
                          {group.name}
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Date range */}
              <Separator />
              <div className="flex flex-col gap-2">
                <Label className="text-xs font-medium text-muted-foreground">
                  Date range
                </Label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 flex-1 justify-start gap-2 px-3 text-xs font-normal"
                    onClick={() => setDatePickerTarget('from')}
                  >
                    <CalendarIcon className="size-3.5 text-muted-foreground" />
                    {filters.dateFrom ? (
                      <span className="flex items-center gap-1">
                        {formatDate(filters.dateFrom)}
                        <XIcon
                          className="size-3 text-muted-foreground hover:text-foreground"
                          onClick={(e) => {
                            e.stopPropagation()
                            onChange({ ...filters, dateFrom: undefined })
                          }}
                        />
                      </span>
                    ) : (
                      <span className="text-muted-foreground">From</span>
                    )}
                  </Button>
                  <span className="text-xs text-muted-foreground">to</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 flex-1 justify-start gap-2 px-3 text-xs font-normal"
                    onClick={() => setDatePickerTarget('to')}
                  >
                    <CalendarIcon className="size-3.5 text-muted-foreground" />
                    {filters.dateTo ? (
                      <span className="flex items-center gap-1">
                        {formatDate(filters.dateTo)}
                        <XIcon
                          className="size-3 text-muted-foreground hover:text-foreground"
                          onClick={(e) => {
                            e.stopPropagation()
                            onChange({ ...filters, dateTo: undefined })
                          }}
                        />
                      </span>
                    ) : (
                      <span className="text-muted-foreground">To</span>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
