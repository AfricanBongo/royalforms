import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/forms/')({
  component: FormsPage,
})

function FormsPage() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold text-foreground">Forms</h1>
      <p className="text-sm text-muted-foreground">Coming soon.</p>
    </div>
  )
}
