import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

import type { TimeRange } from '../types.ts'

interface DashboardGreetingProps {
  firstName: string
  actionItemCount: number
  timeRange: TimeRange
  onTimeRangeChange: (range: TimeRange) => void
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function DashboardGreeting({
  firstName,
  actionItemCount,
  timeRange,
  onTimeRangeChange,
}: DashboardGreetingProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold">
          {getGreeting()}, {firstName}
        </h1>
        <p className="text-muted-foreground">
          {actionItemCount > 0
            ? `You have ${actionItemCount} item${actionItemCount === 1 ? '' : 's'} needing your attention`
            : 'All caught up!'}
        </p>
      </div>
      <ToggleGroup
        type="single"
        value={timeRange}
        onValueChange={(value) => {
          if (value) onTimeRangeChange(value as TimeRange)
        }}
        variant="outline"
        size="sm"
      >
        <ToggleGroupItem value="7d">7d</ToggleGroupItem>
        <ToggleGroupItem value="30d">30d</ToggleGroupItem>
        <ToggleGroupItem value="90d">90d</ToggleGroupItem>
      </ToggleGroup>
    </div>
  )
}
