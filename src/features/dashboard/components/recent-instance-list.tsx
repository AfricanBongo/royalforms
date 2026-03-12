import { Link } from '@tanstack/react-router'

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

import type { RecentFormInstance, RecentReportInstance } from '../types.ts'

interface RecentInstanceListProps {
  title: string
  items: RecentFormInstance[] | RecentReportInstance[] | undefined
  isLoading: boolean
  type: 'form' | 'report'
  viewAllLink: string
}

function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))

  if (diffHours < 1) return 'just now'
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) return `${diffDays}d ago`
  const diffMonths = Math.floor(diffDays / 30)
  return `${diffMonths}mo ago`
}

const statusColors: Record<string, string> = {
  submitted: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  pending: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  ready: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  generating: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
}

function isFormInstance(
  item: RecentFormInstance | RecentReportInstance,
): item is RecentFormInstance {
  return 'updated_at' in item
}

export function RecentInstanceList({
  title,
  items,
  isLoading,
  type,
  viewAllLink,
}: RecentInstanceListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        ) : !items?.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No recent {type === 'form' ? 'forms' : 'reports'}
          </p>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const dateStr = isFormInstance(item)
                ? item.updated_at
                : item.created_at
              const groupName = isFormInstance(item) ? item.group_name : null

              return (
                <div key={item.id} className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {type === 'form' ? (
                        <Link
                          to="/instances/$readableId"
                          params={{ readableId: item.readable_id }}
                          className="truncate text-sm font-medium hover:underline"
                        >
                          {item.template_name}
                        </Link>
                      ) : (
                        <span className="truncate text-sm font-medium">
                          {item.template_name}
                        </span>
                      )}
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {item.readable_id}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {groupName && <span>{groupName} &middot; </span>}
                      {relativeTime(dateStr)}
                    </p>
                  </div>
                  <Badge
                    variant="secondary"
                    className={statusColors[item.status] ?? ''}
                  >
                    {item.status}
                  </Badge>
                </div>
              )
            })}
          </div>
        )}
        <div className="mt-4 text-center">
          <Link
            to={viewAllLink}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            View all &rarr;
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
