import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ context }) => {
    // Still loading auth state -- let it resolve
    if (context.auth.isLoading) return

    // Not authenticated -- redirect to login
    if (!context.auth.session) {
      throw redirect({ to: '/login' })
    }

    // Authenticated but account disabled
    if (context.auth.currentUser && !context.auth.currentUser.isActive) {
      throw redirect({ to: '/login' })
    }
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  return <Outlet />
}
