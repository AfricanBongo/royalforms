import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/setup')({
  component: SetupPage,
})

function SetupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p className="text-muted-foreground">Setup wizard — coming soon</p>
    </div>
  )
}
