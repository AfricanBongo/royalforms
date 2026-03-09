# Role-Based Member Add Flow

## Problem

Both Admin and Root Admin currently share the same "Request Member" flow, which always creates a pending request requiring Root Admin approval. Root Admin should be able to add members directly without the approval step.

## Design

### Flow by role

| Role | Action label | Behavior |
|---|---|---|
| Admin | "Request Member" | Creates `member_request` with `status: pending`. Root Admin must approve before invite is sent. |
| Root Admin | "Add Member" | Creates `member_request` with `status: approved`, `decided_by` set to self, then immediately calls `invite-user` Edge Function. |

### Changes

**`src/services/member-requests.ts`**
- `addMemberDirectly(data)` — inserts row with `status: approved` + `decided_by` + `decided_at`, then calls `inviteMemberDirectly()`.
- `addMembersBulk(members, groupId)` — inserts rows with `status: approved` + `decided_by` + `decided_at`, then calls `inviteMembersBulk()`. Returns `{ invited, failed, errors }`.

**`src/components/member-request-sheet.tsx`**
- New prop: `isRootAdmin: boolean`
- Root Admin: title "Add Member", button "Add Member" / "Add N Members", label "Role" instead of "Proposed Role"
- Admin: title "Request Member", button "Request Member" / "Import N Members", label "Proposed Role"
- Single tab submit handler branches: Root Admin calls `addMemberDirectly()`, Admin calls `createRequest()`
- Bulk submit handler branches: Root Admin calls `addMembersBulk()`, Admin calls `createBulkRequests()`

**`src/components/requests-tab.tsx`**
- Button label: "Add Member" for Root Admin, "Request Member" for Admin
- Passes `isRootAdmin` to `MemberRequestSheet`

### No changes needed

- `member_requests` table schema (no migration)
- Approve/reject flow for Admin-created requests
- CSV bulk import UI steps
- `invite-user` Edge Function
- Requests tab visibility (both roles see it)
