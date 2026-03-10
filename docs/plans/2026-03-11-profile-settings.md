# Profile Settings Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a `/settings` page where users can view their account info and edit their name, avatar, email, and password. Fix the sidebar to show the user's real avatar.

**Architecture:** Single scrollable page with stacked Card sections. Each section saves independently via existing service functions (`profiles.ts`, `auth.ts`). A DB migration adds `avatar_url`, `first_name`, and `last_name` columns to the `profiles` table. The `CurrentUser` type gains an `avatarUrl` field parsed from JWT metadata.

**Tech Stack:** React 19, TanStack Router (file-based routes), Shadcn UI (Card, Button, Input, Label, Badge, Avatar), Tailwind CSS, Supabase Client SDK, Sonner toasts.

---

### Task 1: Database Migration — Add columns to profiles table

**Files:**
- Create: `supabase/migrations/<timestamp>_add_profile_detail_columns.sql`

**Step 1: Write the migration SQL file**

Create the migration with the next timestamp. The SQL should:

```sql
-- Add avatar_url, first_name, last_name to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_name TEXT;

-- Backfill first_name/last_name from full_name for existing rows
-- Split on first space: everything before = first_name, everything after = last_name
UPDATE public.profiles
SET
  first_name = CASE
    WHEN full_name LIKE '% %' THEN split_part(full_name, ' ', 1)
    ELSE full_name
  END,
  last_name = CASE
    WHEN full_name LIKE '% %' THEN substring(full_name FROM position(' ' IN full_name) + 1)
    ELSE ''
  END
WHERE first_name IS NULL;
```

**Step 2: Apply migration via `supabase db reset`**

Run: `supabase db reset`
Expected: Migration applies cleanly.

**Step 3: Verify schema and run advisors**

Use `supabase_list_tables` (verbose, schemas: `["public"]`) to confirm the three new columns exist on `profiles`.
Use `supabase_get_advisors` (security) to check for issues.

**Step 4: Generate TypeScript types**

Run: `supabase gen types typescript --local 2>/dev/null > src/types/database.ts`
Verify `avatar_url`, `first_name`, `last_name` appear in the `profiles` type.

**Step 5: Commit**

```
feat(db): add avatar_url, first_name, last_name columns to profiles
```

---

### Task 2: Update `CurrentUser` type and `parseCurrentUser` — add `avatarUrl`

**Files:**
- Modify: `src/types/auth.ts`
- Modify: `src/hooks/use-auth.ts` (the `parseCurrentUser` function, around line 41-57)

**Step 1: Add `avatarUrl` to the `CurrentUser` interface**

In `src/types/auth.ts`, add after the `lastName` field:

```typescript
avatarUrl: string | null
```

**Step 2: Extract `avatar_url` in `parseCurrentUser`**

In `src/hooks/use-auth.ts`, inside the `parseCurrentUser` function's return object (~line 48-56), add:

```typescript
avatarUrl: (meta.avatar_url as string) ?? null,
```

**Step 3: Verify build**

Run: `npx tsc -b`
Expected: No type errors.

**Step 4: Commit**

```
feat(auth): add avatarUrl to CurrentUser type
```

---

### Task 3: Fix sidebar to show real avatar + update "View Profile" link

**Files:**
- Modify: `src/components/app-sidebar.tsx`

**Step 1: Use real avatar URL with DiceBear fallback**

In `src/components/app-sidebar.tsx`, line 67, change:

```typescript
const avatarUrl = getDefaultAvatarUri(displayName)
```

to:

```typescript
const avatarUrl = currentUser?.avatarUrl ?? getDefaultAvatarUri(displayName)
```

**Step 2: Update "View Profile" link**

Change the `<Link to="/">` on line 132 to `<Link to="/settings">`.

**Step 3: Add "Settings" to `SEGMENT_LABELS` in the authenticated layout**

In `src/routes/_authenticated.tsx`, add to the `SEGMENT_LABELS` object (~line 46):

```typescript
settings: 'Settings',
```

**Step 4: Verify build**

Run: `npx tsc -b`
Expected: No type errors (the `/settings` route doesn't exist yet, but TanStack Router won't fail the type-check for this — it will just be a string route).

**Step 5: Commit**

```
feat(sidebar): show real avatar and link to settings page
```

---

### Task 4: Expand `updateProfile` service to accept new fields

**Files:**
- Modify: `src/services/profiles.ts`

**Step 1: Update the `updateProfile` function signature**

Change the `data` parameter type from `{ full_name?: string; invite_status?: string }` to:

```typescript
data: {
  full_name?: string
  first_name?: string
  last_name?: string
  avatar_url?: string | null
  invite_status?: string
}
```

**Step 2: Add a `deleteAvatar` function**

Add a new export to `src/services/profiles.ts`:

```typescript
/**
 * Delete the user's avatar from the storage bucket.
 * Lists all files under the user's folder and removes them.
 */
export async function deleteAvatar(userId: string): Promise<void> {
  const { data: files, error: listError } = await supabase.storage
    .from('avatars')
    .list(userId)

  if (listError) throw listError

  if (files && files.length > 0) {
    const paths = files.map((f) => `${userId}/${f.name}`)
    const { error: removeError } = await supabase.storage
      .from('avatars')
      .remove(paths)

    if (removeError) throw removeError
  }
}
```

**Step 3: Add a `fetchProfile` function**

Add a function to fetch the current user's profile row (for group name resolution on the settings page):

```typescript
/**
 * Fetch a user's profile by ID.
 */
export async function fetchProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, first_name, last_name, avatar_url, role, group_id, is_active')
    .eq('id', userId)
    .single()

  if (error) throw error
  return data
}
```

**Step 4: Verify build**

Run: `npx tsc -b`

**Step 5: Commit**

```
feat(services): expand profile service with delete avatar and fetch profile
```

---

### Task 5: Create the settings page route

**Files:**
- Create: `src/routes/_authenticated/settings.tsx`

**Step 1: Create the route file**

Create `src/routes/_authenticated/settings.tsx`. This file defines the `/settings` route using TanStack Router's `createFileRoute`. It should:

1. Import `createFileRoute` from `@tanstack/react-router`
2. Export `const Route = createFileRoute('/_authenticated/settings')({ component: SettingsPage })`
3. The `SettingsPage` component sets page title to "Settings" via `usePageTitle` in a `useEffect`
4. Renders 4 stacked `Card` sections inside a centered `max-w-2xl` container with vertical spacing

The page structure:

```tsx
function SettingsPage() {
  // Set breadcrumb
  const { setPageTitle } = usePageTitle()
  useEffect(() => { setPageTitle('Settings'); return () => setPageTitle(null) }, [setPageTitle])

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-6">
      <AvatarSection />
      <PersonalInfoSection />
      <EmailSection />
      <PasswordSection />
    </div>
  )
}
```

Each section is a separate component defined in the same file (or extracted later if large).

**Step 2: Implement `AvatarSection`**

- Shows the user's current avatar (large, ~96px) with DiceBear fallback
- "Upload photo" button (file input, hidden, triggered by button click)
- "Remove photo" button (only visible when `avatarUrl` exists)
- File validation: PNG/JPEG/GIF/WebP, max 2MB (same as onboarding)
- On upload: `uploadAvatar()` → `updateUserMetadata({ avatar_url })` → `updateProfile({ avatar_url })`
- On remove: `deleteAvatar()` → `updateUserMetadata({ avatar_url: null })` → `updateProfile({ avatar_url: null })`
- Toast on success/error using `toast` from `sonner` and `mapSupabaseError`
- Loading state on buttons during upload/remove

**Step 3: Implement `PersonalInfoSection`**

- Card with title "Personal Information" and description "Update your name and view your role."
- First name input (required), Last name input (required)
- Role badge (read-only) using Shadcn `Badge`
- Group name (read-only text, fetched via `fetchGroupName` if `currentUser.groupId` exists, else "No group")
- "Save" button
- On save: validate non-empty after trim → `updateUserMetadata({ first_name, last_name, full_name })` → `updateProfile({ full_name, first_name, last_name })`
- Toast on success/error

**Step 4: Implement `EmailSection`**

- Card with title "Email Address"
- Current email displayed as read-only text
- "New email" input field
- Info text: "A confirmation link will be sent to your new email address."
- "Save" button
- On save: validate with `isValidEmail()` → `supabase.auth.updateUser({ email: newEmail })` → toast "Confirmation email sent to [email]"
- The email does NOT change immediately — Supabase sends a confirmation link

**Step 5: Implement `PasswordSection`**

- Card with title "Change Password"
- New password input (min 8 chars), Confirm password input (must match)
- "Save" button
- On save: validate length + match → `updatePassword(newPassword)` → toast "Password updated"
- Clear fields after success

**Step 6: Regenerate route tree**

Run the dev server briefly or `npx tsr generate` (TanStack Router CLI) to regenerate `routeTree.gen.ts` with the new `/settings` route.

**Step 7: Verify build**

Run: `npx tsc -b`
Expected: No type errors.

**Step 8: Commit**

```
feat(settings): add profile settings page with avatar, name, email, and password sections
```

---

### Task 6: Update TODO.md

**Files:**
- Modify: `docs/TODO.md`

**Step 1: Add profile settings items and check them off**

Add a new section to `docs/TODO.md` after the Auth feature section:

```markdown
## Feature: Profile Settings

### Backend
- [x] `avatar_url`, `first_name`, `last_name` columns on profiles table

### Frontend
- [x] Settings page (`/settings`) with avatar, name, email, password sections
- [x] Fix sidebar to show real avatar with DiceBear fallback
- [x] Update "View Profile" link to point to `/settings`
```

**Step 2: Commit**

```
docs(todo): add profile settings feature items
```

---

### Task 7: Final verification

**Step 1: Run full build**

Run: `npm run build`
Expected: Builds successfully with no errors.

**Step 2: Run lint**

Run: `npm run lint`
Expected: No lint errors.

**Step 3: Manual smoke test checklist**

- [ ] Navigate to `/settings` from sidebar dropdown "View Profile"
- [ ] Avatar section shows current avatar or DiceBear fallback
- [ ] Can upload a new avatar, see it update in sidebar
- [ ] Can remove avatar, sidebar falls back to DiceBear
- [ ] Can edit first/last name, see sidebar name update
- [ ] Role badge and group name display correctly (read-only)
- [ ] Can submit email change, see confirmation toast
- [ ] Can change password, fields clear on success
- [ ] Error toasts appear for invalid input
- [ ] Breadcrumb shows "Settings"
