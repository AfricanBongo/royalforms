import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'

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

import type { GroupBreakdownPoint } from '../types.ts'

interface GroupBreakdownChartProps {
  data: GroupBreakdownPoint[] | undefined
  isLoading: boolean
}

const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
]

export function GroupBreakdownChart({ data, isLoading }: GroupBreakdownChartProps) {
  const chartConfig: ChartConfig = {
    count: {
      label: 'Submissions',
    },
  }

  const coloredData = data?.map((point, i) => ({
    ...point,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Submissions by Group</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[250px] w-full rounded-lg" />
        ) : !data?.length ? (
          <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
            No submissions in this period
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[250px] w-full">
            <BarChart
              data={coloredData}
              layout="vertical"
              margin={{ left: 10 }}
              accessibilityLayer
            >
              <CartesianGrid horizontal={false} />
              <YAxis
                dataKey="group_name"
                type="category"
                tickLine={false}
                axisLine={false}
                width={100}
                tickFormatter={(value: string) =>
                  value.length > 14 ? `${value.slice(0, 14)}...` : value
                }
              />
              <XAxis type="number" tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
