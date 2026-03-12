import { useEffect, useState } from 'react'

import { Link, useMatches, useNavigate } from '@tanstack/react-router'
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
import { fetchGroupName } from '../services/profiles'

// ---------------------------------------------------------------------------
// Navigation items
// ---------------------------------------------------------------------------

// Nav items reference routes under /_authenticated.
// Groups is only shown to root_admin (filtered at render time).
const NAV_ITEMS = [
  { label: 'Home', icon: HomeIcon, to: '/', roles: null },
  { label: 'Forms', icon: FileTextIcon, to: '/forms', roles: null },
  { label: 'Reports', icon: PieChartIcon, to: '/reports', roles: null },
  { label: 'Groups', icon: UsersIcon, to: '/groups', roles: ['root_admin'] as const },
] as const

// ---------------------------------------------------------------------------
// AppSidebar
// ---------------------------------------------------------------------------

export function AppSidebar() {
  const { currentUser, signOut } = useAuth()
  const matches = useMatches()
  const navigate = useNavigate()

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
  const avatarUrl = currentUser?.avatarUrl ?? getDefaultAvatarUri(displayName)

  // Fetch user's group name
  const [groupName, setGroupName] = useState<string | null>(null)
  const groupId = currentUser?.groupId ?? null

  useEffect(() => {
    if (!groupId) return
    let cancelled = false
    void fetchGroupName(groupId).then((name) => {
      if (!cancelled) setGroupName(name)
    })
    return () => { cancelled = true }
  }, [groupId])

  const displayGroupName = groupId ? (groupName ?? 'Loading...') : 'No Group'
  const groupInitial = displayGroupName.charAt(0).toUpperCase()

  return (
    <Sidebar>
      {/* Header: group badge (clickable — navigates to group detail) */}
      <SidebarHeader>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-lg border border-border bg-background p-2 text-left hover:bg-accent/50 transition-colors"
          onClick={() => {
            if (groupId) {
              void navigate({ to: '/groups/$groupId', params: { groupId } })
            }
          }}
          disabled={!groupId}
        >
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-foreground">
            {groupInitial}
          </div>
          <span className="flex-1 truncate text-xs">{displayGroupName}</span>
        </button>
      </SidebarHeader>

      {/* Navigation */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarMenu>
            {NAV_ITEMS.filter((item) => {
              // If roles is null, show to everyone. Otherwise check role.
              if (!item.roles) return true
              return currentUser?.role && (item.roles as readonly string[]).includes(currentUser.role)
            }).map((item) => {
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
              <Link to="/settings">
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
