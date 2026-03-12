# Dashboard Redesign Design

Full visual redesign of the role-adaptive dashboard at `/`. Replaces the existing basic widget implementation with a colorful, chart-driven, action-oriented dashboard.

## Decisions

- Full visual redesign (not incremental enhancement)
- Time-series trend charts using Shadcn Charts (built on Recharts)
- Default time range: 7 days, switchable to 30d / 90d
- Two separate recent lists: form instances (10) and report instances (10)
- Instances, not templates, in the recent lists
- Root admin + admin + editor get charts; viewer also gets a group trend chart
- Top action banner for items needing attention
- Personalized time-aware greeting with summary line
- Colorful design: colored borders, tinted backgrounds, gradient chart fills, colored badges

## Color Strategy

Uses the 5 existing chart CSS variables (`chart-1` through `chart-5`). Every major section gets deliberate color:

| Element | Color Treatment |
|---|---|
| Action item cards | Colored left border + tinted background (amber/warning, blue/info, red/destructive) |
| Stat cards | Each stat gets a distinct icon color from the chart palette |
| Area/line charts | Gradient fills (chart color at 20% opacity fading to transparent) |
| Bar charts | Each bar a different chart color |
| Recent lists | Colored status badges (green=submitted, blue=draft, purple=report ready, amber=generating) |
| Card headers | Subtle colored accent or icon tinting |

## Layout: Greeting Header

Full-width greeting bar at the top of every role's dashboard.

- Time-aware greeting ("Good morning/afternoon/evening") using `profiles.first_name`
- Summary line counting role-specific action items
- Time range toggle (7d / 30d / 90d) in top-right, controls all trend charts globally

## Layout: Action Items Banner

Horizontal row of compact colored cards below the greeting. Each card navigates to the relevant page on click. Collapses entirely when the role has zero action items.

### Root Admin action items

| Card | Color | Data Source | Links To |
|---|---|---|---|
| Pending member requests | Amber/warning | `member_requests` where `status = 'pending'` (all groups) | `/groups` |
| Draft instances system-wide | Blue/info | `form_instances` where `status = 'pending'` | `/forms` |
| Overdue schedules | Red/destructive | `instance_schedules` where `next_run_at < now()` and `is_active` | `/forms` |

### Admin action items

| Card | Color | Data Source | Links To |
|---|---|---|---|
| Pending requests (group) | Amber | `member_requests` where `group_id = X, status = 'pending'` | `/groups/:groupId` |
| Draft instances (group) | Blue | `form_instances` where `group_id = X, status = 'pending'` | `/forms` |

### Editor action items

| Card | Color | Data Source | Links To |
|---|---|---|---|
| Fields assigned to you | Blue | `field_values` where `assigned_to = userId` in pending instances | First instance link |

### Viewer action items

| Card | Color | Data Source | Links To |
|---|---|---|---|
| New reports available | Purple | `report_instances` created in last 7 days for their group | `/reports` |

## Root Admin Dashboard

Most data-rich view. Grid layout:

### Row 1: Stat Cards (4 equal-width cards)

| Card | Icon Color | Big Number | Delta |
|---|---|---|---|
| Total Users | chart-1 | `profiles` count (is_active) | Change within time range |
| Groups | chart-2 | `groups` count (is_active) | "All active" or count |
| Templates | chart-3 | `form_templates` count (is_active) | N drafts |
| Instances | chart-4 | `form_instances` count | Change within time range |

### Row 2: Charts (8 + 4 columns)

**Submissions Trend (8 cols)** -- Area chart with chart-1 gradient fill. X-axis = days in time range. Y-axis = submission count. Data: `form_instances` where `status = 'submitted'`, grouped by `submitted_at::date`.

**Group Breakdown (4 cols)** -- Horizontal bar chart. Each bar a different chart color. Submission count per group within time range. Sorted descending. Top 7 + "Other" if more than 8 groups.

### Row 3: Recent Lists (6 + 6 columns)

**Recent Form Instances (10 items)**: template name (linked), readable ID, group name, relative time, status badge. Ordered by `updated_at` desc.

**Recent Report Instances (10 items)**: template name (linked), readable ID, group context, relative time, status badge. Ordered by `created_at` desc.

Each list has a "View all" link at the bottom.

## Admin Dashboard

Scoped to the admin's group.

### Row 1: Stat Cards (3 cards)

| Card | Icon Color | Big Number | Delta |
|---|---|---|---|
| Group Members | chart-2 | Active profiles in group | N pending invites |
| Total Instances | chart-4 | All form instances for group | N drafts |
| Submitted | chart-1 | Submitted instances | Change within time range |

### Row 2: Chart + Members (8 + 4 columns)

**Group Submissions Trend (8 cols)** -- Area chart, chart-2 gradient fill. Same as root admin but filtered to `group_id`.

**Group Members (4 cols)** -- Compact list of up to 5 members with avatar, name, and color-coded role badge (admin=blue, editor=green, viewer=grey). "View all members" link.

### Row 3: Recent Lists (6 + 6)

Same 10-item pattern as root admin, scoped to group.

## Editor Dashboard

Personal work + group activity.

### Row 1: Stat Cards (3 cards)

| Card | Icon Color | Big Number | Delta |
|---|---|---|---|
| Assigned Fields | chart-1 | Fields assigned to this editor in pending instances | "Across N forms" |
| My Draft Forms | chart-4 | Pending instances in group | "Need completion" |
| My Submissions | chart-2 | Instances this editor interacted with, now submitted | Change within time range |

### Row 2: Chart + Assignments (8 + 4 columns)

**My Activity Trend (8 cols)** -- Bar chart (not area, visually distinct). chart-3 color. Shows this editor's submissions over the time range. Data: `form_instances` where the editor has `field_values` entries, grouped by `submitted_at::date`.

**Assigned Fields (4 cols)** -- Grouped by form instance. Form name as header, field labels underneath. Each field links to instance in edit mode. "All caught up" empty state with checkmark icon.

### Row 3: Recent Lists (6 + 6)

Same 10-item pattern, group-scoped.

## Viewer Dashboard

Consumption-focused.

### Row 1: Stat Cards (2 cards)

| Card | Icon Color | Big Number | Delta |
|---|---|---|---|
| Group Submissions | chart-1 | Submitted instances for group | Change within time range |
| Reports Available | chart-5 | Report instances accessible to viewer | Change within time range |

### Row 2: Trend Chart (full-width, 12 cols)

Full-width area chart as the visual centerpiece. chart-5 gradient fill. Group-scoped submissions over time range.

### Row 3: Recent Lists (6 + 6)

Same 10-item pattern, group-scoped.

## Shared Components

| Component | Used By | Description |
|---|---|---|
| `DashboardGreeting` | All roles | Time-aware greeting + summary + time range toggle (7d/30d/90d) |
| `ActionBanner` | All roles | Horizontal row of colored action cards, collapses when empty |
| `StatCard` | All roles | Big number + label + delta + colored icon |
| `SubmissionTrendChart` | All roles | Area or bar chart, accepts data + color + time range |
| `GroupBreakdownChart` | Root Admin | Horizontal bar chart of submissions per group |
| `RecentInstanceList` | All roles | 10-item list with badge, link, relative time |
| `GroupMembersList` | Admin | Compact avatar + name + role badge list |
| `AssignedFieldsList` | Editor | Grouped fields with instance links |

## Data Fetching Architecture

- One `useDashboardData(role, groupId, userId, timeRange)` hook
- Parallel Supabase queries via `Promise.all`
- Returns `{ data, isLoading, error }` per section
- Skeleton loading states per widget (colored shimmer, not grey)
- Error boundary per widget: one failed query does not break the whole dashboard
- All queries use the Supabase client SDK with RLS (no Edge Functions)

## Responsive Grid

- Desktop (lg+): 12-column grid, widgets span 4/6/8/12 columns
- Tablet (md): 6-column grid, most widgets full-width, charts half
- Mobile (sm): single column, everything stacks
