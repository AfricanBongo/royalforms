import { Link } from '@tanstack/react-router'
import { CircleCheck } from 'lucide-react'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

import type { AssignedFieldGroup } from '../types.ts'

interface AssignedFieldsListProps {
  groups: AssignedFieldGroup[] | undefined
  isLoading: boolean
}

export function AssignedFieldsList({ groups, isLoading }: AssignedFieldsListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Assigned Fields</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="ml-3 h-3 w-24" />
              </div>
            ))}
          </div>
        ) : !groups?.length ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6">
            <CircleCheck className="size-8 text-green-500" />
            <p className="text-sm text-muted-foreground">All caught up!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <div key={group.instance_id}>
                <p className="text-sm font-bold">{group.template_name}</p>
                <div className="mt-1 space-y-1 pl-3">
                  {group.fields.map((field) => (
                    <Link
                      key={field.field_id}
                      to="/instances/$readableId"
                      params={{ readableId: group.readable_id }}
                      search={{ mode: 'edit' }}
                      className="block text-sm text-muted-foreground hover:text-foreground hover:underline"
                    >
                      {field.field_label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
