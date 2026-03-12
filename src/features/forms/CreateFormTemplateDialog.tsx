import { useState } from 'react'

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
import { isFormTemplateNameTaken, saveDraft } from '../../services/form-templates'
import { mapSupabaseError } from '../../lib/supabase-errors'

interface CreateFormTemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateFormTemplateDialog({ open, onOpenChange }: CreateFormTemplateDialogProps) {
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  function handleClose(isOpen: boolean) {
    if (!isOpen) {
      setName('')
      setNameError(null)
    }
    onOpenChange(isOpen)
  }

  async function handleCreate() {
    const trimmed = name.trim()
    if (!trimmed) {
      setNameError('Name is required.')
      return
    }

    setNameError(null)
    setCreating(true)

    try {
      const taken = await isFormTemplateNameTaken(trimmed)
      if (taken) {
        setNameError('A form template with this name already exists.')
        setCreating(false)
        return
      }

      const templateId = await saveDraft({
        name: trimmed,
        description: null,
        sections: [],
      })

      handleClose(false)
      void navigate({
        to: '/forms/$templateId/edit',
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
          <DialogTitle>New Form Template</DialogTitle>
          <DialogDescription>
            Enter a name for your new form template.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 py-4">
          <Label htmlFor="template-name">Name</Label>
          <Input
            id="template-name"
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
            placeholder="e.g. Monthly Safety Inspection"
            autoFocus
          />
          {nameError && (
            <p className="text-sm text-destructive">{nameError}</p>
          )}
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
            disabled={creating || !name.trim()}
          >
            {creating ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
