# Form Instances Backend Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create all database tables, RLS policies, triggers, indexes, the `on-instance-created` Edge Function (Shlink URL shortening), and the `create_scheduled_instances` pg_cron job for the form instances feature.

**Architecture:** Four new tables (`form_instances`, `field_values`, `instance_schedules`, `schedule_group_targets`) with RLS policies matching the system design. A database trigger on `form_instances` INSERT invokes an Edge Function via `pg_net` to generate short URLs through the Shlink JS SDK. A `pg_cron` job creates recurring instances.

**Tech Stack:** PostgreSQL, Supabase Edge Functions (Deno), Shlink JS SDK (`@shlinkio/shlink-js-sdk`), `pg_net`, `pg_cron`

---

## Task 1: Create `form_instances` table + RLS policies

**Files:**
- Create: `supabase/migrations/20260310000001_create_form_instances_table.sql`

**Step 1: Write migration file**

```sql
-- form_instances: runtime copy of a template version, owned by a group
-- Root Admin creates one-time instances. pg_cron creates scheduled instances (via service role).
CREATE TABLE public.form_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  readable_id TEXT NOT NULL UNIQUE,
  template_version_id UUID NOT NULL REFERENCES public.template_versions(id),
  group_id UUID NOT NULL REFERENCES public.groups(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  is_archived BOOLEAN NOT NULL DEFAULT false,
  short_url_view TEXT,
  short_url_edit TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  submitted_by UUID REFERENCES public.profiles(id),
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.form_instances ENABLE ROW LEVEL SECURITY;

-- SELECT: Root Admin sees all. Others see instances belonging to their group.
CREATE POLICY form_instances_select ON public.form_instances
FOR SELECT USING (
  is_active_user() = true
  AND (
    get_current_user_role() = 'root_admin'
    OR group_id = get_current_user_group_id()
  )
);

-- INSERT: Root Admin only (one-time instances).
-- Scheduled instances created by pg_cron via service role key (bypasses RLS).
CREATE POLICY form_instances_insert ON public.form_instances
FOR INSERT WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

-- UPDATE (submit): Admin of owning group can submit draft instances.
CREATE POLICY form_instances_update_submit ON public.form_instances
FOR UPDATE USING (
  is_active_user() = true
  AND get_current_user_role() = 'admin'
  AND group_id = get_current_user_group_id()
  AND status = 'draft'
);

-- UPDATE (root admin): Can archive instances.
CREATE POLICY form_instances_update_root_admin ON public.form_instances
FOR UPDATE USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);
```

**Step 2: Apply migration**

Run via Supabase MCP: `supabase_apply_migration` with name `create_form_instances_table`.

**Step 3: Verify**

Run `supabase_list_tables` (verbose) and `supabase_get_advisors` (security).

---

## Task 2: Create `field_values` table + RLS policies

**Files:**
- Create: `supabase/migrations/20260310000002_create_field_values_table.sql`

**Step 1: Write migration file**

```sql
-- field_values: lazily created rows for field data in form instances
-- Created on first edit or on field assignment. Append-only change_log for audit trail.
CREATE TABLE public.field_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_instance_id UUID NOT NULL REFERENCES public.form_instances(id),
  template_field_id UUID NOT NULL REFERENCES public.template_fields(id),
  value TEXT,
  updated_by UUID NOT NULL REFERENCES public.profiles(id),
  assigned_to UUID REFERENCES public.profiles(id),
  assigned_by UUID REFERENCES public.profiles(id),
  change_log JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (form_instance_id, template_field_id)
);

ALTER TABLE public.field_values ENABLE ROW LEVEL SECURITY;

-- SELECT: Root Admin sees all. Others see values for instances in their group.
CREATE POLICY field_values_select ON public.field_values
FOR SELECT USING (
  is_active_user() = true
  AND (
    get_current_user_role() = 'root_admin'
    OR EXISTS (
      SELECT 1 FROM public.form_instances fi
      WHERE fi.id = field_values.form_instance_id
      AND fi.group_id = get_current_user_group_id()
    )
  )
);

-- INSERT: Admin/Editor of owning group, instance must be draft.
CREATE POLICY field_values_insert ON public.field_values
FOR INSERT WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() IN ('admin', 'editor')
  AND EXISTS (
    SELECT 1 FROM public.form_instances fi
    WHERE fi.id = field_values.form_instance_id
    AND fi.group_id = get_current_user_group_id()
    AND fi.status = 'draft'
  )
);

-- UPDATE (open field): Unassigned field, Admin/Editor of owning group, draft instance.
CREATE POLICY field_values_update_open ON public.field_values
FOR UPDATE USING (
  is_active_user() = true
  AND assigned_to IS NULL
  AND get_current_user_role() IN ('admin', 'editor')
  AND EXISTS (
    SELECT 1 FROM public.form_instances fi
    WHERE fi.id = field_values.form_instance_id
    AND fi.group_id = get_current_user_group_id()
    AND fi.status = 'draft'
  )
);

-- UPDATE (assigned field): Only the assigned editor can edit.
CREATE POLICY field_values_update_assigned ON public.field_values
FOR UPDATE USING (
  is_active_user() = true
  AND assigned_to IS NOT NULL
  AND assigned_to = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.form_instances fi
    WHERE fi.id = field_values.form_instance_id
    AND fi.status = 'draft'
  )
);

-- UPDATE (admin assign): Admin of owning group can assign/reassign/unassign fields.
CREATE POLICY field_values_update_admin_assign ON public.field_values
FOR UPDATE USING (
  is_active_user() = true
  AND get_current_user_role() = 'admin'
  AND EXISTS (
    SELECT 1 FROM public.form_instances fi
    WHERE fi.id = field_values.form_instance_id
    AND fi.group_id = get_current_user_group_id()
    AND fi.status = 'draft'
  )
);
```

**Step 2: Apply migration**

Run via Supabase MCP: `supabase_apply_migration` with name `create_field_values_table`.

**Step 3: Verify**

Run `supabase_list_tables` (verbose) and `supabase_get_advisors` (security).

---

## Task 3: Create `instance_schedules` table + RLS policies

**Files:**
- Create: `supabase/migrations/20260310000003_create_instance_schedules_table.sql`

**Step 1: Write migration file**

```sql
-- instance_schedules: one schedule per template for recurring instance creation
-- Root Admin manages schedules. pg_cron executes them.
CREATE TABLE public.instance_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL UNIQUE REFERENCES public.form_templates(id),
  start_date DATE NOT NULL,
  repeat_interval TEXT NOT NULL CHECK (repeat_interval IN ('daily', 'weekly', 'bi_weekly', 'monthly')),
  repeat_every INTEGER NOT NULL DEFAULT 1,
  days_of_week JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ NOT NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.instance_schedules ENABLE ROW LEVEL SECURITY;

-- SELECT: Root Admin sees all. Others see schedules for templates they can access.
CREATE POLICY instance_schedules_select ON public.instance_schedules
FOR SELECT USING (
  is_active_user() = true
  AND (
    get_current_user_role() = 'root_admin'
    OR EXISTS (
      SELECT 1 FROM public.form_templates ft
      WHERE ft.id = instance_schedules.template_id
      AND ft.is_active = true
      AND (
        ft.sharing_mode = 'all'
        OR EXISTS (
          SELECT 1 FROM public.template_group_access tta
          WHERE tta.template_id = ft.id
          AND tta.group_id = get_current_user_group_id()
        )
      )
    )
  )
);

-- INSERT: Root Admin only.
CREATE POLICY instance_schedules_insert ON public.instance_schedules
FOR INSERT WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

-- UPDATE: Root Admin only.
CREATE POLICY instance_schedules_update ON public.instance_schedules
FOR UPDATE USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);
```

**Step 2: Apply migration**

Run via Supabase MCP: `supabase_apply_migration` with name `create_instance_schedules_table`.

**Step 3: Verify**

Run `supabase_list_tables` (verbose) and `supabase_get_advisors` (security).

---

## Task 4: Create `schedule_group_targets` table + RLS policies

**Files:**
- Create: `supabase/migrations/20260310000004_create_schedule_group_targets_table.sql`

**Step 1: Write migration file**

```sql
-- schedule_group_targets: which groups receive instances from a schedule
CREATE TABLE public.schedule_group_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES public.instance_schedules(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.groups(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (schedule_id, group_id)
);

ALTER TABLE public.schedule_group_targets ENABLE ROW LEVEL SECURITY;

-- SELECT: Root Admin sees all. Others see rows for their group.
CREATE POLICY schedule_group_targets_select ON public.schedule_group_targets
FOR SELECT USING (
  is_active_user() = true
  AND (
    get_current_user_role() = 'root_admin'
    OR group_id = get_current_user_group_id()
  )
);

-- INSERT: Root Admin only.
CREATE POLICY schedule_group_targets_insert ON public.schedule_group_targets
FOR INSERT WITH CHECK (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);

-- DELETE: Root Admin only (remove group from schedule).
CREATE POLICY schedule_group_targets_delete ON public.schedule_group_targets
FOR DELETE USING (
  is_active_user() = true
  AND get_current_user_role() = 'root_admin'
);
```

**Step 2: Apply migration**

Run via Supabase MCP: `supabase_apply_migration` with name `create_schedule_group_targets_table`.

**Step 3: Verify**

Run `supabase_list_tables` (verbose) and `supabase_get_advisors` (security).

---

## Task 5: Apply `updated_at` triggers + add FK indexes

**Files:**
- Create: `supabase/migrations/20260310000005_apply_updated_at_triggers_form_instances.sql`
- Create: `supabase/migrations/20260310000006_add_form_instance_indexes.sql`

**Step 1: Write triggers migration**

```sql
-- Apply update_updated_at trigger to form instance tables
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.form_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.field_values
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.instance_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();
```

**Step 2: Write indexes migration**

```sql
-- Indexes on FK columns for form instance tables (performance)
-- form_instances
CREATE INDEX idx_form_instances_template_version_id ON public.form_instances(template_version_id);
CREATE INDEX idx_form_instances_group_id ON public.form_instances(group_id);
CREATE INDEX idx_form_instances_created_by ON public.form_instances(created_by);
CREATE INDEX idx_form_instances_submitted_by ON public.form_instances(submitted_by);
CREATE INDEX idx_form_instances_status ON public.form_instances(status);

-- field_values (unique constraint on form_instance_id + template_field_id already creates an index)
CREATE INDEX idx_field_values_updated_by ON public.field_values(updated_by);
CREATE INDEX idx_field_values_assigned_to ON public.field_values(assigned_to);

-- instance_schedules (template_id has UNIQUE constraint, already indexed)
CREATE INDEX idx_instance_schedules_created_by ON public.instance_schedules(created_by);

-- schedule_group_targets (unique constraint on schedule_id + group_id already creates an index)
-- No additional indexes needed.
```

**Step 3: Apply both migrations**

Run via Supabase MCP.

**Step 4: Verify**

Run `supabase_get_advisors` (security + performance).

---

## Task 6: Create `trigger_on_form_instance_created` database trigger (pg_net -> Edge Function)

**Files:**
- Create: `supabase/migrations/20260310000007_create_form_instance_created_trigger.sql`

**Step 1: Write migration file**

This trigger fires AFTER INSERT on `form_instances` and calls the `on-instance-created` Edge Function via `pg_net.http_post`. It sends the new row's `id` and `readable_id` in the payload.

```sql
-- Database trigger: call on-instance-created Edge Function via pg_net after form instance INSERT
CREATE OR REPLACE FUNCTION public.trigger_on_form_instance_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  edge_function_url TEXT;
  service_role_key TEXT;
  payload JSONB;
BEGIN
  edge_function_url := current_setting('app.settings.edge_function_url', true);
  service_role_key := current_setting('app.settings.service_role_key', true);

  payload := jsonb_build_object(
    'record', jsonb_build_object(
      'id', NEW.id,
      'readable_id', NEW.readable_id
    )
  );

  PERFORM net.http_post(
    url := edge_function_url || '/on-instance-created',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    )::jsonb,
    body := payload
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_on_form_instance_created
  AFTER INSERT ON public.form_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_on_form_instance_created();
```

**Step 2: Apply migration**

Run via Supabase MCP.

**Step 3: Verify**

Run `supabase_list_tables` and check trigger exists.

**Note:** The `app.settings.edge_function_url` and `app.settings.service_role_key` must be set in `supabase/config.toml` or via `ALTER DATABASE` for local dev. Check how existing triggers handle this pattern.

---

## Task 7: Create `on-instance-created` Edge Function (Shlink URL shortening)

**Files:**
- Create: `supabase/functions/on-instance-created/index.ts`

**Step 1: Write Edge Function**

```typescript
import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import { ShlinkApiClient } from "@shlinkio/shlink-js-sdk";
import { FetchHttpClient } from "@shlinkio/shlink-js-sdk/fetch";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } },
    );
  }

  console.info("[on-instance-created] Request received");

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SB_SECRET_KEY") ?? "";
    const shlinkBaseUrl = Deno.env.get("SHLINK_BASE_URL") ?? "";
    const shlinkApiKey = Deno.env.get("SHLINK_API_KEY") ?? "";
    const appBaseUrl = Deno.env.get("APP_BASE_URL") ?? "";

    const body = await req.json();
    const { record } = body;

    if (!record?.id || !record?.readable_id) {
      console.error("[on-instance-created] Missing record data:", body);
      return new Response(
        JSON.stringify({ error: "Missing record data" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const { id, readable_id } = record;
    console.info(`[on-instance-created] Processing instance: ${readable_id} (${id})`);

    // Initialize Shlink client
    const shlinkClient = new ShlinkApiClient(
      new FetchHttpClient(),
      { baseUrl: shlinkBaseUrl, apiKey: shlinkApiKey },
    );

    // Generate short URLs for view and edit
    const viewLongUrl = `${appBaseUrl}/forms/${readable_id}/view`;
    const editLongUrl = `${appBaseUrl}/forms/${readable_id}/fill`;

    const [viewShortUrl, editShortUrl] = await Promise.all([
      shlinkClient.createShortUrl({
        longUrl: viewLongUrl,
        customSlug: `${readable_id}/view`,
      }),
      shlinkClient.createShortUrl({
        longUrl: editLongUrl,
        customSlug: `${readable_id}/edit`,
      }),
    ]);

    console.info(`[on-instance-created] Short URLs created: view=${viewShortUrl.shortUrl}, edit=${editShortUrl.shortUrl}`);

    // Update the form_instances row with the short URLs
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { error: updateError } = await supabase
      .from("form_instances")
      .update({
        short_url_view: viewShortUrl.shortUrl,
        short_url_edit: editShortUrl.shortUrl,
      })
      .eq("id", id);

    if (updateError) {
      console.error("[on-instance-created] Failed to update instance:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update instance with short URLs" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    console.info(`[on-instance-created] Instance ${readable_id} updated with short URLs`);
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[on-instance-created] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
```

**Step 2: Add environment variables to `.env.local` (gitignored)**

Add to `supabase/functions/.env`:
```
SHLINK_BASE_URL=http://localhost:8080
SHLINK_API_KEY=your-shlink-api-key
APP_BASE_URL=http://localhost:5173
```

**Step 3: Track in `supabase-changes.local`**

Add checklist item for remote deployment:
- Set `SHLINK_BASE_URL`, `SHLINK_API_KEY`, `APP_BASE_URL` as Edge Function secrets on remote

---

## Task 8: Create `create_scheduled_instances` pg_cron job

**Files:**
- Create: `supabase/migrations/20260310000008_create_scheduled_instances_cron.sql`

**Step 1: Write migration file**

```sql
-- pg_cron job: create scheduled form instances
-- Runs every 5 minutes, checks instance_schedules for due schedules.
-- For each due schedule, creates a form_instance for each target group.

CREATE OR REPLACE FUNCTION public.create_scheduled_instances()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  schedule RECORD;
  target RECORD;
  latest_version_id UUID;
  new_counter INTEGER;
  template_abbrev TEXT;
  new_readable_id TEXT;
  next_run TIMESTAMPTZ;
BEGIN
  -- Find all active schedules that are due
  FOR schedule IN
    SELECT s.*, ft.id AS ft_id, ft.abbreviation, ft.instance_counter
    FROM public.instance_schedules s
    JOIN public.form_templates ft ON ft.id = s.template_id
    WHERE s.is_active = true
      AND s.next_run_at <= now()
      AND ft.is_active = true
  LOOP
    -- Get the latest template version
    SELECT id INTO latest_version_id
    FROM public.template_versions
    WHERE template_id = schedule.ft_id AND is_latest = true
    LIMIT 1;

    IF latest_version_id IS NULL THEN
      RAISE WARNING 'No latest version found for template %', schedule.ft_id;
      CONTINUE;
    END IF;

    template_abbrev := schedule.abbreviation;

    -- Create an instance for each target group
    FOR target IN
      SELECT group_id FROM public.schedule_group_targets
      WHERE schedule_id = schedule.id
    LOOP
      -- Increment the instance counter atomically
      UPDATE public.form_templates
      SET instance_counter = instance_counter + 1
      WHERE id = schedule.ft_id
      RETURNING instance_counter INTO new_counter;

      new_readable_id := template_abbrev || '-' || lpad(new_counter::text, 3, '0');

      INSERT INTO public.form_instances (
        readable_id,
        template_version_id,
        group_id,
        status,
        created_by
      ) VALUES (
        new_readable_id,
        latest_version_id,
        target.group_id,
        'draft',
        schedule.created_by
      );
    END LOOP;

    -- Compute next_run_at based on interval
    next_run := CASE schedule.repeat_interval
      WHEN 'daily' THEN schedule.next_run_at + (schedule.repeat_every || ' days')::interval
      WHEN 'weekly' THEN schedule.next_run_at + (schedule.repeat_every * 7 || ' days')::interval
      WHEN 'bi_weekly' THEN schedule.next_run_at + (schedule.repeat_every * 14 || ' days')::interval
      WHEN 'monthly' THEN schedule.next_run_at + (schedule.repeat_every || ' months')::interval
    END;

    -- Update schedule
    UPDATE public.instance_schedules
    SET last_run_at = now(), next_run_at = next_run
    WHERE id = schedule.id;
  END LOOP;
END;
$$;

-- Schedule the cron job to run every 5 minutes
SELECT cron.schedule(
  'create_scheduled_instances',
  '*/5 * * * *',
  $$ SELECT public.create_scheduled_instances() $$
);
```

**Step 2: Apply migration**

Run via Supabase MCP.

**Step 3: Verify**

Run `supabase_execute_sql` to confirm cron job exists:
```sql
SELECT * FROM cron.job WHERE jobname = 'create_scheduled_instances';
```

---

## Task 9: Generate TypeScript types + verify full schema

**Step 1: Generate types**

Run: `supabase gen types typescript --local 2>/dev/null > src/types/database.ts`

**Step 2: Verify schema**

Run `supabase_list_tables` (verbose) to confirm all 4 new tables exist with correct columns.

**Step 3: Run advisors**

Run `supabase_get_advisors` (security) and `supabase_get_advisors` (performance).

---

## Task 10: Update TODO.md

Cross off completed items in `docs/TODO.md` for the Form Instances backend section.

---

## Parallelization Strategy

These tasks can be grouped for parallel execution:

**Sequential batch 1 (must be in order due to FK dependencies):**
- Task 1: `form_instances` table
- Task 2: `field_values` table
- Task 3: `instance_schedules` table
- Task 4: `schedule_group_targets` table
- Task 5: Triggers + indexes

**Parallel batch 2 (independent of each other, depends on batch 1):**
- Task 6: Database trigger for pg_net
- Task 7: `on-instance-created` Edge Function
- Task 8: pg_cron job

**Sequential batch 3 (depends on everything above):**
- Task 9: TypeScript types + verification
- Task 10: Update TODO.md
