/**
 * ScheduleInstanceSuccessDialog — centered dialog shown after successfully
 * creating or editing an instance schedule.
 *
 * Matches the Figma design:
 * - Green FileClock icon (40px) at top, centered
 * - Title: "Form Instance Scheduled"
 * - Description explaining the schedule outcome
 * - "Close" primary button centered below
 */
import { FileClock } from 'lucide-react'

import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ScheduleInstanceSuccessDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScheduleInstanceSuccessDialog({
  open,
  onOpenChange,
}: ScheduleInstanceSuccessDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-w-md"
      >
        <div className="flex flex-col items-center gap-6">
          {/* Icon */}
          <div className="flex size-16 items-center justify-center rounded-full bg-green-50">
            <FileClock className="size-10 text-green-600" />
          </div>

          {/* Title */}
          <h2 className="text-center text-xl font-semibold">
            Form Instance Scheduled
          </h2>

          {/* Description */}
          <p className="text-center text-sm text-muted-foreground">
            Your form instance has been scheduled for creation and a link will be
            sent to groups you gave access to.
          </p>

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
