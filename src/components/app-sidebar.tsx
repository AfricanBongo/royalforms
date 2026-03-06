import { Link, useMatches } from '@tanstack/react-router'
import {
  ChevronsUpDownIcon,
  FileTextIcon,
  HomeIcon,
  LogOutIcon,
  PieChartIcon,
  UserIcon,
  UsersIcon,
} from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from './ui/sidebar'
import { useAuth } from '../hooks/use-auth'
import { getDefaultAvatarUri } from '../lib/avatar'

// ---------------------------------------------------------------------------
// Navigation items
// ---------------------------------------------------------------------------

// Nav items reference routes under /_authenticated.
const NAV_ITEMS = [
  { label: 'Home', icon: HomeIcon, to: '/' },
  { label: 'Forms', icon: FileTextIcon, to: '/forms' },
  { label: 'Reports', icon: PieChartIcon, to: '/reports' },
  { label: 'Groups', icon: UsersIcon, to: '/groups' },
] as const

// ---------------------------------------------------------------------------
// AppSidebar
// ---------------------------------------------------------------------------

export function AppSidebar() {
  const { currentUser, signOut } = useAuth()
  const matches = useMatches()

  // Determine the active route for highlighting
  const currentPath = matches[matches.length - 1]?.pathname ?? '/'

  // User display info
  const firstName = currentUser?.firstName ?? ''
  const lastName = currentUser?.lastName ?? ''
  const displayName = [firstName, lastName].filter(Boolean).join(' ') || 'User'
  const initials = [firstName, lastName]
    .map((n) => n.charAt(0).toUpperCase())
    .filter(Boolean)
    .join('')

  // Avatar: use uploaded URL from user_metadata, or DiceBear default
  const avatarUrl = getDefaultAvatarUri(firstName || displayName)

  // Org / group display
  const orgInitial = 'R'
  const orgName = 'RoyalHouse Root'

  return (
    <Sidebar>
      {/* Header: org/group badge */}
      <SidebarHeader>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background p-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-foreground">
            {orgInitial}
          </div>
          <span className="flex-1 truncate text-xs">{orgName}</span>
        </div>
      </SidebarHeader>

      {/* Navigation */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarMenu>
            {NAV_ITEMS.map((item) => {
              const isActive = item.to === '/'
                ? currentPath === '/'
                : currentPath.startsWith(item.to)

              return (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton asChild isActive={isActive}>
                    <Link to={item.to}>
                      <item.icon className="size-4" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer: profile dropdown */}
      <SidebarFooter>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-lg border border-border bg-background px-4 py-2.5 text-left shadow-xs outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Avatar className="size-5">
                <AvatarImage src={avatarUrl} alt={displayName} />
                <AvatarFallback className="text-[10px]">
                  {initials || 'U'}
                </AvatarFallback>
              </Avatar>
              <span className="flex-1 truncate text-xs text-foreground">
                {displayName}
              </span>
              <ChevronsUpDownIcon className="size-4 shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-[--radix-dropdown-menu-trigger-width]">
            <DropdownMenuItem asChild>
              <Link to="/">
                <UserIcon className="size-4" />
                View Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => void signOut()}
              className="text-destructive focus:text-destructive"
            >
              <LogOutIcon className="size-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
