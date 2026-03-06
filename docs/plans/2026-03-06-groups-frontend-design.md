# Groups Frontend Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the Groups feature frontend — list page, detail page with tabbed members/requests, and member request side sheet with single + bulk CSV import.

**Architecture:** All data fetched via the Supabase client SDK with RLS handling permissions server-side. No Edge Functions needed for reads/writes. The `invite-user` Edge Function is called only after a request is approved and the Root Admin triggers the actual invite.

**Tech Stack:** React, TanStack Router (file-based), Shadcn UI (Table, Tabs, Sheet, Badge, Dialog, DropdownMenu), Supabase client SDK, Tailwind CSS.

---

## 1. Group List Page (`/groups`)

### Layout
Same pattern as the Forms page: stat cards row at top, data table below.

### Stat Cards
- Root Admin sees: **Total Groups** | **Active Groups** | **Total Members**
- Admin/Editor/Viewer sees: single-row table with their own group (stat cards show their group's member count only)

### Table Columns
| Column | Alignment | Notes |
|---|---|---|
| Group Name | Left | Clickable → navigates to `/groups/:groupId` |
| Members | Right | Count of profiles with `group_id` matching |
| Status | Right | Badge: Active (default) / Inactive |
| Created On | Right | Date formatted |

### Actions
- **Root Admin only**: "+ New Group" button top-right. Opens a Dialog with group name input. Creates via `supabase.from('groups').insert()`.
- **Row click**: navigates to `/groups/:groupId`
- **Root Admin**: row-level dropdown with "Deactivate Group" option (sets `is_active = false`)

### RLS Behavior
- Root Admin: RLS returns all groups
- Others: RLS returns only their own active group → table shows one row

---

## 2. Group Detail Page (`/groups/:groupId`)

### Header
- Group name (large text)
- Status badge (Active/Inactive)
- Root Admin: Edit name button, Deactivate/Reactivate button

### Tabs

#### Members Tab (visible to all roles)
Table columns:
| Column | Alignment | Notes |
|---|---|---|
| Name | Left | Avatar (DiceBear default or uploaded) + full name |
| Email | Left | |
| Role | Left | Badge: Admin / Editor / Viewer |
| Joined On | Right | `profiles.created_at` |
| Status | Right | Active / Inactive badge |

- Root Admin: three-dot dropdown menu per row with:
  - **Change Role** → sub-menu: Admin / Editor / Viewer (calls `update-user-role` Edge Function)
  - **Move to Group** → confirmation dialog with group selector (updates `profiles.group_id` + syncs metadata)
  - **Deactivate Member** → sets `profiles.is_active = false` + syncs metadata
- Others: read-only (no Actions column)
- Search bar at top of tab (filters by name/email)

#### Requests Tab (visible to Root Admin + Admin only, hidden for Editor/Viewer)
Table columns:
| Column | Alignment | Notes |
|---|---|---|
| Full Name | Left | |
| Email | Left | |
| Proposed Role | Left | Badge |
| Requested By | Left | Name of the admin who created the request |
| Status | Left | Badge: Pending / Approved / Rejected |
| Created On | Right | |

- **Root Admin**: Approve / Reject inline buttons on pending rows. Approve auto-triggers `invite-user` Edge Function (sends invite email immediately).
- **Admin + Root Admin**: "Request Member" button opens the side sheet

---

## 3. Member Request Side Sheet

### Trigger
"Request Member" button in the Requests tab (Admin only, or Root Admin).

### Two Tabs: "Single" | "Bulk Import"

#### Single Tab
Form fields:
- **Email** — text input, required
- **Full Name** — text input, required
- **Proposed Role** — select dropdown (admin, editor, viewer), default: viewer
- **Submit** button → `supabase.from('member_requests').insert()`

#### Bulk Import Tab
Step-based flow:
1. **Upload**: CSV file drop/select area
2. **Column Mapping**: After parsing CSV, show dropdown selectors to map CSV columns → Email, Full Name, Role (optional)
3. **Preview**: Table showing parsed rows with mapped values. Default role (viewer) applied where Role column is empty or unmapped.
4. **Submit**: Creates all member requests in a batch insert

---

## 4. Permissions Summary

| Capability | Root Admin | Admin | Editor | Viewer |
|---|---|---|---|---|
| See all groups | Yes | No | No | No |
| See own group | Yes | Yes | Yes | Yes |
| Create group | Yes | No | No | No |
| Delete/deactivate group | Yes | No | No | No |
| See Members tab | Yes | Yes | Yes | Yes |
| See Requests tab | Yes | Yes (own group) | No | No |
| Create member request | Yes | Yes (own group) | No | No |
| Approve/reject request | Yes | No | No | No |
| Remove/deactivate member | Yes | No | No | No |
| Change member role | Yes | No | No | No |
| Move member to group | Yes | No | No | No |
| Invite user (auto on approve) | Yes | No | No | No |

---

## 5. Routes

| Route | File | Description |
|---|---|---|
| `/groups` | `src/routes/_authenticated/groups/index.tsx` | Group list page |
| `/groups/:groupId` | `src/routes/_authenticated/groups/$groupId.tsx` | Group detail with tabs |

---

## 6. Error Handling

All Supabase errors go through `mapSupabaseError()` from `src/lib/supabase-errors.ts` with the `postgrest` service type. Toast notifications via Sonner.
