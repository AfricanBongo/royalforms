# Auth Frontend Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Set up Shadcn blue theme, min-width gate, Supabase client, auth hooks, and protected routing infrastructure.

**Architecture:** TanStack Router with `createRootRouteWithContext` for auth context injection. Auth state managed via a React context that wraps the router. Supabase client SDK for all frontend operations. RLS handles authorization.

**Tech Stack:** React 19, TanStack Router, Supabase JS Client, Shadcn UI, Tailwind v4, OKLCH colors

---

### Task 1: Update Shadcn theme to blue (Figma match)

**Files:**
- Modify: `src/index.css`
- Modify: `index.html` (add Geist font)

**Step 1: Update CSS variables in `src/index.css`**

Replace the `:root` and `.dark` blocks with blue-tinted values matching Figma:
- `--primary`: `oklch(0.282 0.127 264.052)` (Figma `#1e3a8a` blue-900)
- `--primary-foreground`: `oklch(0.97 0.014 254.604)` (Figma `#eff6ff` blue-50)
- `--foreground`: `oklch(0.208 0.106 265.755)` (Figma `#172554` blue-950)
- `--ring`: `oklch(0.488 0.243 264.376)` (blue-600 for focus rings)
- `--sidebar-primary`: same as primary
- Keep neutral grays for secondary/muted/accent/border (matching Figma neutral tokens)

**Step 2: Add Geist font to `index.html`**

Add Google Fonts / Fontsource link for Geist. Add `font-family: 'Geist', sans-serif` to body via Tailwind theme.

**Step 3: Verify build**

Run: `npx tsc -b && npm run build`

---

### Task 2: Add min-width 720px screen gate

**Files:**
- Create: `src/components/min-width-gate.tsx`
- Modify: `src/routes/__root.tsx`

**Step 1: Create the gate component**

A component that uses CSS `min-width: 720px` media query. Below 720px shows a centered message. Above 720px renders children.

**Step 2: Wrap `<Outlet />` in `__root.tsx` with the gate**

**Step 3: Verify build**

Run: `npx tsc -b && npm run build`

---

### Task 3: Set up Supabase client

**Files:**
- Create: `src/services/supabase.ts`

**Step 1: Create the client module**

```typescript
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
```

**Step 2: Verify build**

Run: `npx tsc -b && npm run build`

---

### Task 4: Create auth context and hooks

**Files:**
- Create: `src/hooks/use-auth.ts`
- Create: `src/hooks/use-current-user.ts`
- Modify: `src/main.tsx` (wrap with auth provider)
- Modify: `src/routes/__root.tsx` (inject auth into router context)

**Step 1: Create `useAuth` hook / context**

- AuthProvider that wraps the app
- Manages session state via `supabase.auth.onAuthStateChange`
- Exposes: `session`, `user`, `isLoading`, `signIn`, `signOut`

**Step 2: Create `useCurrentUser` hook**

- Reads `user_metadata` from auth context user
- Returns: `role`, `groupId`, `isActive`, `fullName`

**Step 3: Update `__root.tsx` to use `createRootRouteWithContext`**

- Define router context interface with auth state
- Pass auth context to router via `routerContext` prop

**Step 4: Update `main.tsx`**

- Wrap `RouterProvider` with `AuthProvider`
- Pass auth to router context

**Step 5: Verify build**

Run: `npx tsc -b && npm run build`

---

### Task 5: Create protected route layout

**Files:**
- Create: `src/routes/_authenticated.tsx` (layout route)

**Step 1: Create the authenticated layout route**

Uses `beforeLoad` to check auth context. If not authenticated, redirects to `/login`. If `is_active === false`, shows disabled message.

**Step 2: Verify build**

Run: `npx tsc -b && npm run build`

---

### Task 6: Create login route stub

**Files:**
- Create: `src/routes/login.tsx`

**Step 1: Create minimal login route**

Placeholder page with "Login" heading. Actual UI will be built from Figma in a follow-up task (user will select the screen).

**Step 2: Verify build**

Run: `npx tsc -b && npm run build`

---

### Task 7: Move index page under authenticated layout

**Files:**
- Move: `src/routes/index.tsx` -> `src/routes/_authenticated/index.tsx`

The dashboard/index route should be behind the auth gate.

**Step 1: Move the file and update the route path**

**Step 2: Verify build and routing**

Run: `npx tsc -b && npm run build`
