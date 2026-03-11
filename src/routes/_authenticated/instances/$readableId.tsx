/**
 * /instances/$readableId — Form instance page.
 *
 * Long URL accessed after Shlink redirect:
 *   /instances/{readable_id}?mode=view  (read-only)
 *   /instances/{readable_id}?mode=edit  (fill-in)
 *
 * Short URL pattern (Shlink): /i/{readable_id}-view or /i/{readable_id}-edit
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, Loader2Icon, SendIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'

import { FieldAssignmentPopover } from '../../../features/instances/FieldAssignmentPopover'
import { FieldChangeLogPopover } from '../../../features/instances/FieldChangeLogPopover'
import { InstanceFieldInput } from '../../../features/instances/InstanceFieldInput'
import { SectionStepper } from '../../../features/instances/SectionStepper'
import { useCurrentUser } from '../../../hooks/use-current-user'
import { usePageTitle } from '../../../hooks/use-page-title'
import { mapSupabaseError } from '../../../lib/supabase-errors'
import { supabase } from '../../../services/supabase'

import {
  assignField,
  fetchFieldValues,
  fetchGroupMembers,
  fetchInstanceByReadableId,
  submitInstance,
  upsertFieldValue,
} from '../../../services/form-templates'
import type {
  ChangeLogEntry,
  FieldValue,
  GroupMember,
  InstancePageData,
} from '../../../services/form-templates'

// ---------------------------------------------------------------------------
// Search params validation
// ---------------------------------------------------------------------------

interface InstanceSearchParams {
  mode?: 'view' | 'edit'
}

export const Route = createFileRoute('/_authenticated/instances/$readableId')({
  component: InstancePage,
  validateSearch: (search: Record<string, unknown>): InstanceSearchParams => {
    const mode = search.mode
    if (mode === 'view' || mode === 'edit') return { mode }
    return {}
  },
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function InstancePage() {
  const { readableId } = Route.useParams()
  const { mode } = Route.useSearch()
  const navigate = useNavigate()
  const currentUser = useCurrentUser()
  const { setBreadcrumbs } = usePageTitle()

  // Core data
  const [data, setData] = useState<InstancePageData | null>(null)
  const [fieldValues, setFieldValues] = useState<Map<string, FieldValue>>(new Map())
  const [members, setMembers] = useState<GroupMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Wizard state
  const [currentSection, setCurrentSection] = useState(0)

  // Local edits & save tracking
  const [localValues, setLocalValues] = useState<Map<string, string | null>>(new Map())
  const [savingFields, setSavingFields] = useState<Set<string>>(new Set())
  const [savedFields, setSavedFields] = useState<Set<string>>(new Set())
  const savedTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Submit state
  const [submitting, setSubmitting] = useState(false)

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const pageData = await fetchInstanceByReadableId(readableId)
      setData(pageData)
      setBreadcrumbs([
        { label: 'Forms', path: '/forms' },
        { label: pageData.template.name, path: `/forms/${pageData.template.id}` },
        { label: pageData.instance.readable_id, path: `/instances/${readableId}` },
      ])

      const [values, groupMembers] = await Promise.all([
        fetchFieldValues(pageData.instance.id),
        fetchGroupMembers(pageData.instance.group_id),
      ])

      const valMap = new Map<string, FieldValue>()
      for (const v of values) {
        valMap.set(v.template_field_id, v)
      }
      setFieldValues(valMap)
      setMembers(groupMembers)
    } catch (err: unknown) {
      const e = err as { code?: string; message: string }
      const mapped = mapSupabaseError(e.code, e.message, 'database', 'read_record')
      setError(mapped.title)
      toast.error(mapped.title, { description: mapped.description })
    } finally {
      setLoading(false)
    }
  }, [readableId, setBreadcrumbs])

  useEffect(() => {
    void loadData()
    return () => {
      setBreadcrumbs([])
      // Cleanup saved timers
      for (const timer of savedTimers.current.values()) {
        clearTimeout(timer)
      }
    }
  }, [loadData, setBreadcrumbs])

  // -------------------------------------------------------------------------
  // Access control redirects
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!data || !currentUser) return

    // Viewers cannot be in edit mode
    if (currentUser.role === 'viewer' && mode === 'edit') {
      void navigate({
        to: '/instances/$readableId',
        params: { readableId },
        search: { mode: 'view' },
        replace: true,
      })
    }
  }, [data, currentUser, mode, navigate, readableId])

  // -------------------------------------------------------------------------
  // Real-time subscription for field values and instance status
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!data || !currentUser) return

    const channel = supabase
      .channel(`instance-${data.instance.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'field_values',
          filter: `form_instance_id=eq.${data.instance.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const row = payload.new as {
              id: string
              template_field_id: string
              value: string | null
              assigned_to: string | null
              assigned_by: string | null
              change_log: unknown
              updated_by: string
              updated_at: string
            }

            // Skip if this change was made by the current user
            // (they already have it in local state)
            if (row.updated_by === currentUser.id) return

            const fieldValue: FieldValue = {
              id: row.id,
              template_field_id: row.template_field_id,
              value: row.value,
              assigned_to: row.assigned_to,
              assigned_by: row.assigned_by,
              change_log: (row.change_log ?? []) as unknown as ChangeLogEntry[],
              updated_by: row.updated_by,
              updated_at: row.updated_at,
            }

            setFieldValues((prev) => {
              const next = new Map(prev)
              next.set(fieldValue.template_field_id, fieldValue)
              return next
            })

            // Clear any local value for that field
            // (another user's change takes precedence)
            setLocalValues((prev) => {
              if (!prev.has(fieldValue.template_field_id)) return prev
              const next = new Map(prev)
              next.delete(fieldValue.template_field_id)
              return next
            })
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'form_instances',
          filter: `id=eq.${data.instance.id}`,
        },
        (payload) => {
          const row = payload.new as {
            status: string
            submitted_by: string | null
            submitted_at: string | null
          }
          if (row.status === 'submitted') {
            setData((prev) =>
              prev
                ? {
                    ...prev,
                    instance: {
                      ...prev.instance,
                      status: 'submitted' as const,
                      submitted_by: row.submitted_by,
                      submitted_at: row.submitted_at,
                    },
                  }
                : prev,
            )
            toast.info('This form has been submitted')
          }
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-subscribe when instance or user changes, not on every state update
  }, [data?.instance.id, currentUser?.id])

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  const effectiveMode = mode ?? 'view'
  const isViewMode = effectiveMode === 'view'
  const isSubmitted = data?.instance.status === 'submitted'

  // Check group access (non-root_admin must belong to the instance's group)
  const hasGroupAccess = currentUser
    ? currentUser.role === 'root_admin' || currentUser.groupId === data?.instance.group_id
    : false

  // Viewer trying to see a pending instance
  const viewerPendingBlocked =
    currentUser?.role === 'viewer' && data?.instance.status === 'pending'

  const sections = data?.sections ?? []
  const currentSectionData = sections[currentSection] ?? null

  // -------------------------------------------------------------------------
  // Section completion
  // -------------------------------------------------------------------------

  function isSectionComplete(sectionIndex: number): boolean {
    const section = sections[sectionIndex]
    if (!section) return false

    return section.fields
      .filter((f) => f.is_required)
      .every((f) => {
        const local = localValues.get(f.id)
        const db = fieldValues.get(f.id)?.value ?? null
        const val = local ?? db
        return val !== null && val.trim() !== ''
      })
  }

  // -------------------------------------------------------------------------
  // Field helpers
  // -------------------------------------------------------------------------

  function getDisplayValue(fieldId: string): string | null {
    if (localValues.has(fieldId)) return localValues.get(fieldId) ?? null
    return fieldValues.get(fieldId)?.value ?? null
  }

  function isFieldDisabled(fieldId: string): boolean {
    if (isViewMode) return true
    if (isSubmitted) return true

    const fv = fieldValues.get(fieldId)
    if (!fv?.assigned_to) return false
    if (!currentUser) return true

    // Assigned to someone else — Admin/Root Admin can still edit
    if (fv.assigned_to !== currentUser.id) {
      return currentUser.role !== 'root_admin' && currentUser.role !== 'admin'
    }
    return false
  }

  // Can the current user assign fields?
  const canAssign =
    currentUser?.role === 'root_admin' || currentUser?.role === 'admin'

  // Can the current user submit?
  const canSubmit =
    !isViewMode &&
    !isSubmitted &&
    (currentUser?.role === 'root_admin' || currentUser?.role === 'admin')

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  function handleFieldChange(fieldId: string, value: string | null) {
    setLocalValues((prev) => {
      const next = new Map(prev)
      next.set(fieldId, value)
      return next
    })
  }

  async function handleFieldBlur(fieldId: string, valueOverride?: string | null) {
    if (!data) return

    // Use override if provided (instant fields like rating, checkbox, select)
    // Otherwise read from localValues (text/textarea fields that blur separately)
    const hasOverride = valueOverride !== undefined
    const localVal = hasOverride ? valueOverride : localValues.get(fieldId)
    if (!hasOverride && localVal === undefined) return

    // After the guard above, localVal is guaranteed to be string | null
    const saveValue = localVal as string | null

    const dbVal = fieldValues.get(fieldId)?.value ?? null
    if (saveValue === dbVal) return

    setSavingFields((prev) => new Set(prev).add(fieldId))

    try {
      const result = await upsertFieldValue(
        data.instance.id,
        fieldId,
        saveValue,
        dbVal,
      )

      // Update field values map
      setFieldValues((prev) => {
        const next = new Map(prev)
        next.set(result.template_field_id, result)
        return next
      })

      // Clear local value since it's now saved
      setLocalValues((prev) => {
        const next = new Map(prev)
        next.delete(fieldId)
        return next
      })

      // Show saved indicator
      setSavedFields((prev) => new Set(prev).add(fieldId))

      // Clear existing timer for this field
      const existingTimer = savedTimers.current.get(fieldId)
      if (existingTimer) clearTimeout(existingTimer)

      // Remove indicator after 2 seconds
      const timer = setTimeout(() => {
        setSavedFields((prev) => {
          const next = new Set(prev)
          next.delete(fieldId)
          return next
        })
        savedTimers.current.delete(fieldId)
      }, 2000)
      savedTimers.current.set(fieldId, timer)
    } catch (err: unknown) {
      const e = err as { code?: string; message: string }
      const mapped = mapSupabaseError(e.code, e.message, 'database', 'update_record')
      toast.error(mapped.title, { description: mapped.description })
    } finally {
      setSavingFields((prev) => {
        const next = new Set(prev)
        next.delete(fieldId)
        return next
      })
    }
  }

  async function handleAssign(fieldId: string, memberId: string | null) {
    if (!data) return
    try {
      await assignField(data.instance.id, fieldId, memberId)

      // Update field values map locally
      setFieldValues((prev) => {
        const next = new Map(prev)
        const existing = next.get(fieldId)
        if (existing) {
          next.set(fieldId, {
            ...existing,
            assigned_to: memberId,
            assigned_by: memberId ? (currentUser?.id ?? '') : null,
          })
        } else {
          // assignField may create a new field_values row
          next.set(fieldId, {
            id: '',
            template_field_id: fieldId,
            value: null,
            assigned_to: memberId,
            assigned_by: memberId ? (currentUser?.id ?? '') : null,
            change_log: [],
            updated_by: currentUser?.id ?? '',
            updated_at: new Date().toISOString(),
          })
        }
        return next
      })

      toast.success(memberId ? 'Field assigned' : 'Field unassigned')
    } catch (err: unknown) {
      const e = err as { code?: string; message: string }
      const mapped = mapSupabaseError(e.code, e.message, 'database', 'update_record')
      toast.error(mapped.title, { description: mapped.description })
    }
  }

  async function handleSubmit() {
    if (!data || submitting) return

    // Validate all required fields across ALL sections
    let missingCount = 0
    let firstIncompleteSection = -1

    for (let si = 0; si < sections.length; si++) {
      for (const field of sections[si].fields) {
        if (!field.is_required) continue
        const val = getDisplayValue(field.id)
        if (val === null || val.trim() === '') {
          missingCount++
          if (firstIncompleteSection === -1) firstIncompleteSection = si
        }
      }
    }

    if (missingCount > 0) {
      toast.error('Cannot submit', {
        description: `${missingCount} required field${missingCount === 1 ? '' : 's'} ${missingCount === 1 ? 'is' : 'are'} missing. Please complete all required fields.`,
      })
      if (firstIncompleteSection >= 0) {
        setCurrentSection(firstIncompleteSection)
      }
      return
    }

    setSubmitting(true)
    try {
      await submitInstance(data.instance.id)
      toast.success('Form submitted successfully')
      // Reload data to reflect new status
      await loadData()
    } catch (err: unknown) {
      const e = err as { code?: string; message: string }
      const mapped = mapSupabaseError(e.code, e.message, 'database', 'update_record')
      toast.error(mapped.title, { description: mapped.description })
    } finally {
      setSubmitting(false)
    }
  }

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-28" />
          </div>
          <Skeleton className="h-9 w-24" />
        </div>
        <Separator />
        {/* Stepper skeleton */}
        <div className="flex items-center gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="size-9 rounded-full" />
          ))}
        </div>
        <Separator />
        {/* Fields skeleton */}
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------

  if (error || !data) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
        <p className="text-sm text-muted-foreground">
          {error ?? 'Failed to load form instance'}
        </p>
        <Button variant="outline" onClick={() => void loadData()}>
          Retry
        </Button>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Access denied
  // -------------------------------------------------------------------------

  if (!hasGroupAccess) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
        <p className="text-sm text-destructive font-medium">
          You don&apos;t have access to this form instance
        </p>
        <p className="text-sm text-muted-foreground">
          This instance belongs to a different group.
        </p>
      </div>
    )
  }

  if (viewerPendingBlocked) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
        <p className="text-sm text-muted-foreground">
          This form is not available yet
        </p>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const { instance, template } = data

  return (
    <div className="flex flex-1 flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6 pb-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <span className="font-mono font-medium text-foreground">
            {instance.readable_id}
          </span>
          <span>&middot;</span>
          <span>{formatDate(instance.created_at)}</span>
          <span>&middot;</span>
          <span>{instance.group_name}</span>
          <span>&middot;</span>
          <span>v{template.version_number}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={isSubmitted ? 'default' : 'secondary'}>
            {isSubmitted ? 'Submitted' : 'Pending'}
          </Badge>
          {canSubmit && (
            <Button
              size="sm"
              disabled={submitting}
              onClick={() => void handleSubmit()}
            >
              {submitting ? (
                <Loader2Icon className="mr-1.5 size-4 animate-spin" />
              ) : (
                <SendIcon className="mr-1.5 size-4" />
              )}
              Submit
            </Button>
          )}
        </div>
      </div>

      <Separator />

      {/* Section stepper */}
      {sections.length > 1 && (
        <>
          <div className="px-6">
            <SectionStepper
              sections={sections.map((s, i) => ({
                title: s.title,
                isComplete: isSectionComplete(i),
              }))}
              currentIndex={currentSection}
              onStepClick={setCurrentSection}
            />
          </div>
          <Separator />
        </>
      )}

      {/* Section content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {currentSectionData && (
          <div className="mx-auto max-w-2xl space-y-6">
            {/* Section header */}
            <div>
              <h2 className="text-lg font-semibold">{currentSectionData.title}</h2>
              {currentSectionData.description && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {currentSectionData.description}
                </p>
              )}
            </div>

            {/* Fields */}
            {currentSectionData.fields.map((field) => {
              const fv = fieldValues.get(field.id)
              const isSaving = savingFields.has(field.id)
              const isSaved = savedFields.has(field.id)
              const disabled = isFieldDisabled(field.id)

              return (
                <div key={field.id} className="space-y-2">
                  {/* Field label row */}
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium leading-none">
                      {field.label}
                      {field.is_required && (
                        <span className="ml-0.5 text-destructive">*</span>
                      )}
                    </label>
                    <div className="flex-1" />
                    {/* Assignment popover (admin only, edit mode, not submitted) */}
                    {canAssign && !isViewMode && !isSubmitted && (
                      <FieldAssignmentPopover
                        fieldId={field.id}
                        instanceId={instance.id}
                        assignedTo={fv?.assigned_to ?? null}
                        members={members}
                        onAssigned={(memberId) =>
                          void handleAssign(field.id, memberId)
                        }
                        disabled={false}
                      />
                    )}
                    {/* Change log popover */}
                    {(fv?.change_log?.length ?? 0) > 0 && (
                      <FieldChangeLogPopover
                        changeLog={fv?.change_log ?? []}
                        members={members}
                      />
                    )}
                  </div>

                  {/* Field description */}
                  {field.description && (
                    <p className="text-xs text-muted-foreground">
                      {field.description}
                    </p>
                  )}

                  {/* Input */}
                  <InstanceFieldInput
                    field={field}
                    value={getDisplayValue(field.id)}
                    disabled={disabled}
                    instanceId={instance.id}
                    onChange={(val) => handleFieldChange(field.id, val)}
                    onBlur={(valueOverride) => void handleFieldBlur(field.id, valueOverride)}
                  />

                  {/* Save indicator */}
                  {isSaving && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Loader2Icon className="size-3 animate-spin" />
                      Saving...
                    </p>
                  )}
                  {isSaved && !isSaving && (
                    <p className="flex items-center gap-1 text-xs text-green-600">
                      <CheckIcon className="size-3" />
                      Saved
                    </p>
                  )}
                </div>
              )
            })}

            {currentSectionData.fields.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No fields in this section.
              </p>
            )}
          </div>
        )}

        {!currentSectionData && (
          <p className="text-sm text-muted-foreground">
            This form has no sections.
          </p>
        )}
      </div>

      {/* Footer navigation */}
      {sections.length > 1 && (
        <>
          <Separator />
          <div className="flex items-center justify-between px-6 py-4">
            <Button
              variant="outline"
              size="sm"
              disabled={currentSection === 0}
              onClick={() => setCurrentSection((prev) => prev - 1)}
            >
              <ChevronLeftIcon className="mr-1 size-4" />
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              {currentSection + 1} / {sections.length}
            </span>
            {currentSection < sections.length - 1 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentSection((prev) => prev + 1)}
              >
                Next
                <ChevronRightIcon className="ml-1 size-4" />
              </Button>
            ) : canSubmit ? (
              <Button
                size="sm"
                disabled={submitting}
                onClick={() => void handleSubmit()}
              >
                {submitting ? (
                  <Loader2Icon className="mr-1.5 size-4 animate-spin" />
                ) : (
                  <SendIcon className="mr-1.5 size-4" />
                )}
                Submit
              </Button>
            ) : (
              <div className="w-20" />
            )}
          </div>
        </>
      )}
    </div>
  )
}
