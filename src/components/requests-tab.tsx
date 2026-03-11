/**
 * RequestsTab — table of member requests with approve/reject actions
 * for Root Admin, plus a "Request Member" button that opens the
 * MemberRequestSheet side sheet.
 */
import { useCallback, useEffect, useState } from 'react'

import { CheckIcon, XIcon } from 'lucide-react'
import { toast } from 'sonner'

import { mapSupabaseError } from '../lib/supabase-errors'
import {
  approveRequest,
  fetchRequests,
  rejectRequest,
} from '../services/member-requests'
import type { MemberRequestRow } from '../services/member-requests'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { ScrollArea, ScrollBar } from './ui/scroll-area'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RequestsTabProps {
  groupId: string
  isRootAdmin: boolean
  reloadKey: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'approved':
      return 'bg-green-50 text-green-700 border-green-200'
    case 'rejected':
    case 'cancelled':
      return 'bg-red-50 text-red-700 border-red-200'
    default:
      return 'bg-amber-50 text-amber-700 border-amber-200'
  }
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RequestsTab({ groupId, isRootAdmin, reloadKey }: RequestsTabProps) {
  const [requests, setRequests] = useState<MemberRequestRow[]>([])
  const [loading, setLoading] = useState(true)

  const loadRequests = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchRequests(groupId)
      setRequests(data)
    } catch (err: unknown) {
      const error = err as { code?: string; message: string }
      const mapped = mapSupabaseError(error.code, error.message, 'database', 'read_record')
      toast.error(mapped.title, { description: mapped.description })
    } finally {
      setLoading(false)
    }
  }, [groupId])

  useEffect(() => {
    void loadRequests()
  }, [loadRequests, reloadKey])

  async function handleApprove(requestId: string) {
    try {
      await approveRequest(requestId)
      toast.success('Member invited', {
        description: 'The request has been approved and an invite email has been sent.',
      })
      void loadRequests()
    } catch (err: unknown) {
      const error = err as { code?: string; message: string }
      const mapped = mapSupabaseError(error.code, error.message, 'database', 'update_record')
      toast.error(mapped.title, { description: mapped.description })
    }
  }

  async function handleReject(requestId: string) {
    try {
      await rejectRequest(requestId)
      toast.success('Request rejected')
      void loadRequests()
    } catch (err: unknown) {
      const error = err as { code?: string; message: string }
      const mapped = mapSupabaseError(error.code, error.message, 'database', 'update_record')
      toast.error(mapped.title, { description: mapped.description })
    }
  }

  // ---- Loading state ----
  if (loading) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Loading requests...</p>
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Table / Empty */}
      {requests.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No member requests yet.</p>
      ) : (
        <ScrollArea className="w-full">
          <div className="rounded-md border">
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-normal">Full Name</TableHead>
                <TableHead className="font-normal">Email</TableHead>
                <TableHead className="font-normal">Proposed Role</TableHead>
                <TableHead className="font-normal">Requested By</TableHead>
                <TableHead className="font-normal">Status</TableHead>
                <TableHead className="text-right font-normal">Created On</TableHead>
                {isRootAdmin && (
                  <TableHead className="text-right font-normal">Actions</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((req) => (
                <TableRow key={req.id}>
                  <TableCell>{req.full_name}</TableCell>
                  <TableCell>{req.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{capitalize(req.proposed_role)}</Badge>
                  </TableCell>
                  <TableCell>{req.requested_by_name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusBadgeClass(req.status)}>
                      {capitalize(req.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{formatDate(req.created_at)}</TableCell>
                  {isRootAdmin && (
                    <TableCell className="text-right">
                      {req.status === 'pending' && (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleApprove(req.id)}
                          >
                            <CheckIcon className="size-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:bg-destructive/10"
                            onClick={() => void handleReject(req.id)}
                          >
                            <XIcon className="size-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
            </Table>
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      )}
    </div>
  )
}
