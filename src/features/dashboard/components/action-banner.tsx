import { Link } from '@tanstack/react-router'

import { Skeleton } from '@/components/ui/skeleton'

import type { ActionItem } from '../types.ts'

interface ActionBannerProps {
  items: ActionItem[] | undefined
  isLoading: boolean
}

const colorStyles = {
  amber: 'border-l-amber-500 bg-amber-50 dark:bg-amber-950/20',
  blue: 'border-l-blue-500 bg-blue-50 dark:bg-blue-950/20',
  red: 'border-l-red-500 bg-red-50 dark:bg-red-950/20',
  purple: 'border-l-purple-500 bg-purple-50 dark:bg-purple-950/20',
} as const

export function ActionBanner({ items, isLoading }: ActionBannerProps) {
  if (isLoading) {
    return (
      <div className="flex gap-3">
        <Skeleton className="h-20 flex-1 rounded-lg" />
        <Skeleton className="h-20 flex-1 rounded-lg" />
      </div>
    )
  }

  if (!items?.length) return null

  return (
    <div className="flex gap-3">
      {items.map((item) => (
        <Link
          key={item.label}
          to={item.linkTo}
          className={`flex-1 rounded-lg border-l-4 p-4 transition-opacity hover:opacity-80 ${colorStyles[item.color]}`}
        >
          <p className="text-2xl font-bold">{item.count}</p>
          <p className="text-sm font-medium">{item.label}</p>
          <p className="text-xs text-muted-foreground">{item.description}</p>
        </Link>
      ))}
    </div>
  )
}
