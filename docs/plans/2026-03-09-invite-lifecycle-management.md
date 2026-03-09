# Invite Lifecycle Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add invite lifecycle tracking (`invite_sent` / `completed`), resend invite, change invitee email, and hard-delete invited users.

**Architecture:** New `invite_status` column on `profiles` tracks whether a user has completed onboarding. A new `manage-invite` Edge Function handles resend, email change, and delete operations (root_admin only). The frontend shows an "Invite Sent" badge in the members tab with dropdown actions, and a new service module (`invite-management.ts`) wraps the Edge Function calls.

**Tech Stack:** PostgreSQL migrations, Supabase Edge Functions (Deno), React + Shadcn UI, TypeScript

---

## Task 1: Migration — Add `invite_status` to `profiles`

**Files:**
- Create: `supabase/migrations/20260309000001_add_invite_status_to_profiles.sql`

**Step 1: Write the migration**

```sql
-- Add invite_status column to profiles table.
-- 'invite_sent' = invited but hasn't finished onboarding
-- 'completed'   = fully onboarded (default for existing rows)
ALTER TABLE public.profiles
  ADD COLUMN invite_status TEXT NOT NULL DEFAULT 'completed'
  CONSTRAINT profiles_invite_status_check CHECK (invite_status IN ('invite_sent', 'completed'));
```

**Step 2: Apply migration**

Run: `supabase db reset`
Expected: Clean apply with no errors.

**Step 3: Verify**

Run `supabase_list_tables` (verbose) to confirm `invite_status` column exists on `profiles`.
Run `supabase_get_advisors` (security) to check for issues.

---

## Task 2: Migration — Add `cancelled` to `member_requests` status + FK changes

**Files:**
- Create: `supabase/migrations/20260309000002_member_requests_cancelled_status_and_fk_changes.sql`

**Step 1: Write the migration**

```sql
-- 1. Add 'cancelled' to the status check constraint
ALTER TABLE public.member_requests
  DROP CONSTRAINT member_requests_status_check;
ALTER TABLE public.member_requests
  ADD CONSTRAINT member_requests_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'));

-- 2. Make requested_by nullable (currently NOT NULL)
ALTER TABLE public.member_requests
  ALTER COLUMN requested_by DROP NOT NULL;

-- 3. Change requested_by FK to ON DELETE SET NULL
ALTER TABLE public.member_requests
  DROP CONSTRAINT member_requests_requested_by_fkey;
ALTER TABLE public.member_requests
  ADD CONSTRAINT member_requests_requested_by_fkey
    FOREIGN KEY (requested_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 4. Change decided_by FK to ON DELETE SET NULL
ALTER TABLE public.member_requests
  DROP CONSTRAINT member_requests_decided_by_fkey;
ALTER TABLE public.member_requests
  ADD CONSTRAINT member_requests_decided_by_fkey
    FOREIGN KEY (decided_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
```

**Step 2: Apply migration**

Run: `supabase db reset`
Expected: Clean apply with no errors.

**Step 3: Verify**

Run `supabase_list_tables` (verbose) to confirm:
- `member_requests.status` check includes `cancelled`
- `member_requests.requested_by` is nullable
- FK constraints show `ON DELETE SET NULL`

Run `supabase_get_advisors` (security) to check for issues.

---

## Task 3: Update `invite-user` Edge Function — set `invite_status`

**Files:**
- Modify: `supabase/functions/invite-user/index.ts` (line 257-264, the profile insert)

**Step 1: Add `invite_status: 'invite_sent'` to the profile insert**

In the existing insert at line 257, add `invite_status: 'invite_sent'` to the object:

```typescript
const { error: insertError } = await supabaseAdmin.from("profiles").insert({
  id: inviteData.user.id,
  email,
  full_name,
  role,
  group_id,
  is_active: true,
  invite_status: "invite_sent",
});
```

**Step 2: Commit**

```
feat(edge-functions): set invite_status to invite_sent on profile creation
```

---

## Task 4: Create `manage-invite` Edge Function

**Files:**
- Create: `supabase/functions/manage-invite/index.ts`

**Step 1: Write the Edge Function**

The function accepts `{ action, user_id, new_email? }` in the request body.

Authorization pattern follows `invite-user/index.ts` exactly:
1. Read `SUPABASE_URL`, `SB_PUBLISHABLE_KEY`, `SB_SECRET_KEY` from env
2. Check `Authorization` header
3. Create service-role client (`supabaseAdmin`)
4. Verify caller via `supabaseAdmin.auth.getUser(token)`
5. Create RLS-scoped client (`supabaseClient`) with caller's JWT
6. Fetch caller profile via `supabaseClient` — check `is_active` and `role === 'root_admin'`

Then dispatch based on `action`:

**`resend` action:**
1. Fetch target profile via `supabaseAdmin` where `id = user_id` and `invite_status = 'invite_sent'`
2. Guard: if not found or `invite_status !== 'invite_sent'`, return 400
3. Call `supabaseAdmin.auth.admin.inviteUserByEmail(profile.email, { redirectTo, data: { full_name, role, group_id, is_active: true } })`
4. Return success

**`change_email` action:**
1. Validate `new_email` is provided
2. Fetch target profile via `supabaseAdmin` where `id = user_id` and `invite_status = 'invite_sent'`
3. Guard: if not found or `invite_status !== 'invite_sent'`, return 400
4. Call `supabaseAdmin.auth.admin.updateUserById(user_id, { email: new_email })` to update auth record
5. Update `profiles` row: `email = new_email` via `supabaseAdmin`
6. Update any `member_requests` rows matching old email + group: set `email = new_email` via `supabaseAdmin`
7. Call `supabaseAdmin.auth.admin.inviteUserByEmail(new_email, { redirectTo, data: { ... } })` to send invite to new address
8. Return success

**`delete` action:**
1. Fetch target profile via `supabaseAdmin` where `id = user_id` and `invite_status = 'invite_sent'`
2. Guard: if not found or `invite_status !== 'invite_sent'`, return 400
3. Update `member_requests` rows where `email = profile.email` and `group_id = profile.group_id` to `status = 'cancelled'` via `supabaseAdmin`
4. Call `supabaseAdmin.auth.admin.deleteUser(user_id)` — this cascades to delete the `profiles` row
5. Return success

All actions include `console.info` logging with `[manage-invite]` prefix, same pattern as `invite-user`.

**Step 2: Commit**

```
feat(edge-functions): add manage-invite function for resend, email change, and delete
```

---

## Task 5: Update `invite/accept.tsx` — set `invite_status` to `completed`

**Files:**
- Modify: `src/routes/invite/accept.tsx` (inside `CreateAccountStep`, after successful `updatePassword`)
- Modify: `src/services/profiles.ts` (expand `updateProfile` data type to accept `invite_status`)

**Step 1: Expand `updateProfile` to accept `invite_status`**

In `src/services/profiles.ts:14-24`, change the `data` parameter type:

```typescript
export async function updateProfile(
  userId: string,
  data: { full_name?: string; invite_status?: string },
) {
```

**Step 2: Add `updateProfile` call in `CreateAccountStep`**

In `src/routes/invite/accept.tsx`, after the successful `updatePassword` call (line 256) and before `setButtonState('success')` (line 265), add:

```typescript
// Mark invite as completed in the profiles table
try {
  await updateProfile(user.id, { invite_status: 'completed' })
} catch {
  // Non-critical: invite_status update failed but password is set
  console.error('Failed to update invite_status to completed')
}
```

Also add `updateProfile` to the import from `../../services/profiles` (line 37).

**Step 3: Verify build**

Run: `npm run build`
Expected: Exit 0, no type errors.

**Step 4: Commit**

```
feat(auth): mark invite_status as completed after password setup
```

---

## Task 6: Create `src/services/invite-management.ts`

**Files:**
- Create: `src/services/invite-management.ts`

**Step 1: Write the service module**

```typescript
/**
 * Invite management service — resend invites, change invitee email,
 * and delete invited users. Root Admin only.
 */
import { supabase } from './supabase'

interface ManageInviteResult {
  success: boolean
  error?: string
}

function parseResult(data: unknown): ManageInviteResult {
  const result = typeof data === 'string'
    ? JSON.parse(data) as ManageInviteResult
    : data as ManageInviteResult
  return result
}

/**
 * Resend the invite email to a user with invite_status = 'invite_sent'.
 */
export async function resendInvite(userId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('manage-invite', {
    body: { action: 'resend', user_id: userId },
  })

  if (error) throw error

  const result = parseResult(data)
  if (!result.success) {
    throw new Error(result.error ?? 'Failed to resend invite')
  }
}

/**
 * Change the email address of an invited user and resend the invite
 * to the new address. Only works if invite_status = 'invite_sent'.
 */
export async function changeInviteEmail(
  userId: string,
  newEmail: string,
): Promise<void> {
  const { data, error } = await supabase.functions.invoke('manage-invite', {
    body: { action: 'change_email', user_id: userId, new_email: newEmail },
  })

  if (error) throw error

  const result = parseResult(data)
  if (!result.success) {
    throw new Error(result.error ?? 'Failed to change invite email')
  }
}

/**
 * Hard-delete an invited user (auth record + profile). Related
 * member_requests are set to status='cancelled'. Only works if
 * invite_status = 'invite_sent'.
 */
export async function deleteInvite(userId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('manage-invite', {
    body: { action: 'delete', user_id: userId },
  })

  if (error) throw error

  const result = parseResult(data)
  if (!result.success) {
    throw new Error(result.error ?? 'Failed to delete invite')
  }
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Exit 0.

**Step 3: Commit**

```
feat(services): add invite-management service for resend, email change, and delete
```

---

## Task 7: Update `MemberRow` type and `fetchGroupMembers` query

**Files:**
- Modify: `src/services/members.ts` (line 11-18 type, line 31-33 query)

**Step 1: Add `invite_status` to `MemberRow`**

```typescript
export interface MemberRow {
  id: string
  email: string
  full_name: string
  role: string
  is_active: boolean
  invite_status: string
  created_at: string
}
```

**Step 2: Add `invite_status` to the select query**

```typescript
const { data, error } = await supabase
  .from('profiles')
  .select('id, email, full_name, role, is_active, invite_status, created_at')
  .eq('group_id', groupId)
  .order('full_name')
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Exit 0.

**Step 4: Commit**

```
feat(services): include invite_status in member row query
```

---

## Task 8: Update Members Tab — badge + dropdown actions

**Files:**
- Modify: `src/components/members-tab.tsx`

**Step 1: Add imports**

Add to existing imports:

```typescript
import { MailIcon, PencilIcon, Trash2Icon } from 'lucide-react'
```

Add new service imports:

```typescript
import { resendInvite, changeInviteEmail, deleteInvite } from '../services/invite-management'
```

**Step 2: Add state for change-email dialog**

Inside the `MembersTab` component, add state:

```typescript
const [changeEmailDialogOpen, setChangeEmailDialogOpen] = useState(false)
const [memberToChangeEmail, setMemberToChangeEmail] = useState<MemberRow | null>(null)
const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
const [memberToDelete, setMemberToDelete] = useState<MemberRow | null>(null)
```

**Step 3: Add handler functions**

```typescript
async function handleResendInvite(member: MemberRow) {
  try {
    await resendInvite(member.id)
    toast.success('Invite resent', {
      description: `A new invite email has been sent to ${member.email}.`,
    })
  } catch (err: unknown) {
    const error = err as { code?: string; message: string }
    const mapped = mapSupabaseError(error.code, error.message, 'auth', 'general')
    toast.error(mapped.title, { description: mapped.description })
  }
}

async function handleDeleteInvite(member: MemberRow) {
  try {
    await deleteInvite(member.id)
    toast.success('Invite deleted', {
      description: `${member.full_name}'s invite has been deleted.`,
    })
    void loadMembers()
  } catch (err: unknown) {
    const error = err as { code?: string; message: string }
    const mapped = mapSupabaseError(error.code, error.message, 'auth', 'general')
    toast.error(mapped.title, { description: mapped.description })
  } finally {
    setDeleteDialogOpen(false)
    setMemberToDelete(null)
  }
}

async function handleChangeEmail(newEmail: string) {
  if (!memberToChangeEmail) return
  try {
    await changeInviteEmail(memberToChangeEmail.id, newEmail)
    toast.success('Email changed', {
      description: `Invite resent to ${newEmail}.`,
    })
    void loadMembers()
  } catch (err: unknown) {
    const error = err as { code?: string; message: string }
    const mapped = mapSupabaseError(error.code, error.message, 'auth', 'general')
    toast.error(mapped.title, { description: mapped.description })
  } finally {
    setChangeEmailDialogOpen(false)
    setMemberToChangeEmail(null)
  }
}
```

**Step 4: Update Status badge (line 218-229)**

Replace the status badge to show "Invite Sent" when applicable:

```tsx
<TableCell className="text-right">
  {member.invite_status === 'invite_sent' ? (
    <Badge
      variant="outline"
      className="bg-amber-50 text-amber-700 border-amber-200"
    >
      Invite Sent
    </Badge>
  ) : (
    <Badge
      variant="outline"
      className={
        member.is_active
          ? 'bg-green-50 text-green-700 border-green-200'
          : 'bg-amber-50 text-amber-700 border-amber-200'
      }
    >
      {member.is_active ? 'Active' : 'Inactive'}
    </Badge>
  )}
</TableCell>
```

**Step 5: Update dropdown actions (line 240-278)**

Conditionally render different actions based on `invite_status`:

```tsx
<DropdownMenuContent align="end">
  {member.invite_status === 'invite_sent' ? (
    <>
      {/* Resend Invite */}
      <DropdownMenuItem
        onClick={() => void handleResendInvite(member)}
      >
        <MailIcon className="mr-2 size-4" />
        Resend Invite
      </DropdownMenuItem>

      {/* Change Email */}
      <DropdownMenuItem
        onClick={() => {
          setMemberToChangeEmail(member)
          setChangeEmailDialogOpen(true)
        }}
      >
        <PencilIcon className="mr-2 size-4" />
        Change Email
      </DropdownMenuItem>

      <DropdownMenuSeparator />

      {/* Delete Invite */}
      <DropdownMenuItem
        className="text-destructive"
        onClick={() => {
          setMemberToDelete(member)
          setDeleteDialogOpen(true)
        }}
      >
        <Trash2Icon className="mr-2 size-4" />
        Delete Invite
      </DropdownMenuItem>
    </>
  ) : (
    <>
      {/* Existing actions: Change Role, Move to Group, Deactivate */}
      {/* ... keep existing code ... */}
    </>
  )}
</DropdownMenuContent>
```

**Step 6: Add dialogs for change email and delete confirmation**

Add a `ChangeEmailDialog` and a `DeleteInviteDialog` component (either inline or as separate files). These are simple confirmation dialogs using Shadcn `AlertDialog` (for delete) and `Dialog` with an email input (for change email).

**Step 7: Verify build**

Run: `npm run build`
Expected: Exit 0.

**Step 8: Commit**

```
feat(groups): add invite lifecycle actions to members tab
```

---

## Task 9: Update Requests Tab — cancelled badge

**Files:**
- Modify: `src/components/requests-tab.tsx` (line 51-60, `statusBadgeClass` function)

**Step 1: Add `cancelled` case to `statusBadgeClass`**

```typescript
function statusBadgeClass(status: string): string {
  switch (status) {
    case 'approved':
      return 'bg-green-50 text-green-700 border-green-200'
    case 'rejected':
    case 'cancelled':
      return 'bg-red-50 text-red-700 border-red-200'
    default:
      return 'bg-amber-50 text-amber-700 border-amber-200'
  }
}
```

**Step 2: Ensure cancelled requests show no action buttons**

The existing code at lines 169-188 only renders approve/reject buttons when `req.status === 'pending'`, so cancelled requests already get no actions. No change needed.

**Step 3: Verify build**

Run: `npm run build`
Expected: Exit 0.

**Step 4: Commit**

```
feat(groups): show cancelled status badge in requests tab
```

---

## Task 10: Regenerate TypeScript types

**Step 1: Regenerate types**

Run: `supabase gen types typescript --local 2>/dev/null > src/types/database.ts`

**Step 2: Verify build**

Run: `npm run build`
Expected: Exit 0.

**Step 3: Commit**

```
chore(types): regenerate database types after invite lifecycle migrations
```

---

## Task 11: Update TODO.md

**Files:**
- Modify: `docs/TODO.md`

Cross off completed items and add any new items that emerged.

**Commit:**

```
docs(todo): update after invite lifecycle management implementation
```
