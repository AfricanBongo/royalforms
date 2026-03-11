import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute(
  '/_authenticated/reports/$templateId/instances/$readableId',
)({
  component: ReportInstanceViewerPage,
})

function ReportInstanceViewerPage() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <p className="text-sm text-muted-foreground">Report instance viewer — TODO</p>
    </div>
  )
}
