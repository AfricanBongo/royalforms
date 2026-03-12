# Dashboard Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the existing basic dashboard with a colorful, chart-driven, role-adaptive dashboard featuring time-series trends, action banners, stat cards with deltas, and recent instance lists.

**Architecture:** Full rewrite of `src/routes/_authenticated/index.tsx`, `src/features/dashboard/widgets.tsx`, and `src/services/dashboard.ts`. New shared widget components in `src/features/dashboard/`. Shadcn Chart (Recharts) for all charts. Single `useDashboardData` hook for parallel data fetching with per-widget loading states. Global time range toggle (7d/30d/90d) in greeting header.

**Tech Stack:** React 19, TypeScript, Shadcn UI (Card, Badge, Avatar, Skeleton, Chart), Recharts (via Shadcn Chart), TailwindCSS, Supabase Client SDK with RLS.

**Design doc:** `docs/plans/2026-03-12-dashboard-redesign-design.md`

---

### Task 1: Install Shadcn Chart Component

**Files:**
- Modify: `src/components/ui/chart.tsx` (created by Shadcn CLI)
- Modify: `package.json` (recharts dependency added)

**Step 1: Install the Shadcn chart component**

Run: `npx shadcn@latest add chart`

**Step 2: Verify installation**

Run: `ls src/components/ui/chart.tsx && cat package.json | grep recharts`
Expected: File exists and recharts is in dependencies.

**Step 3: Commit**

```bash
git add -A && git commit -m "chore(deps): add shadcn chart component with recharts"
```

---

### Task 2: Define Dashboard Types and Time Range

**Files:**
- Create: `src/features/dashboard/types.ts`

**Step 1: Create the types file**

```typescript
import type { UserRole } from '../../types/auth'

// Time range options for trend charts
export const TIME_RANGES = {
  '7d': { label: '7 days', days: 7 },
  '30d': { label: '30 days', days: 30 },
  '90d': { label: '90 days', days: 90 },
} as const

export type TimeRange = keyof typeof TIME_RANGES

// Stat card data
export interface StatCardData {
  label: string
  value: number
  delta: string
  iconColor: 'chart-1' | 'chart-2' | 'chart-3' | 'chart-4' | 'chart-5'
  icon: string // lucide icon name
}

// Trend data point (for area/bar charts)
export interface TrendDataPoint {
  date: string // ISO date string (YYYY-MM-DD)
  count: number
}

// Group breakdown data point (for horizontal bar chart)
export interface GroupBreakdownPoint {
  group_id: string
  group_name: string
  count: number
}

// Action item card
export interface ActionItem {
  label: string
  description: string
  count: number
  color: 'amber' | 'blue' | 'red' | 'purple'
  linkTo: string
}

// Recent form instance row
export interface RecentFormInstance {
  id: string
  readable_id: string
  template_name: string
  group_name: string | null
  status: 'pending' | 'submitted'
  updated_at: string
}

// Recent report instance row
export interface RecentReportInstance {
  id: string
  readable_id: string
  template_name: string
  status: string
  created_at: string
}

// Group member row (compact)
export interface GroupMemberCompact {
  id: string
  full_name: string
  role: string
  avatar_url: string | null
}

// Assigned field (grouped by instance)
export interface AssignedFieldGroup {
  instance_id: string
  readable_id: string
  template_name: string
  fields: { field_id: string; field_label: string }[]
}

// Per-role dashboard data shapes
export interface RootAdminDashboardData {
  stats: StatCardData[]
  submissionTrend: TrendDataPoint[]
  groupBreakdown: GroupBreakdownPoint[]
  recentFormInstances: RecentFormInstance[]
  recentReportInstances: RecentReportInstance[]
  actionItems: ActionItem[]
}

export interface AdminDashboardData {
  stats: StatCardData[]
  submissionTrend: TrendDataPoint[]
  members: GroupMemberCompact[]
  totalMembers: number
  recentFormInstances: RecentFormInstance[]
  recentReportInstances: RecentReportInstance[]
  actionItems: ActionItem[]
}

export interface EditorDashboardData {
  stats: StatCardData[]
  activityTrend: TrendDataPoint[]
  assignedFields: AssignedFieldGroup[]
  recentFormInstances: RecentFormInstance[]
  recentReportInstances: RecentReportInstance[]
  actionItems: ActionItem[]
}

export interface ViewerDashboardData {
  stats: StatCardData[]
  submissionTrend: TrendDataPoint[]
  recentFormInstances: RecentFormInstance[]
  recentReportInstances: RecentReportInstance[]
  actionItems: ActionItem[]
}
```

**Step 2: Verify the file compiles**

Run: `npx tsc -b --noEmit`
Expected: No errors related to this file.

**Step 3: Commit**

```bash
git add src/features/dashboard/types.ts && git commit -m "feat(dashboard): add dashboard types and time range definitions"
```

---

### Task 3: Rewrite Dashboard Service Layer

**Files:**
- Modify: `src/services/dashboard.ts` (full rewrite)

Rewrite the service to support:
- Time-range-aware queries (pass `days` parameter, compute `since` date)
- Trend data aggregation (group by date, return `TrendDataPoint[]`)
- Group breakdown query
- Recent form instances (10, ordered by `updated_at`)
- Recent report instances (10, ordered by `created_at`)
- Stat deltas (current total + count within time range)
- Action item counts

Key new functions:

```typescript
// Time-range-aware functions
fetchSubmissionTrend(days: number, groupId?: string): Promise<TrendDataPoint[]>
fetchEditorActivityTrend(userId: string, days: number): Promise<TrendDataPoint[]>
fetchGroupBreakdown(days: number): Promise<GroupBreakdownPoint[]>

// Stat card functions with deltas
fetchRootAdminStats(days: number): Promise<StatCardData[]>
fetchAdminStats(groupId: string, days: number): Promise<StatCardData[]>
fetchEditorStats(userId: string, groupId: string, days: number): Promise<StatCardData[]>
fetchViewerStats(groupId: string, days: number): Promise<StatCardData[]>

// Action item functions
fetchRootAdminActionItems(): Promise<ActionItem[]>
fetchAdminActionItems(groupId: string): Promise<ActionItem[]>
fetchEditorActionItems(userId: string): Promise<ActionItem[]>
fetchViewerActionItems(groupId: string): Promise<ActionItem[]>

// Recent lists
fetchRecentFormInstances(limit: number, groupId?: string): Promise<RecentFormInstance[]>
fetchRecentReportInstances(limit: number, groupId?: string): Promise<RecentReportInstance[]>

// Retained from old service (still needed)
fetchGroupMembersList(groupId: string): Promise<GroupMemberCompact[]>
fetchAssignedFieldsGrouped(userId: string): Promise<AssignedFieldGroup[]>
```

For trend data, the approach is:
1. Query `form_instances` where `submitted_at >= since_date`
2. In JavaScript, bucket into days and fill gaps with zero-count days
3. Return sorted `TrendDataPoint[]`

This avoids needing a Postgres `generate_series` function or custom SQL.

**Step 1: Rewrite the service file**

Implement all the functions above. Keep the Supabase client SDK pattern. Each function is standalone, no shared state.

**Step 2: Verify compilation**

Run: `npx tsc -b --noEmit`

**Step 3: Commit**

```bash
git add src/services/dashboard.ts && git commit -m "feat(dashboard): rewrite service layer with time-range-aware queries and trend data"
```

---

### Task 4: Create the `useDashboardData` Hook

**Files:**
- Create: `src/features/dashboard/use-dashboard-data.ts`

A single hook that:
- Takes `role`, `groupId`, `userId`, `timeRange` as parameters
- Calls the appropriate service functions in parallel via `Promise.allSettled`
- Returns per-section loading/data/error states
- Re-fetches when `timeRange` changes
- Uses `useEffect` + `useState` (consistent with existing patterns)

```typescript
export interface DashboardDataState<T> {
  data: T | undefined
  isLoading: boolean
  error: string | null
}

// Returns shape varies by role, but each section is independently loaded
export function useDashboardData(
  role: UserRole,
  timeRange: TimeRange,
  groupId?: string,
  userId?: string,
)
```

Each section (stats, trend, breakdown, recentForms, recentReports, actionItems, members, assignedFields) gets its own `DashboardDataState` so one failure doesn't cascade.

**Step 1: Implement the hook**

**Step 2: Verify compilation**

Run: `npx tsc -b --noEmit`

**Step 3: Commit**

```bash
git add src/features/dashboard/use-dashboard-data.ts && git commit -m "feat(dashboard): add useDashboardData hook with parallel fetching"
```

---

### Task 5: Build Shared Widget Components

**Files:**
- Create: `src/features/dashboard/components/dashboard-greeting.tsx`
- Create: `src/features/dashboard/components/action-banner.tsx`
- Create: `src/features/dashboard/components/stat-card.tsx`
- Create: `src/features/dashboard/components/submission-trend-chart.tsx`
- Create: `src/features/dashboard/components/group-breakdown-chart.tsx`
- Create: `src/features/dashboard/components/recent-instance-list.tsx`
- Create: `src/features/dashboard/components/group-members-list.tsx`
- Create: `src/features/dashboard/components/assigned-fields-list.tsx`

Each component is self-contained, receives data + loading state as props, and shows a skeleton when loading.

#### 5a: DashboardGreeting

- Time-aware greeting using `new Date().getHours()`
- Displays user's first name
- Summary line: "You have N items needing your attention" (count from action items)
- Time range toggle: `ToggleGroup` with "7d", "30d", "90d" buttons (right-aligned)
- No card wrapper — just a `div` with padding

#### 5b: ActionBanner

- Horizontal flex row of action cards
- Each card: colored left border (4px), tinted background (`bg-amber-50`, `bg-blue-50`, `bg-red-50`, `bg-purple-50`), bold count, label, description
- Entire card is clickable (wraps in `Link`)
- If `actionItems.length === 0`, render nothing (return `null`)

#### 5c: StatCard (new version)

- Card with: colored icon (Lucide icon in a tinted circle), big number (`text-3xl font-bold`), label, delta text in muted foreground
- Uses `className` to apply icon background tint based on `iconColor` prop
- Skeleton: icon circle + number line + label line

#### 5d: SubmissionTrendChart

- Shadcn `ChartContainer` + Recharts `AreaChart` (or `BarChart` if `variant="bar"` prop is passed)
- Gradient fill using the provided chart color
- Responsive, fills container width
- X-axis with formatted dates (short format)
- Y-axis with integer ticks
- Tooltip using Shadcn `ChartTooltipContent`
- Skeleton: grey rounded rectangle at chart height

#### 5e: GroupBreakdownChart

- Shadcn `ChartContainer` + Recharts `BarChart` (horizontal)
- Each bar a different color from `chart-1` through `chart-5` (cycle if >5 groups)
- Y-axis shows group names (truncated if long)
- X-axis shows count
- Tooltip with exact count

#### 5f: RecentInstanceList

- Card with title ("Recent Form Instances" or "Recent Report Instances")
- List of rows (not a table — more compact). Each row:
  - Template name (bold, linked)
  - Readable ID in muted text
  - Group name (if available) + relative time in muted text
  - Status badge (right-aligned): green "Submitted", blue "Draft", purple "Ready", amber "Generating"
- "View all" link at bottom
- Empty state: "No recent instances"

#### 5g: GroupMembersList

- Card with "Group Members" title
- Compact list: avatar (small) + name + role badge (color-coded)
- Max 5 shown, "View all N members" link at bottom

#### 5h: AssignedFieldsList

- Card with "Assigned Fields" title
- Grouped by instance: instance name as a mini-header, field labels as clickable sub-items
- Each field links to `/instances/$readableId?mode=edit`
- Empty state: checkmark icon + "All caught up" text

**Step 1: Create each component file (5a through 5h)**

**Step 2: Verify compilation**

Run: `npx tsc -b --noEmit`

**Step 3: Commit**

```bash
git add src/features/dashboard/components/ && git commit -m "feat(dashboard): add shared widget components (greeting, action banner, stat card, charts, lists)"
```

---

### Task 6: Build Role-Specific Dashboard Layouts

**Files:**
- Create: `src/features/dashboard/layouts/root-admin-dashboard.tsx`
- Create: `src/features/dashboard/layouts/admin-dashboard.tsx`
- Create: `src/features/dashboard/layouts/editor-dashboard.tsx`
- Create: `src/features/dashboard/layouts/viewer-dashboard.tsx`

Each layout component:
- Receives `timeRange` and `data` (from hook) as props
- Composes the shared widget components into the role-specific grid layout
- Uses CSS Grid with `grid-cols-12` on desktop
- Handles responsive breakpoints

#### 6a: RootAdminDashboard

```
Row 1: 4 x StatCard (3 cols each)
Row 2: SubmissionTrendChart (8 cols) + GroupBreakdownChart (4 cols)
Row 3: RecentInstanceList forms (6 cols) + RecentInstanceList reports (6 cols)
```

#### 6b: AdminDashboard

```
Row 1: 3 x StatCard (4 cols each)
Row 2: SubmissionTrendChart (8 cols) + GroupMembersList (4 cols)
Row 3: RecentInstanceList forms (6 cols) + RecentInstanceList reports (6 cols)
```

#### 6c: EditorDashboard

```
Row 1: 3 x StatCard (4 cols each)
Row 2: SubmissionTrendChart variant="bar" (8 cols) + AssignedFieldsList (4 cols)
Row 3: RecentInstanceList forms (6 cols) + RecentInstanceList reports (6 cols)
```

#### 6d: ViewerDashboard

```
Row 1: 2 x StatCard (6 cols each)
Row 2: SubmissionTrendChart (12 cols, full-width)
Row 3: RecentInstanceList forms (6 cols) + RecentInstanceList reports (6 cols)
```

**Step 1: Create each layout file**

**Step 2: Verify compilation**

Run: `npx tsc -b --noEmit`

**Step 3: Commit**

```bash
git add src/features/dashboard/layouts/ && git commit -m "feat(dashboard): add role-specific dashboard layout components"
```

---

### Task 7: Rewrite the Dashboard Route Page

**Files:**
- Modify: `src/routes/_authenticated/index.tsx` (full rewrite)
- Delete or empty: `src/features/dashboard/widgets.tsx` (old widgets replaced)

The new page component:
1. Gets `currentUser` from `useCurrentUser()`
2. Manages `timeRange` state (default `'7d'`)
3. Calls `useDashboardData(role, timeRange, groupId, userId)`
4. Renders `DashboardGreeting` with time range toggle
5. Renders `ActionBanner` with action items
6. Renders the role-specific layout component

```typescript
function DashboardPage() {
  const currentUser = useCurrentUser()
  const { setPageTitle } = usePageTitle()
  const [timeRange, setTimeRange] = useState<TimeRange>('7d')

  useEffect(() => {
    setPageTitle('Dashboard')
    return () => setPageTitle(null)
  }, [setPageTitle])

  if (!currentUser) return null

  // useDashboardData returns the full data for the role
  const dashboardData = useDashboardData(
    currentUser.role,
    timeRange,
    currentUser.groupId ?? undefined,
    currentUser.id,
  )

  return (
    <div className="flex flex-col gap-6 p-6">
      <DashboardGreeting
        firstName={currentUser.firstName}
        actionItemCount={dashboardData.actionItems.data?.length ?? 0}
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
      />
      <ActionBanner
        items={dashboardData.actionItems.data}
        isLoading={dashboardData.actionItems.isLoading}
      />
      {/* Role-specific layout */}
      {currentUser.role === 'root_admin' && <RootAdminDashboard data={dashboardData} />}
      {currentUser.role === 'admin' && <AdminDashboard data={dashboardData} />}
      {currentUser.role === 'editor' && <EditorDashboard data={dashboardData} />}
      {currentUser.role === 'viewer' && <ViewerDashboard data={dashboardData} />}
    </div>
  )
}
```

**Step 1: Rewrite the route page**

**Step 2: Delete old widgets file (or repurpose it as a re-export barrel)**

**Step 3: Verify compilation**

Run: `npx tsc -b --noEmit`

**Step 4: Manual smoke test**

Run: `npm run dev`
Open `http://localhost:5173/` and verify:
- Greeting shows with correct time of day
- Time range toggle works (7d/30d/90d)
- Action banner shows for roles with action items
- Stat cards show with colored icons and deltas
- Charts render (may have no data in dev — verify no crash)
- Recent lists show with badges and relative times
- Responsive: check at mobile and tablet breakpoints

**Step 5: Commit**

```bash
git add -A && git commit -m "feat(dashboard): rewrite dashboard page with role-adaptive layouts and charts"
```

---

### Task 8: Lint and Build Verification

**Step 1: Run linter**

Run: `npm run lint`
Fix any lint errors.

**Step 2: Run production build**

Run: `npm run build`
Fix any type or build errors.

**Step 3: Commit fixes (if any)**

```bash
git add -A && git commit -m "fix(dashboard): resolve lint and build errors"
```

---

### Task 9: Update TODO.md

**Files:**
- Modify: `docs/TODO.md`

Update the Dashboard section to reflect the redesign:

```markdown
## Feature: Dashboard

- [x] Adaptive dashboard (`/`)
- [x] Root Admin widgets (pending requests, recent submissions, schedules, stats)
- [x] Admin widgets (group members, draft instances, submissions)
- [x] Editor widgets (assigned fields, draft instances)
- [x] Viewer widgets (recent submissions, reports)
- [x] Dashboard redesign: colorful stat cards with deltas
- [x] Dashboard redesign: time-series trend charts (Shadcn Charts / Recharts)
- [x] Dashboard redesign: action items banner
- [x] Dashboard redesign: greeting header with time range toggle (7d/30d/90d)
- [x] Dashboard redesign: recent form instances list (10)
- [x] Dashboard redesign: recent report instances list (10)
- [x] Dashboard redesign: group breakdown chart (Root Admin)
- [x] Dashboard redesign: per-widget skeleton loading
```

**Step 1: Update TODO.md**

**Step 2: Commit**

```bash
git add docs/TODO.md && git commit -m "docs: update TODO with dashboard redesign items"
```
