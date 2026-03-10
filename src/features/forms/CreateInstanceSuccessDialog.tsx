/**
 * CreateInstanceSuccessDialog — centered dialog shown after successful
 * form instance creation.
 *
 * Matches the Figma design:
 * - Green FileCheck2 icon (40px) at top, centered
 * - Title: "Form Instance Created"
 * - Description explaining the link purpose
 * - Read-only link field with "Copy link" button
 * - "Close" primary button centered below
 */
import { FileCheck2 } from 'lucide-react'
import { toast } from 'sonner'

import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

import type { CreatedInstance } from '../../services/form-templates'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CreateInstanceSuccessDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  instances: CreatedInstance[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SHLINK_BASE_URL = import.meta.env.VITE_SHLINK_BASE_URL as string | undefined

/**
 * Build the shareable link for an instance.
 * Prefers the short_url_edit stored in DB (populated by Edge Function).
 * Falls back to constructing the expected Shlink pattern when the async
 * Edge Function hasn't finished yet (which is typical on immediate creation).
 */
function buildShareLink(instance: CreatedInstance | undefined): string {
  if (!instance) return ''
  if (instance.short_url_edit) return instance.short_url_edit
  const base = SHLINK_BASE_URL ?? window.location.origin
  return `${base}/i/${instance.readable_id}-edit`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateInstanceSuccessDialog({
  open,
  onOpenChange,
  instances,
}: CreateInstanceSuccessDialogProps) {
  const firstInstance = instances[0]
  const link = buildShareLink(firstInstance)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(link)
      toast.success('Link copied')
    } catch {
      toast.error('Failed to copy link')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-w-md"
      >
        <div className="flex flex-col items-center gap-6">
          {/* Icon */}
          <div className="flex size-16 items-center justify-center rounded-full bg-green-50">
            <FileCheck2 className="size-10 text-green-600" />
          </div>

          {/* Title */}
          <h2 className="text-center text-xl font-semibold">
            Form Instance Created
          </h2>

          {/* Description */}
          <p className="text-center text-sm text-muted-foreground">
            Here is a link to fill in the instance of the form that you can send
            to other users in groups who you gave access to this instance.
          </p>

          {/* Link field */}
          <div className="flex w-full items-center gap-0 overflow-hidden rounded-lg border">
            <span className="flex-1 truncate px-3 py-2 text-sm text-muted-foreground">
              {link}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 rounded-none border-l bg-muted px-4 hover:bg-muted/80"
              onClick={handleCopy}
            >
              Copy link
            </Button>
          </div>

          {/* Close button */}
          <Button
            className="w-full"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
