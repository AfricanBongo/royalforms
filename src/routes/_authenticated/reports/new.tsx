import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/reports/new')({
  component: NewReportTemplatePage,
})

function NewReportTemplatePage() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <p className="text-sm text-muted-foreground">New report template — TODO</p>
    </div>
  )
}
