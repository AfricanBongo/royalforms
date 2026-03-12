import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis } from 'recharts'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'

import type { TrendDataPoint } from '../types.ts'

interface SubmissionTrendChartProps {
  data: TrendDataPoint[] | undefined
  isLoading: boolean
  color?: string
  variant?: 'area' | 'bar'
  title?: string
}

function formatDateTick(dateStr: string, dataLength: number): string {
  const date = new Date(dateStr)
  if (dataLength <= 7) {
    return date.toLocaleDateString('en-US', { weekday: 'short' })
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function SubmissionTrendChart({
  data,
  isLoading,
  color = 'chart-1',
  variant = 'area',
  title = 'Submission Trend',
}: SubmissionTrendChartProps) {
  const chartConfig: ChartConfig = {
    count: {
      label: 'Submissions',
      color: `hsl(var(--${color}))`,
    },
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[250px] w-full rounded-lg" />
        ) : !data?.length ? (
          <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
            No data for this period
          </div>
        ) : variant === 'area' ? (
          <ChartContainer config={chartConfig} className="h-[250px] w-full">
            <AreaChart data={data} accessibilityLayer>
              <defs>
                <linearGradient id={`fill-${color}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={`var(--color-count)`} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={`var(--color-count)`} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value: string) => formatDateTick(value, data.length)}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                dataKey="count"
                type="monotone"
                fill={`url(#fill-${color})`}
                stroke="var(--color-count)"
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        ) : (
          <ChartContainer config={chartConfig} className="h-[250px] w-full">
            <BarChart data={data} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value: string) => formatDateTick(value, data.length)}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar
                dataKey="count"
                fill="var(--color-count)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
