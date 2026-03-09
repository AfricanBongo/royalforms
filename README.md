# RoyalForms

Internal web application for structured form creation, collaborative form filling, and reporting.

> **Status**: Pre-release (`v0.2.x`) — under active development. Not yet production-ready.

## Features

- **Role-based access** — Root Admin, Admin, Editor, and Viewer roles with server-side RBAC
- **Group management** — organize members into groups with invite workflows
- **Invite lifecycle** — email invitations with resend, change-email, and deletion; tiered rate limiting
- **Form templates** — structured form definitions with sections, fields, and version control
- **Collaborative filling** — field-level assignment so multiple editors contribute to a single form instance
- **Reporting** — export and review submitted form data

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | [React 19](https://react.dev), [TypeScript 5.9](https://www.typescriptlang.org), [Vite 7](https://vite.dev) |
| Routing | [TanStack Router](https://tanstack.com/router) |
| UI | [Shadcn UI](https://ui.shadcn.com), [Tailwind CSS 4](https://tailwindcss.com), [Radix UI](https://www.radix-ui.com) |
| Backend | [Supabase](https://supabase.com) (Auth, Database, Storage, Edge Functions) |
| Database | PostgreSQL with Row Level Security |
| Icons | [Lucide React](https://lucide.dev) |
| Avatars | [DiceBear Thumbs](https://www.dicebear.com/styles/thumbs/) |

## Prerequisites

- [Node.js](https://nodejs.org) v25+
- [Docker](https://www.docker.com) (for local Supabase)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (installed as a dev dependency)

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/AfricanBongo/royalforms.git
cd royalforms
npm install
```

### 2. Start local Supabase

```bash
npx supabase start
```

This spins up PostgreSQL, Auth, Storage, Edge Functions, and a local email server (Mailpit) via Docker. On first run it will download the required images.

### 3. Create environment files

```bash
# Frontend env (Vite)
cp .env.example .env.local

# Edge Functions env
cp supabase/functions/.env.example supabase/functions/.env
```

Fill in the values printed by `supabase start` (API URL, anon key, service role key).

### 4. Apply migrations and seed data

```bash
npx supabase db reset
```

This applies all migrations in `supabase/migrations/` and runs `supabase/seed.sql` to bootstrap the Root Admin account.

### 5. Start the dev server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | Type-check and build for production |
| `npm run lint` | Lint all TypeScript files |
| `npm run preview` | Preview the production build locally |
| `npm run release` | Bump version (auto-detect from commits) |
| `npm run release:patch` | Force a patch version bump |
| `npm run release:minor` | Force a minor version bump |
| `npm run release:dry` | Preview version bump without changes |

## Project Structure

```
src/
  components/    # Reusable UI components (Shadcn UI wrappers)
  features/      # Feature modules
  hooks/         # Custom React hooks
  services/      # Supabase client, API access
  lib/           # Utilities (validation, error mapping, avatars)
  types/         # Shared TypeScript types
  routes/        # TanStack Router file-based routes

supabase/
  config.toml    # Local Supabase configuration
  migrations/    # Timestamped SQL migration files
  functions/     # Deno Edge Functions
  templates/     # Custom email templates
  seed.sql       # Seed data (Root Admin bootstrap)
```

## Database Migrations

All schema changes live in `supabase/migrations/` as timestamped SQL files. Never edit a migration that has been applied to remote.

```bash
# Create a new migration
npx supabase migration new <name>

# Apply all migrations from scratch
npx supabase db reset

# Generate TypeScript types from the local schema
npx supabase gen types typescript --local 2>/dev/null > src/types/database.ts
```

## Edge Functions

Edge Functions run on Deno and are located in `supabase/functions/`. They handle operations that require the service role key (auth admin actions).

| Function | Purpose |
|---|---|
| `bootstrap-root-admin` | Creates the initial Root Admin account |
| `invite-user` | Invites a new user via email |
| `manage-invite` | Resend, change email, or delete pending invites |
| `update-user-role` | Updates a user's role |

```bash
# Serve locally for testing
npx supabase functions serve

# Deploy to remote
npx supabase functions deploy
```

## Versioning

Uses [Semantic Versioning](https://semver.org/) with [Conventional Commits](https://www.conventionalcommits.org/). Version bumps are automated via [`commit-and-tag-version`](https://github.com/absolute-version/commit-and-tag-version).

## Contributing

This is a private internal project. See [`AGENTS.md`](./AGENTS.md) for development guidelines, coding standards, and architectural decisions.
