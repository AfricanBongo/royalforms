# Groups Detail & Member Requests Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the group detail page with tabbed Members/Requests views, member management actions (change role, move group, deactivate), request creation side sheet (single + bulk CSV import), and auto-invite on approval.

**Architecture:** All reads/writes via Supabase client SDK with RLS. Edge Functions called only for operations requiring service_role key: `invite-user` (post-approval invite) and `update-user-role` (change role, move group, deactivate — syncs JWT metadata). New service files for members and member-requests. No new Edge Functions needed.

**Tech Stack:** React, TanStack Router (file-based), Shadcn UI (Tabs, Sheet, Table, DropdownMenu, Dialog, Select, Badge), Supabase client SDK, Tailwind CSS, Sonner toasts, Papa Parse for CSV parsing.

---

## Task 1: Fix RLS — allow Root Admin to insert member requests

**Files:**
- Create: `supabase/migrations/20260306000003_allow_root_admin_member_request_insert.sql`

**Context:** Current `member_requests_insert` policy only allows `admin` role. Root Admin also needs to create member requests.

**Step 1: Write migration**

```sql
-- Allow root_admin to insert member requests for any group
DROP POLICY IF EXISTS member_requests_insert ON public.member_requests;

CREATE POLICY member_requests_insert ON public.member_requests
  FOR INSERT
  WITH CHECK (
    is_active_user() = true
    AND (
      -- Root Admin: can insert for any group, any valid role
      (get_current_user_role() = 'root_admin' AND proposed_role IN ('admin', 'editor', 'viewer'))
      OR
      -- Admin: can insert only for their own group
      (get_current_user_role() = 'admin' AND group_id = get_current_user_group_id() AND proposed_role IN ('admin', 'editor', 'viewer'))
    )
  );
```

**Step 2: Apply migration via Supabase MCP**

Run `supabase_apply_migration` with the SQL above, then `supabase_get_advisors` (security).

**Step 3: Write migration file locally**

Save to `supabase/migrations/20260306000003_allow_root_admin_member_request_insert.sql`.

---

## Task 2: Install Papa Parse for CSV parsing

**Step 1: Install**

```bash
npm install papaparse@latest
npm install -D @types/papaparse@latest
```

**Step 2: Verify**

```bash
npx tsc -b
```

---

## Task 3: Create members service (`src/services/members.ts`)

**Files:**
- Create: `src/services/members.ts`

**Functions:**

```typescript
fetchGroupMembers(groupId: string): Promise<MemberRow[]>
// Queries profiles table filtered by group_id, returns id, email, full_name, role, is_active, created_at

deactivateMember(userId: string): Promise<void>
// Updates profiles.is_active = false via client SDK
// Then calls update-user-role Edge Function to sync JWT metadata (is_active: false)

changeRole(userId: string, newRole: UserRole, groupId: string): Promise<void>
// Updates profiles.role via client SDK
// Then calls update-user-role Edge Function to sync JWT metadata

moveMemberToGroup(userId: string, newGroupId: string, currentRole: UserRole): Promise<void>
// Updates profiles.group_id via client SDK
// Then calls update-user-role Edge Function to sync JWT metadata (new group_id)
```

**Key details:**
- All profile updates go through client SDK (RLS: root_admin can update any profile)
- JWT metadata sync goes through `update-user-role` Edge Function (needs service_role key)
- Edge Function is called via `supabase.functions.invoke('update-user-role', { body: { user_id, role, group_id, is_active } })`
- Export a `MemberRow` type

---

## Task 4: Create member-requests service (`src/services/member-requests.ts`)

**Files:**
- Create: `src/services/member-requests.ts`

**Functions:**

```typescript
fetchRequests(groupId: string): Promise<MemberRequestRow[]>
// Queries member_requests filtered by group_id, joins requested_by profile for name

createRequest(data: { email, full_name, proposed_role, group_id }): Promise<void>
// Inserts into member_requests, sets requested_by to current user

createBulkRequests(requests: Array<{ email, full_name, proposed_role }>, groupId: string): Promise<{ created: number; failed: number }>
// Batch inserts into member_requests

approveRequest(requestId: string): Promise<void>
// Updates member_requests.status to 'approved', sets decided_by and decided_at
// Then calls invite-user Edge Function with the request's email/name/role/group_id

rejectRequest(requestId: string): Promise<void>
// Updates member_requests.status to 'rejected', sets decided_by and decided_at
```

**Key details:**
- `approveRequest` is a two-step operation: update DB status, then invoke `invite-user` Edge Function
- Edge Function is called via `supabase.functions.invoke('invite-user', { body: { email, full_name, role, group_id } })`
- Export a `MemberRequestRow` type
- `requested_by` name is fetched via a Supabase foreign key join: `.select('*, requested_by_profile:profiles!member_requests_requested_by_fkey(full_name)')`

---

## Task 5: Add group mutations to groups service

**Files:**
- Modify: `src/services/groups.ts`

**Add functions:**

```typescript
updateGroupName(groupId: string, name: string): Promise<void>
// Updates groups.name via client SDK (RLS: root_admin only)

reactivateGroup(groupId: string): Promise<void>
// Updates groups.is_active = true via client SDK
```

---

## Task 6: Group detail page — header + tabs shell

**Files:**
- Modify: `src/routes/_authenticated/groups/$groupId.tsx`

**Layout:**
- Fetch group via `fetchGroup(groupId)` on mount
- Header: group name (text-xl semibold) + Badge (Active/Inactive) on left; Root Admin actions on right
- Root Admin actions: "Edit Name" button (outline), "Deactivate"/"Reactivate" button
- Shadcn `Tabs` with "Members" and "Requests" values
- Requests tab visible only to root_admin and admin roles
- Each tab renders its own component

**Edit name:** Opens a `Dialog` with Input pre-filled with current name. Calls `updateGroupName()`.

**Deactivate/Reactivate:** Calls `deactivateGroup()` or `reactivateGroup()`. Confirmation via toast or inline.

---

## Task 7: Members tab component

**Files:**
- Create: `src/components/members-tab.tsx`

**Layout:**
- Search bar at top (search icon + input, filters name/email client-side)
- Table with columns: Name (avatar + name), Email, Role (badge), Joined On, Status (badge), Actions (dropdown)
- Avatar: DiceBear default via `getDefaultAvatarUri(fullName)`
- Dropdown menu (Root Admin only) with: Change Role (sub-menu), Move to Group, Deactivate

**Change Role sub-menu:**
- Items: Admin, Editor, Viewer (exclude current role)
- On click: calls `changeRole()` from members service, refreshes member list

**Deactivate:**
- Inline confirmation (could be a simple window.confirm or toast-based)
- Calls `deactivateMember()` from members service

**Move to Group:**
- Opens `MoveToGroupDialog` (Task 8)

---

## Task 8: Move to Group confirmation dialog

**Files:**
- Create: `src/components/move-to-group-dialog.tsx`

**Layout:**
- Dialog with title: "Move [Name] to another group"
- Description: "This will revoke their access to the current group's data."
- Shadcn `Select` populated with all active groups (excluding current group), fetched via `fetchGroups()`
- Cancel + Confirm buttons
- On confirm: calls `moveMemberToGroup()` from members service, closes dialog, refreshes member list

---

## Task 9: Requests tab component

**Files:**
- Create: `src/components/requests-tab.tsx`

**Layout:**
- "Request Member" button top-right (Root Admin + Admin)
- Table with columns: Full Name, Email, Proposed Role (badge), Requested By, Status (badge), Created On, Actions
- Actions column: Approve + Reject buttons (Root Admin only, pending rows only)
- Approve: calls `approveRequest()` which updates DB + auto-invites
- Reject: calls `rejectRequest()`
- Non-pending rows: no action buttons, just show status badge

**"Request Member" button:** Opens the `MemberRequestSheet` (Task 10)

---

## Task 10: Member Request side sheet — Single tab

**Files:**
- Create: `src/components/member-request-sheet.tsx`

**Layout:**
- Shadcn `Sheet` (side="right")
- Shadcn `Tabs` inside sheet: "Single" | "Bulk Import"
- **Single tab:**
  - Email input (required)
  - Full Name input (required)
  - Proposed Role — Shadcn `Select` with admin/editor/viewer options, default: viewer
  - Submit button
  - On submit: calls `createRequest()` from member-requests service, closes sheet, refreshes requests list

---

## Task 11: Member Request side sheet — Bulk Import tab

**Files:**
- Modify: `src/components/member-request-sheet.tsx`

**Step-based flow inside the Bulk Import tab:**

1. **Upload step**: File input (accept=".csv"). On file select, parse with Papa Parse.
2. **Column Mapping step**: Show detected CSV headers in Shadcn `Select` dropdowns mapped to: Email (required), Full Name (required), Role (optional). Show preview of first 3 rows.
3. **Preview step**: Full table of parsed rows with mapped values. Role defaults to "viewer" where empty/unmapped. Show row count. Allow removing invalid rows.
4. **Submit step**: "Import X requests" button. Calls `createBulkRequests()`. Shows success/failure count. Closes sheet on success.

**CSV parsing:** Use Papa Parse with `header: true`. Handle encoding, empty rows, duplicate emails.

---

## Task 12: Wire up navigation and update TODO.md

**Files:**
- Modify: `docs/TODO.md` — check off completed items

**Step 1:** Verify all pages work end-to-end:
- `/groups` → click row → `/groups/:groupId` with Members + Requests tabs
- Members tab: search, dropdown actions (change role, move group, deactivate)
- Requests tab: create request (single + bulk), approve/reject
- Approve auto-invites via Edge Function

**Step 2:** Run `npx tsc -b && npm run lint && npm run build`

**Step 3:** Update TODO.md — check off:
- `[x] Group list page`
- `[x] Group detail page`
- `[x] Member request side sheet`

---

## Execution Order

Tasks 1-2 are infrastructure (RLS fix + dependency). Tasks 3-5 are service layer (no UI). Tasks 6-11 are UI components. Task 12 is verification.

Dependencies:
- Task 6 depends on Task 5 (group mutations)
- Task 7 depends on Task 3 (members service) + Task 8 (move dialog)
- Task 9 depends on Task 4 (requests service) + Task 10 (request sheet)
- Task 11 depends on Task 2 (Papa Parse) + Task 10 (sheet structure)
- Task 12 depends on all above
