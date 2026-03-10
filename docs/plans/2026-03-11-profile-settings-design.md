# Profile Settings Page — Design

## Overview

Dedicated profile page at `/settings` where authenticated users can view their account info and edit their name, avatar, email, and password. The sidebar "View Profile" link updates to point here. The sidebar avatar switches from DiceBear-only to showing the user's uploaded avatar (with DiceBear fallback).

## Route

`/settings` — authenticated route within the sidebar layout. Accessible to all roles.

No sub-routes or tabs. Single scrollable page with stacked card sections.

## Page Layout

Standard authenticated layout (sidebar + header bar with breadcrumb "Settings"). No header action buttons.

The page uses a centered, max-width container (~`max-w-2xl`) with vertical spacing between sections. Each section is a Shadcn `Card` with a title, description, and form fields.

### Section 1: Profile Picture

- Large avatar display (~96px) showing uploaded avatar or DiceBear fallback
- "Upload photo" button (opens file picker, accepts `image/*`)
- "Remove photo" button (only shown when a custom avatar exists)
- On upload: calls `uploadAvatar()`, then `updateUserMetadata({ avatar_url })` and `updateProfile({ avatar_url })`
- On remove: deletes from storage, clears `avatar_url` in both user_metadata and profiles table

### Section 2: Personal Information

- **First name** — text input, required, pre-filled from `currentUser.firstName`
- **Last name** — text input, required, pre-filled from `currentUser.lastName`
- **Role** — read-only badge (Root Admin / Admin / Editor / Viewer)
- **Group** — read-only text (group name fetched from groups table, or "No group" for root admin)
- "Save" button — updates `user_metadata.first_name`, `user_metadata.last_name`, `user_metadata.full_name`, and `profiles.full_name`

### Section 3: Email Address

- Current email displayed as read-only text
- "New email" input field (appears on "Change email" button click, or always visible)
- "Save" button — calls `supabase.auth.updateUser({ email: newEmail })` which triggers Supabase's native email confirmation flow
- Info text: "A confirmation link will be sent to your new email address."
- After save, show a success message explaining the user must click the confirmation link

### Section 4: Change Password

- **New password** — password input, minimum 8 characters
- **Confirm password** — password input, must match
- "Save" button — calls `updatePassword(newPassword)`
- No "current password" field (Supabase `updateUser` uses the active session for verification)

## Data Flow

### Reads

Profile data comes from two sources:
- `currentUser` (from `useCurrentUser` hook / JWT `user_metadata`) — first name, last name, email, role, group ID, avatar URL
- `groups` table — group name (fetched by group ID)

### Writes

Each section saves independently. On save:

1. **Avatar**: `uploadAvatar()` → `updateUserMetadata({ avatar_url })` → `updateProfile({ avatar_url })`
2. **Name**: `updateUserMetadata({ first_name, last_name, full_name })` → `updateProfile({ full_name })`
3. **Email**: `supabase.auth.updateUser({ email })` — Supabase handles the confirmation flow
4. **Password**: `updatePassword(newPassword)`

After any metadata update, the Supabase auth listener (`onAuthStateChange`) fires `USER_UPDATED`, which re-parses `currentUser` from the new JWT. The sidebar re-renders automatically.

## Schema Changes

### Migration: Add `avatar_url` to `profiles` table

```sql
ALTER TABLE public.profiles ADD COLUMN avatar_url TEXT;
```

Currently `avatar_url` only exists in `auth.users.raw_user_meta_data`. Adding it to `profiles` keeps the profiles table as the source of truth and enables future queries that need avatar URLs without hitting the auth schema.

### Migration: Add `first_name` and `last_name` to `profiles` table

```sql
ALTER TABLE public.profiles ADD COLUMN first_name TEXT;
ALTER TABLE public.profiles ADD COLUMN last_name TEXT;
```

Currently `first_name` and `last_name` only exist in `auth.users.raw_user_meta_data`. The `profiles` table only has `full_name`. Adding these columns enables direct queries on name parts and keeps the profiles table self-contained.

Backfill: Existing rows get `first_name` and `last_name` from splitting `full_name`. New profiles should set all three columns at invite time.

## Code Changes

### `CurrentUser` type — add `avatarUrl`

```typescript
export interface CurrentUser {
  id: string
  email: string
  firstName: string
  lastName: string
  avatarUrl: string | null   // NEW
  role: UserRole
  groupId: string | null
  isActive: boolean
}
```

### `parseCurrentUser` in `use-auth.ts` — extract `avatar_url`

Add `avatarUrl: (meta.avatar_url as string) ?? null` to the returned object.

### `updateProfile` in `profiles.ts` — expand accepted fields

Accept `avatar_url`, `first_name`, `last_name` in addition to existing `full_name` and `invite_status`.

### Sidebar (`app-sidebar.tsx`) — use real avatar

Replace `const avatarUrl = getDefaultAvatarUri(displayName)` with:

```typescript
const avatarUrl = currentUser?.avatarUrl ?? getDefaultAvatarUri(displayName)
```

### "View Profile" link — point to `/settings`

Change `<Link to="/">` to `<Link to="/settings">` in the sidebar dropdown.

## New Files

| File | Purpose |
|---|---|
| `src/routes/_authenticated/settings.tsx` | Settings page route component |
| `src/services/settings.ts` | Service functions for profile updates (or extend `profiles.ts`) |

## Validation

- **First name / last name**: required, non-empty after trim
- **Email**: use `isValidEmail()` from `src/lib/validation.ts`
- **Password**: minimum 8 characters, must match confirmation
- All validation runs client-side before submission. Server-side RLS and Supabase Auth provide additional enforcement.

## Error Handling

- Each section has its own save button and independent error state
- Supabase errors are caught and displayed as inline error messages below the form
- Toast notifications on success ("Profile updated", "Confirmation email sent", "Password changed")

## Deferred

- **Account deletion** — not in scope
- **Two-factor authentication** — not in scope
- **Notification preferences** — not in scope
- **Theme/appearance settings** — not in scope
