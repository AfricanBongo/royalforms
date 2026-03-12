import { useEffect, useState } from 'react'

import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { supabase } from '../../services/supabase'
import { fetchTemplateSchedule } from '../../services/form-templates'
import type { ScheduleData } from '../../services/form-templates'
import {
  isReportTemplateNameTaken,
  saveDraftReportTemplate,
} from '../../services/reports'
import { mapSupabaseError } from '../../lib/supabase-errors'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FormTemplateOption {
  id: string
  name: string
}

interface CreateReportTemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate an abbreviation from a name.
 * Takes the first letter of each word (up to 4) and uppercases them.
 * If single word, takes the first 3 chars uppercased.
 */
function generateAbbreviation(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase()
  return words
    .slice(0, 4)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

/**
 * Format schedule data into a human-readable description.
 */
function formatScheduleDescription(schedule: ScheduleData): string {
  const interval = schedule.repeat_interval
  const days = schedule.days_of_week

  let desc = 'Scheduled '

  if (interval === 'daily') {
    desc += 'daily'
  } else if (interval === 'weekly') {
    desc += 'weekly'
  } else if (interval === 'bi_weekly') {
    desc += 'bi-weekly'
  } else if (interval === 'monthly') {
    desc += 'monthly'
  } else {
    desc += interval
  }

  if (days && days.length > 0) {
    const formatted = days
      .map((d) => d.charAt(0).toUpperCase() + d.slice(1) + 's')
      .join(', ')
    desc += ` on ${formatted}`
  }

  return desc
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateReportTemplateDialog({
  open,
  onOpenChange,
}: CreateReportTemplateDialogProps) {
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [formTemplateId, setFormTemplateId] = useState('')
  const [formTemplates, setFormTemplates] = useState<FormTemplateOption[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [schedule, setSchedule] = useState<ScheduleData | null>(null)
  const [loadingSchedule, setLoadingSchedule] = useState(false)
  const [creating, setCreating] = useState(false)

  // Fetch published form templates when dialog opens
  useEffect(() => {
    if (!open) return

    async function loadFormTemplates() {
      setLoadingTemplates(true)
      try {
        const { data, error } = await supabase
          .from('form_templates')
          .select('id, name')
          .eq('status', 'published')
          .eq('is_active', true)
          .order('name')

        if (error) throw error
        setFormTemplates(data ?? [])
      } catch (err: unknown) {
        const error = err as { code?: string; message: string }
        const mapped = mapSupabaseError(
          error.code,
          error.message,
          'database',
          'read_record',
        )
        toast.error(mapped.title, { description: mapped.description })
      } finally {
        setLoadingTemplates(false)
      }
    }

    void loadFormTemplates()
  }, [open])

  // Fetch schedule when a form template is selected
  useEffect(() => {
    if (!formTemplateId) {
      setSchedule(null)
      return
    }

    async function loadSchedule() {
      setLoadingSchedule(true)
      try {
        const data = await fetchTemplateSchedule(formTemplateId)
        setSchedule(data)
      } catch {
        // Non-critical — silently ignore schedule fetch errors
        setSchedule(null)
      } finally {
        setLoadingSchedule(false)
      }
    }

    void loadSchedule()
  }, [formTemplateId])

  function handleClose(isOpen: boolean) {
    if (!isOpen) {
      setName('')
      setNameError(null)
      setFormTemplateId('')
      setSchedule(null)
    }
    onOpenChange(isOpen)
  }

  async function handleCreate() {
    const trimmed = name.trim()
    if (!trimmed) {
      setNameError('Name is required.')
      return
    }
    if (!formTemplateId) {
      setNameError(null)
      toast.error('Please select a form template.')
      return
    }

    setNameError(null)
    setCreating(true)

    try {
      const taken = await isReportTemplateNameTaken(trimmed)
      if (taken) {
        setNameError('A report template with this name already exists.')
        setCreating(false)
        return
      }

      const abbreviation = generateAbbreviation(trimmed)

      const templateId = await saveDraftReportTemplate({
        name: trimmed,
        abbreviation,
        form_template_id: formTemplateId,
      })

      handleClose(false)
      void navigate({
        to: '/reports/$templateId/edit',
        params: { templateId },
      })
    } catch (err: unknown) {
      const error = err as { code?: string; message: string }
      const mapped = mapSupabaseError(
        error.code,
        error.message,
        'database',
        'create_record',
      )
      toast.error(mapped.title, { description: mapped.description })
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>New Report Template</DialogTitle>
          <DialogDescription>
            Enter a name and select a form template to link.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {/* Name input */}
          <div className="grid gap-2">
            <Label htmlFor="report-name">Name</Label>
            <Input
              id="report-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (nameError) setNameError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !creating) {
                  void handleCreate()
                }
              }}
              placeholder="e.g. Monthly Revenue Report"
              autoFocus
            />
            {nameError && (
              <p className="text-sm text-destructive">{nameError}</p>
            )}
          </div>

          {/* Linked form template select */}
          <div className="grid gap-2">
            <Label htmlFor="linked-form">Linked Form</Label>
            <Select
              value={formTemplateId}
              onValueChange={setFormTemplateId}
              disabled={loadingTemplates}
            >
              <SelectTrigger id="linked-form">
                <SelectValue
                  placeholder={
                    loadingTemplates
                      ? 'Loading forms...'
                      : 'Select a form template'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {formTemplates.map((ft) => (
                  <SelectItem key={ft.id} value={ft.id}>
                    {ft.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Schedule info */}
            {formTemplateId && !loadingSchedule && (
              <p className="text-sm text-muted-foreground">
                {schedule
                  ? `${formatScheduleDescription(schedule)}. Reports will auto-generate after each round is fully submitted.`
                  : 'No schedule configured — reports can only be generated manually.'}
              </p>
            )}
            {formTemplateId && loadingSchedule && (
              <p className="text-sm text-muted-foreground">
                Loading schedule...
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={creating}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void handleCreate()}
            disabled={creating || !name.trim() || !formTemplateId}
          >
            {creating ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
