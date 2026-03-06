import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/')({
  component: IndexPage,
})

function IndexPage() {
  return (
    <div className="flex items-center justify-center p-16">
      <h1 className="text-2xl font-bold text-foreground">
        RoyalForms Dashboard
      </h1>
    </div>
  )
}
