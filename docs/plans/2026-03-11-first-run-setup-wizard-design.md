# First-Run Setup Wizard Design

**Date**: 2026-03-11
**Status**: Approved

## Problem

The app currently bootstraps the root admin via `seed.sql` (local only) and the `bootstrap-root-admin` Edge Function (remote, manual curl). This creates two divergent paths and requires hardcoded credentials in environment variables. The seed file directly inserts into `auth.users` and `auth.identities`, which is brittle.

## Solution

Replace `seed.sql` with a first-run setup wizard built into the app. The very first visitor sees a `/setup` page where they configure their organization and root admin account. The `bootstrap-root-admin` Edge Function handles all backend work.

## Detection & Routing

### Setup detection

A PostgreSQL function `is_setup_complete()` checks whether any `profiles` row with `role = 'root_admin'` exists. Defined as `SECURITY DEFINER` so it runs as the function owner (bypasses RLS for anonymous callers).

```sql
CREATE OR REPLACE FUNCTION public.is_setup_complete()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE role = 'root_admin');
$$;

GRANT EXECUTE ON FUNCTION public.is_setup_complete() TO anon, authenticated;
```

### Frontend context

A `SetupProvider` React context wraps the entire app (above `AuthProvider`). On mount, it calls `supabase.rpc('is_setup_complete')` and exposes:

```typescript
interface SetupContext {
  isSetupComplete: boolean | null  // null = loading
  isLoading: boolean
  refresh: () => void              // re-check after wizard completes
}
```

### Route guards

| Route | Guard |
|---|---|
| `/setup` | If `isSetupComplete === true` -> redirect to `/login` |
| `/login`, `/forgot-password`, `/reset-password`, `/invite/accept` | If `isSetupComplete === false` -> redirect to `/setup` |
| `/_authenticated/*` | Existing auth guard (no session -> `/login`, which then redirects to `/setup` if needed) |

## Setup Wizard Steps

### Step 1: Organization & Credentials

Fields:
- **Organization name** (text, required) — becomes the bootstrap group name
- **Email** (email, required, validated with `isValidEmail()`)
- **Password** (password, required, min 8 chars)
- **Confirm password** (must match)

On "Continue": calls `bootstrap-root-admin` Edge Function with `{ email, password, orgName }`.

### Step 2: Profile Onboarding

Fields:
- **First name** (text, required)
- **Last name** (text, required)
- **Profile picture** (avatar upload, optional)

On "Continue": auto sign-in with credentials from Step 1, then update `user_metadata` and `profiles` table with name/avatar.

### Step 3: Thank You

- Success message with org name and email
- "Get Started" button -> navigate to `/` (already signed in)

## Edge Function Changes

### `bootstrap-root-admin`

**Before**: reads `ROOT_ADMIN_EMAIL` and `ROOT_ADMIN_PASSWORD` from env vars. Hardcodes group name as "RoyalHouse Root". Requires JWT (`verify_jwt: true`).

**After**:
- Accepts `email`, `password`, `orgName` from the request body
- Uses `orgName` for the bootstrap group name (defaults to "RoyalHouse Root" if not provided)
- `verify_jwt: false` — no users exist during first-run, and the function self-guards (checks for existing root_admin)
- Creates a **sample form template** in the bootstrap group after creating the root admin
- Keeps all existing idempotency logic (existing admin -> assign bootstrap group if missing)

### Org name access for other Edge Functions

Any Edge Function needing the org name queries:
```sql
SELECT name FROM groups WHERE is_bootstrap = true LIMIT 1
```

No additional infrastructure needed.

## Sample Form Template

Created by the Edge Function during setup. Contains:
- 3 sections (Text & Numbers, Choices & Ratings, Date & Files)
- 10 fields covering all field types (text, textarea, number, select, multi_select, checkbox, rating, range, date, file)
- Published status, sharing_mode = 'all'
- `created_by` = root admin user ID

## Cleanup

### Removed
- `supabase/seed.sql` — deleted
- `config.toml` `[db.seed]` — set `enabled = false`
- `ROOT_ADMIN_EMAIL` and `ROOT_ADMIN_PASSWORD` env var dependencies
- Demo Group from seed data

### Added
- Migration: `is_setup_complete()` function
- Frontend: `/setup` route, `SetupProvider` context
- Updated route guards on public routes

## Local Dev Workflow (after change)

1. `supabase db reset` — applies migrations, no seed
2. `supabase functions serve` — serves Edge Functions locally
3. `npm run dev` — open browser
4. App detects no root_admin -> redirects to `/setup`
5. Complete wizard -> root admin created, signed in, on dashboard

Same flow works on remote after `supabase db push` + `supabase functions deploy`.
