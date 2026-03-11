# First-Run Setup Wizard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace `seed.sql` with a first-run setup wizard (`/setup`) that bootstraps the root admin, bootstrap group, and sample form template via the `bootstrap-root-admin` Edge Function.

**Architecture:** A `SetupProvider` context wraps the app and checks a `SECURITY DEFINER` DB function `is_setup_complete()`. If no root admin exists, all routes redirect to `/setup`. The setup wizard has 3 steps: org + credentials, profile onboarding, and thank-you with auto sign-in. The Edge Function is updated to accept `orgName`, `email`, `password` from the request body and create the sample form template.

**Tech Stack:** React 19, TanStack Router, Supabase (Postgres + Edge Functions + Auth), Shadcn UI, TailwindCSS

---

### Task 1: Database — `is_setup_complete()` function

**Files:**
- Create: `supabase/migrations/20260312100008_add_is_setup_complete_fn.sql`

**Step 1: Write the migration**

```sql
-- Check whether the initial setup has been completed (root admin exists).
-- SECURITY DEFINER so anonymous callers can read this without RLS.
CREATE OR REPLACE FUNCTION public.is_setup_complete()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE role = 'root_admin');
$$;

-- Allow both anonymous and authenticated callers
GRANT EXECUTE ON FUNCTION public.is_setup_complete() TO anon, authenticated;
```

**Step 2: Apply migration locally**

Run: `supabase db reset`
Verify: The function exists and returns `false` (no root admin yet after reset since seed is still active at this point — will be removed in a later task).

**Step 3: Run security advisors**

Use `supabase_get_advisors` (security) to check for issues.

**Step 4: Commit**

```
feat(db): add is_setup_complete() function for first-run detection
```

---

### Task 2: Update Edge Function — accept request body params + create sample form

**Files:**
- Modify: `supabase/functions/bootstrap-root-admin/index.ts`

**Step 1: Update the Edge Function**

Key changes:
1. Read `email`, `password`, `orgName` from the request JSON body instead of env vars
2. Fall back to env vars if body params missing (backward compat for CLI/curl usage)
3. Use `orgName` as the bootstrap group name instead of hardcoded "RoyalHouse Root"
4. After creating root admin + bootstrap group, create a sample form template with 3 sections and 10 fields (all field types)
5. Keep all existing idempotency logic (existing admin → assign bootstrap group if missing)
6. `verify_jwt` will be set to `false` when deploying (handled in a later task)

The sample form template creation should happen only on fresh setup (when `created: true`), not when the function finds an existing admin.

The Edge Function should:
- Parse request body for `{ email, password, orgName }`
- Validate: email and password are required (orgName defaults to "RoyalHouse Root")
- Create bootstrap group with `orgName` as the name
- Create auth user with the provided credentials
- Create profiles row
- Create sample form template (published, sharing_mode='all') with:
  - Section 1: "Text & Numbers" — text (Full Name), textarea (Bio), number (Age)
  - Section 2: "Choices & Ratings" — select (Department), multi_select (Skills), checkbox (Terms), rating (Satisfaction), range (Confidence)
  - Section 3: "Date & Files" — date (Start Date), file (Resume)

**Step 2: Commit**

```
feat(edge): update bootstrap-root-admin to accept body params and create sample form
```

---

### Task 3: Remove seed.sql + disable seeding

**Files:**
- Delete: `supabase/seed.sql`
- Modify: `supabase/config.toml` (line 62: `enabled = false`)

**Step 1: Delete seed.sql**

Remove the file entirely.

**Step 2: Disable seeding in config.toml**

Change line 62 from `enabled = true` to `enabled = false`.

**Step 3: Verify migrations apply cleanly**

Run: `supabase db reset`
Expected: Migrations apply, no seed runs, database is clean with no root admin.

**Step 4: Commit**

```
chore(db): remove seed.sql and disable seeding in config.toml
```

---

### Task 4: Frontend — Setup service layer

**Files:**
- Create: `src/services/setup.ts`

**Step 1: Create the setup service**

```typescript
import { supabase } from './supabase'

/**
 * Check whether the initial setup has been completed (root admin exists).
 * Calls a SECURITY DEFINER function that bypasses RLS.
 */
export async function checkSetupComplete(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_setup_complete')
  if (error) throw error
  return data as boolean
}

/**
 * Bootstrap the root admin and organization via the Edge Function.
 * Returns the response from the Edge Function.
 */
export async function bootstrapRootAdmin(params: {
  email: string
  password: string
  orgName: string
}) {
  const { data, error } = await supabase.functions.invoke('bootstrap-root-admin', {
    body: params,
  })

  if (error) throw error
  return data as { created: boolean; message: string }
}
```

**Step 2: Commit**

```
feat(services): add setup service for first-run detection and bootstrap
```

---

### Task 5: Frontend — SetupProvider context + useSetup hook

**Files:**
- Create: `src/hooks/use-setup.ts`
- Create: `src/components/setup-provider.tsx`

**Step 1: Create the hook**

The `useSetupProvider` hook:
- Calls `checkSetupComplete()` on mount
- Exposes `{ isSetupComplete: boolean | null, isLoading: boolean, refresh: () => void }`
- `refresh()` re-runs the check (called after wizard completes)

The `useSetup` consumer hook reads from context.

**Step 2: Create the provider component**

Simple wrapper that renders `SetupContext.Provider`.

**Step 3: Commit**

```
feat(setup): add SetupProvider context and useSetup hook
```

---

### Task 6: Frontend — Wire SetupProvider into app + update router context

**Files:**
- Modify: `src/main.tsx` — wrap `AuthProvider` with `SetupProvider`
- Modify: `src/routes/__root.tsx` — add `setup` to `RouterContext`

**Step 1: Update main.tsx**

Wrap the render tree: `StrictMode > SetupProvider > AuthProvider > InnerApp`.

Pass `setup` context into the router alongside `auth`:
```typescript
function InnerApp() {
  const auth = useAuth()
  const setup = useSetup()
  return <RouterProvider router={router} context={{ auth, setup }} />
}
```

**Step 2: Update __root.tsx**

Add `setup` to `RouterContext`:
```typescript
import type { SetupContextValue } from '../hooks/use-setup'

export interface RouterContext {
  auth: AuthContextValue
  setup: SetupContextValue
}
```

Update the router creator to include `setup: undefined!` in the default context.

**Step 3: Commit**

```
feat(setup): wire SetupProvider into app and router context
```

---

### Task 7: Frontend — Route guards for setup detection

**Files:**
- Modify: `src/routes/login.tsx` — add setup redirect in `beforeLoad`
- Modify: `src/routes/forgot-password.tsx` — add setup redirect in `beforeLoad`
- Modify: `src/routes/reset-password.tsx` — add setup redirect in `beforeLoad`
- Modify: `src/routes/invite/accept.tsx` — add setup redirect in `beforeLoad`
- Modify: `src/routes/_authenticated.tsx` — add setup redirect in `beforeLoad`

**Step 1: Add setup guard to public routes**

For `/login`, `/forgot-password`, `/reset-password`, `/invite/accept`:
```typescript
beforeLoad: ({ context }) => {
  if (context.setup.isSetupComplete === false) {
    throw redirect({ to: '/setup' })
  }
  // ... existing guards
}
```

For `/_authenticated`:
```typescript
beforeLoad: ({ context }) => {
  if (context.setup.isSetupComplete === false) {
    throw redirect({ to: '/setup' })
  }
  // ... existing auth guards
}
```

**Step 2: Commit**

```
feat(routing): add setup detection guards to all routes
```

---

### Task 8: Frontend — `/setup` route (3-step wizard)

**Files:**
- Create: `src/routes/setup.tsx`

**Step 1: Create the setup page**

A multi-step wizard with steps: `org-setup` | `onboarding` | `thank-you`.

**`beforeLoad` guard:**
```typescript
beforeLoad: ({ context }) => {
  if (context.setup.isSetupComplete === true) {
    throw redirect({ to: '/login' })
  }
}
```

**Step 1 — OrgSetupStep:**
- Organization name input (required)
- Email input (required, validated with `isValidEmail()`)
- Password input (required, min 8 chars)
- Confirm password input (must match)
- "Continue" button → calls `bootstrapRootAdmin({ email, password, orgName })`
- On success → move to step 2
- Stores email + password in component state for auto sign-in later

**Step 2 — OnboardingStep:**
- Reuse the exact same layout/pattern as the invite acceptance `OnboardingStep`
- First name, last name, avatar upload
- On "Continue": auto sign-in with `signIn(email, password)`, then update user metadata + profiles
- On success → move to step 3

**Step 3 — ThankYouStep:**
- Success message: "Your organization is ready"
- "Get Started" button → call `setup.refresh()` to update the context, then navigate to `/`

The page follows the same visual style as `/invite/accept` — centered layout, Card components, same button state pattern.

**Step 2: Generate route tree**

After creating the file, TanStack Router auto-generates the route. Run `npm run dev` briefly or the codegen command if available.

**Step 3: Commit**

```
feat(setup): add /setup route with 3-step first-run wizard
```

---

### Task 9: Update TypeScript types for the RPC function

**Files:**
- Modify: `src/types/database.ts` (regenerated)

**Step 1: Regenerate types**

Run: `supabase gen types typescript --local 2>/dev/null > src/types/database.ts`

This ensures `supabase.rpc('is_setup_complete')` is properly typed.

**Step 2: Commit**

```
chore(types): regenerate database types for is_setup_complete RPC
```

---

### Task 10: Deploy Edge Function with verify_jwt disabled

**Files:**
- Edge Function deployment config

**Step 1: Deploy locally for testing**

The Edge Function needs `verify_jwt: false`. When deploying via MCP or CLI, set this flag.

For local testing with `supabase functions serve`, the function is already accessible.

**Step 2: Test the full flow locally**

1. `supabase db reset` — clean database
2. `supabase functions serve` — serve Edge Functions
3. `npm run dev` — open browser
4. Verify: app redirects to `/setup`
5. Complete the wizard: enter org name, email, password
6. Verify: onboarding step appears
7. Enter name, optionally upload avatar
8. Verify: thank-you step appears, click "Get Started"
9. Verify: redirected to dashboard, signed in
10. Verify: sample form template exists in the forms list
11. Verify: navigating to `/setup` redirects to `/login`

**Step 3: Commit (if any fixes needed)**

---

### Task 11: Cleanup — remove ROOT_ADMIN env var references

**Files:**
- Modify: `supabase-changes.local` — remove ROOT_ADMIN env var items
- Modify: `.env.local` — remove ROOT_ADMIN_EMAIL and ROOT_ADMIN_PASSWORD (if present)

**Step 1: Update supabase-changes.local**

Remove the checklist items for `ROOT_ADMIN_EMAIL` and `ROOT_ADMIN_PASSWORD` since they're no longer needed.

**Step 2: Commit**

```
chore: remove ROOT_ADMIN env var references
```

---

### Task 12: Update docs/TODO.md

**Files:**
- Modify: `docs/TODO.md`

**Step 1: Update the TODO list**

Add a "Feature: First-Run Setup" section and mark items as complete. Update any references to seed.sql or bootstrap.

**Step 2: Commit**

```
docs(todo): add first-run setup wizard items
```
