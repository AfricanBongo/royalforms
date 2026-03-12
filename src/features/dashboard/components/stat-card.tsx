import {
  Users,
  Building2,
  FileText,
  ClipboardList,
  Target,
  PenLine,
  CheckCircle,
  BarChart3,
} from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

import type { StatCardData } from '../types.ts'

interface StatCardProps {
  data: StatCardData | undefined
  isLoading: boolean
}

const iconMap: Record<string, typeof Users> = {
  'users': Users,
  'building-2': Building2,
  'file-text': FileText,
  'clipboard-list': ClipboardList,
  'target': Target,
  'pen-line': PenLine,
  'check-circle': CheckCircle,
  'bar-chart-3': BarChart3,
}

const iconColorMap = {
  'chart-1': {
    bg: 'bg-[hsl(var(--chart-1)/0.15)]',
    text: 'text-[hsl(var(--chart-1))]',
  },
  'chart-2': {
    bg: 'bg-[hsl(var(--chart-2)/0.15)]',
    text: 'text-[hsl(var(--chart-2))]',
  },
  'chart-3': {
    bg: 'bg-[hsl(var(--chart-3)/0.15)]',
    text: 'text-[hsl(var(--chart-3))]',
  },
  'chart-4': {
    bg: 'bg-[hsl(var(--chart-4)/0.15)]',
    text: 'text-[hsl(var(--chart-4))]',
  },
  'chart-5': {
    bg: 'bg-[hsl(var(--chart-5)/0.15)]',
    text: 'text-[hsl(var(--chart-5))]',
  },
} as const

export function StatCard({ data, isLoading }: StatCardProps) {
  if (isLoading || !data) {
    return (
      <Card>
        <CardContent className="flex items-center gap-4">
          <Skeleton className="size-12 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-4 w-28" />
          </div>
        </CardContent>
      </Card>
    )
  }

  const Icon = iconMap[data.icon] ?? Users
  const colors = iconColorMap[data.iconColor]

  return (
    <Card>
      <CardContent className="flex items-center gap-4">
        <div
          className={`flex size-12 shrink-0 items-center justify-center rounded-full ${colors.bg}`}
        >
          <Icon className={`size-6 ${colors.text}`} />
        </div>
        <div>
          <p className="text-3xl font-bold">{data.value}</p>
          <p className="text-sm text-muted-foreground">
            {data.label}
            {data.delta && (
              <span className="ml-1.5">{data.delta}</span>
            )}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
