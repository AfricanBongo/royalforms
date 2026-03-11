# Reports Backend — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the complete reports backend: 5 database tables with RLS, 3 triggers, 3 Edge Functions (generate-report, on-report-instance-ready, export-report), a storage bucket, the service layer, and regenerated TypeScript types.

**Architecture:** Layered bottom-up — migrations first (tables + RLS + indexes + storage), then triggers (auto-report on form submission, short URLs on report ready, version management), then Edge Functions (report generation with formula resolution, short URL creation via Shlink, PDF/DOCX export with Storage caching), then the client-side service layer. Report generation uses an Edge Function (server-side computation across form instances). Template CRUD uses the Supabase Client SDK with RLS enforcement.

**Tech Stack:** PostgreSQL, Supabase Edge Functions (Deno), Supabase Storage, Shlink JS SDK (`@shlinkio/shlink-js-sdk`), `pg_net`, `pdf-lib`, `docx`

---

## Task 1: Create `report_templates` + `report_template_versions` tables with RLS

**Files:**
- Create: `supabase/migrations/20260312100001_create_report_templates_tables.sql`

**Step 1: Write the migration**

```sql
-- ============================================================
-- report_templates: 1:1 with form_templates. Root Admin only.
-- ============================================================
CREATE TABLE public.report_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_template_id UUID NOT NULL UNIQUE REFERENCES public.form_templates(id),
  name TEXT NOT NULL,
  abbreviation TEXT NOT NULL UNIQUE,
  description TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  auto_generate BOOLEAN NOT NULL DEFAULT false,
  instance_counter INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.report_templates ENABLE ROW LEVEL SECURITY;

-- update_updated_at trigger (reuse existing function)
CREATE TRIGGER set_report_templates_updated_at
  BEFORE UPDATE ON public.report_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- RLS: SELECT — Root Admin only
CREATE POLICY report_templates_select ON public.report_templates
  FOR SELECT
  TO authenticated, service_role
  USING (
    is_active_user() = true
    AND (select get_current_user_role()) = 'root_admin'
  );

-- RLS: INSERT — Root Admin only
CREATE POLICY report_templates_insert ON public.report_templates
  FOR INSERT
  TO authenticated, service_role
  WITH CHECK (
    is_active_user() = true
    AND (select get_current_user_role()) = 'root_admin'
  );

-- RLS: UPDATE — Root Admin only
CREATE POLICY report_templates_update ON public.report_templates
  FOR UPDATE
  TO authenticated, service_role
  USING (
    is_active_user() = true
    AND (select get_current_user_role()) = 'root_admin'
  );

-- ============================================================
-- report_template_versions: versioned snapshots of report templates
-- ============================================================
CREATE TABLE public.report_template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_template_id UUID NOT NULL REFERENCES public.report_templates(id),
  version_number INTEGER NOT NULL,
  is_latest BOOLEAN NOT NULL DEFAULT true,
  restored_from UUID REFERENCES public.report_template_versions(id),
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (report_template_id, version_number)
);

ALTER TABLE public.report_template_versions ENABLE ROW LEVEL SECURITY;

-- RLS: SELECT — Root Admin only
CREATE POLICY report_template_versions_select ON public.report_template_versions
  FOR SELECT
  TO authenticated, service_role
  USING (
    is_active_user() = true
    AND (select get_current_user_role()) = 'root_admin'
  );

-- RLS: INSERT — Root Admin only
CREATE POLICY report_template_versions_insert ON public.report_template_versions
  FOR INSERT
  TO authenticated, service_role
  WITH CHECK (
    is_active_user() = true
    AND (select get_current_user_role()) = 'root_admin'
  );

-- RLS: UPDATE — Root Admin only (for is_latest toggling)
CREATE POLICY report_template_versions_update ON public.report_template_versions
  FOR UPDATE
  TO authenticated, service_role
  USING (
    is_active_user() = true
    AND (select get_current_user_role()) = 'root_admin'
  );

-- Index: find latest version quickly
CREATE INDEX idx_report_template_versions_latest
  ON public.report_template_versions (report_template_id, is_latest)
  WHERE is_latest = true;
```

**Step 2: Apply migration**

Run: `npx supabase db reset`
Expected: All migrations apply cleanly, seed runs.

**Step 3: Verify with Supabase MCP**

Run: `supabase_list_tables` (verbose) — confirm `report_templates` and `report_template_versions` exist with correct columns.

**Step 4: Commit**

```
feat(db): add report_templates and report_template_versions tables with RLS
```

---

## Task 2: Create `report_template_sections` + `report_template_fields` tables with RLS

**Files:**
- Create: `supabase/migrations/20260312100002_create_report_template_content_tables.sql`

**Step 1: Write the migration**

```sql
-- ============================================================
-- report_template_sections: sections within a report template version
-- ============================================================
CREATE TABLE public.report_template_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_template_version_id UUID NOT NULL REFERENCES public.report_template_versions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.report_template_sections ENABLE ROW LEVEL SECURITY;

-- RLS: SELECT — Root Admin only
CREATE POLICY report_template_sections_select ON public.report_template_sections
  FOR SELECT
  TO authenticated, service_role
  USING (
    is_active_user() = true
    AND (select get_current_user_role()) = 'root_admin'
  );

-- RLS: INSERT — Root Admin only
CREATE POLICY report_template_sections_insert ON public.report_template_sections
  FOR INSERT
  TO authenticated, service_role
  WITH CHECK (
    is_active_user() = true
    AND (select get_current_user_role()) = 'root_admin'
  );

-- ============================================================
-- report_template_fields: fields within a report template section
-- ============================================================
CREATE TABLE public.report_template_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_template_section_id UUID NOT NULL REFERENCES public.report_template_sections(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('formula', 'dynamic_variable', 'table', 'static_text')),
  sort_order INTEGER NOT NULL,
  config JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.report_template_fields ENABLE ROW LEVEL SECURITY;

-- RLS: SELECT — Root Admin only
CREATE POLICY report_template_fields_select ON public.report_template_fields
  FOR SELECT
  TO authenticated, service_role
  USING (
    is_active_user() = true
    AND (select get_current_user_role()) = 'root_admin'
  );

-- RLS: INSERT — Root Admin only
CREATE POLICY report_template_fields_insert ON public.report_template_fields
  FOR INSERT
  TO authenticated, service_role
  WITH CHECK (
    is_active_user() = true
    AND (select get_current_user_role()) = 'root_admin'
  );
```

**Step 2: Apply migration**

Run: `npx supabase db reset`
Expected: All migrations apply cleanly.

**Step 3: Verify**

Run: `supabase_list_tables` (verbose) — confirm both tables exist with correct columns and constraints.

**Step 4: Commit**

```
feat(db): add report_template_sections and report_template_fields tables with RLS
```

---

## Task 3: Create `report_instances` table with RLS

**Files:**
- Create: `supabase/migrations/20260312100003_create_report_instances_table.sql`

**Step 1: Write the migration**

```sql
-- ============================================================
-- report_instances: immutable snapshots of resolved report data
-- status tracks generation progress (generating -> ready/failed)
-- ============================================================
CREATE TABLE public.report_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  readable_id TEXT NOT NULL UNIQUE,
  report_template_version_id UUID NOT NULL REFERENCES public.report_template_versions(id),
  status TEXT NOT NULL DEFAULT 'generating' CHECK (status IN ('generating', 'ready', 'failed')),
  error_message TEXT,
  short_url TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  data_snapshot JSONB,
  form_instances_included JSONB NOT NULL,
  export_pdf_path TEXT,
  export_docx_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.report_instances ENABLE ROW LEVEL SECURITY;

-- RLS: SELECT — Any authenticated active user can view report instances
CREATE POLICY report_instances_select ON public.report_instances
  FOR SELECT
  TO authenticated, service_role
  USING (
    is_active_user() = true
  );

-- No INSERT/UPDATE/DELETE policies for authenticated users.
-- Report instances are created and updated by Edge Functions using the service role key.
-- The service_role in the TO clause allows Edge Functions to bypass RLS.

-- Index: find instances by template version
CREATE INDEX idx_report_instances_version
  ON public.report_instances (report_template_version_id);

-- Index: filter by status
CREATE INDEX idx_report_instances_status
  ON public.report_instances (status);
```

**Step 2: Apply migration**

Run: `npx supabase db reset`
Expected: All migrations apply cleanly.

**Step 3: Run security advisors**

Run: `supabase_get_advisors` (security) — check for any missing RLS policy warnings on the new tables.

**Step 4: Commit**

```
feat(db): add report_instances table with RLS and generation status
```

---

## Task 4: Create `report-exports` storage bucket

**Files:**
- Create: `supabase/migrations/20260312100004_create_report_exports_bucket.sql`

**Step 1: Write the migration**

```sql
-- ============================================================
-- Storage bucket for report PDF/DOCX exports
-- ============================================================

-- Create the bucket (private by default — requires auth)
INSERT INTO storage.buckets (id, name, public)
VALUES ('report-exports', 'report-exports', false);

-- RLS: Any authenticated active user can download (SELECT) exports
CREATE POLICY report_exports_select ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'report-exports'
    AND (auth.jwt()->'user_metadata'->>'is_active')::boolean = true
  );

-- RLS: Service role can upload (INSERT) exports
-- No authenticated INSERT policy — only Edge Functions upload via service role key.
-- The service role bypasses RLS so no explicit INSERT policy is needed.

-- RLS: Service role can update (UPDATE) exports
-- Same as INSERT — only Edge Functions update via service role key.
```

**Step 2: Apply migration**

Run: `npx supabase db reset`
Expected: All migrations apply cleanly. Storage bucket created.

**Step 3: Verify**

Run: `supabase_execute_sql` with `SELECT id, name, public FROM storage.buckets WHERE id = 'report-exports';` — confirm bucket exists and is private.

**Step 4: Commit**

```
feat(db): add report-exports storage bucket with authenticated read access
```

---

## Task 5: Create triggers — version management + auto-report + short URLs

**Files:**
- Create: `supabase/migrations/20260312100005_create_report_triggers.sql`

**Step 1: Write the migration**

```sql
-- ============================================================
-- Trigger 1: Auto-report generation when form instance is submitted
-- ============================================================

CREATE OR REPLACE FUNCTION public.trigger_on_form_instance_submitted()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, net
AS $$
DECLARE
  _report_template RECORD;
  _all_submitted BOOLEAN;
  _batch_instance_ids UUID[];
  _payload JSONB;
  _template_version_id UUID;
  _form_template_id UUID;
BEGIN
  -- Only fire when status changes to 'submitted'
  IF NEW.status != 'submitted' OR OLD.status = 'submitted' THEN
    RETURN NEW;
  END IF;

  -- Find the form_template_id via template_versions
  SELECT tv.template_id INTO _form_template_id
  FROM public.template_versions tv
  WHERE tv.id = NEW.template_version_id;

  IF _form_template_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check if a report template exists with auto_generate = true
  SELECT rt.id, rt.auto_generate INTO _report_template
  FROM public.report_templates rt
  WHERE rt.form_template_id = _form_template_id
    AND rt.is_active = true
    AND rt.auto_generate = true;

  IF _report_template IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check if this is a one-time instance (no schedule) or a scheduled batch
  -- One-time instances have no schedule_group_targets linking them
  -- Scheduled instances share a created_at date and group from the same schedule

  -- For simplicity, check if there are other pending instances in the same group
  -- created by the same schedule batch (same template, same group, same created_at::date)
  SELECT
    bool_and(fi.status = 'submitted'),
    array_agg(fi.id)
  INTO _all_submitted, _batch_instance_ids
  FROM public.form_instances fi
  WHERE fi.group_id = NEW.group_id
    AND fi.template_version_id IN (
      SELECT tv.id FROM public.template_versions tv
      WHERE tv.template_id = _form_template_id
    )
    AND fi.created_at::date = NEW.created_at::date
    AND fi.is_archived = false;

  -- If not all siblings are submitted yet, skip auto-generation
  IF NOT _all_submitted THEN
    RETURN NEW;
  END IF;

  -- Build payload for the generate-report Edge Function
  _payload := jsonb_build_object(
    'report_template_id', _report_template.id,
    'form_instance_ids', to_jsonb(_batch_instance_ids),
    'auto_generated', true
  );

  -- Fire async HTTP POST via pg_net
  PERFORM net.http_post(
    url    := 'http://supabase_kong_royalforms:8000/functions/v1/generate-report',
    body   := _payload,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 10000
  );

  RETURN NEW;
END;
$$;

-- Create the trigger on form_instances
CREATE TRIGGER on_form_instance_submitted
  AFTER UPDATE ON public.form_instances
  FOR EACH ROW
  WHEN (NEW.status = 'submitted' AND OLD.status != 'submitted')
  EXECUTE FUNCTION public.trigger_on_form_instance_submitted();


-- ============================================================
-- Trigger 2: Short URL generation when report instance is ready
-- ============================================================

CREATE OR REPLACE FUNCTION public.trigger_on_report_instance_ready()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, net
AS $$
DECLARE
  _payload JSONB;
BEGIN
  -- Only fire when status changes to 'ready'
  IF NEW.status != 'ready' OR OLD.status != 'generating' THEN
    RETURN NEW;
  END IF;

  _payload := jsonb_build_object(
    'id', NEW.id,
    'readable_id', NEW.readable_id,
    'report_template_version_id', NEW.report_template_version_id
  );

  PERFORM net.http_post(
    url    := 'http://supabase_kong_royalforms:8000/functions/v1/on-report-instance-ready',
    body   := _payload,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_report_instance_ready
  AFTER UPDATE ON public.report_instances
  FOR EACH ROW
  WHEN (NEW.status = 'ready' AND OLD.status = 'generating')
  EXECUTE FUNCTION public.trigger_on_report_instance_ready();
```

**Step 2: Apply migration**

Run: `npx supabase db reset`
Expected: All migrations apply cleanly.

**Step 3: Verify triggers exist**

Run: `supabase_execute_sql` with:
```sql
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name IN ('on_form_instance_submitted', 'on_report_instance_ready');
```
Expected: Both triggers listed.

**Step 4: Commit**

```
feat(db): add auto-report and short URL triggers for report instances
```

---

## Task 6: Create `on-report-instance-ready` Edge Function

**Files:**
- Create: `supabase/functions/on-report-instance-ready/index.ts`
- Create: `supabase/functions/on-report-instance-ready/deno.json`

**Step 1: Create deno.json**

```json
{
  "imports": {
    "@supabase/functions-js": "jsr:@supabase/functions-js@^2",
    "@supabase/supabase-js": "jsr:@supabase/supabase-js@^2",
    "@shlinkio/shlink-js-sdk": "npm:@shlinkio/shlink-js-sdk",
    "@shlinkio/shlink-js-sdk/fetch": "npm:@shlinkio/shlink-js-sdk/fetch"
  }
}
```

**Step 2: Create index.ts**

```typescript
import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import { ShlinkApiClient } from "@shlinkio/shlink-js-sdk";
import { FetchHttpClient } from "@shlinkio/shlink-js-sdk/fetch";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    console.info(
      "[on-report-instance-ready] Rejected non-POST request:",
      req.method,
    );
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  console.info("[on-report-instance-ready] Request received");

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const sbSecretKey = Deno.env.get("SB_SECRET_KEY") ?? "";
    const shlinkBaseUrl = Deno.env.get("SHLINK_BASE_URL") ?? "";
    const shlinkApiKey = Deno.env.get("SHLINK_API_KEY") ?? "";
    const appBaseUrl = Deno.env.get("APP_BASE_URL") ?? "";

    if (!shlinkBaseUrl || !shlinkApiKey) {
      console.error(
        "[on-report-instance-ready] Missing Shlink env vars",
      );
      return new Response(
        JSON.stringify({ success: false, error: "Missing Shlink configuration" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!appBaseUrl) {
      console.error("[on-report-instance-ready] Missing APP_BASE_URL env var");
      return new Response(
        JSON.stringify({ success: false, error: "Missing APP_BASE_URL configuration" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // Parse payload from pg_net trigger
    const body = await req.json();
    const record = body.record ?? body;
    if (!record?.id || !record?.readable_id) {
      console.error(
        "[on-report-instance-ready] Missing id or readable_id in payload:",
        JSON.stringify(body),
      );
      return new Response(
        JSON.stringify({ success: false, error: "Missing id or readable_id" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const { id, readable_id } = record;
    console.info(
      "[on-report-instance-ready] Processing report instance:",
      id,
      "readable_id:",
      readable_id,
    );

    // Initialize Shlink client
    const shlinkClient = new ShlinkApiClient(
      new FetchHttpClient(),
      { baseUrl: shlinkBaseUrl, apiKey: shlinkApiKey },
    );

    // Create short URL: short.domain/r/{readable_id} -> app.domain/reports/{readable_id}
    const longUrl = `${appBaseUrl}/reports/${readable_id}`;
    console.info(
      "[on-report-instance-ready] Creating short URL for:",
      longUrl,
    );

    const shortUrl = await shlinkClient.createShortUrl({
      longUrl,
      customSlug: `r/${readable_id}`,
    });
    console.info(
      "[on-report-instance-ready] Short URL created:",
      shortUrl.shortUrl,
    );

    // Update the report_instances row with the short URL
    const supabaseAdmin = createClient(supabaseUrl, sbSecretKey);
    const { error: updateError } = await supabaseAdmin
      .from("report_instances")
      .update({ short_url: shortUrl.shortUrl })
      .eq("id", id);

    if (updateError) {
      console.error(
        "[on-report-instance-ready] Failed to update report_instances row:",
        updateError.message,
      );
      return new Response(
        JSON.stringify({
          success: false,
          error: `DB update failed: ${updateError.message}`,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    console.info(
      "[on-report-instance-ready] Successfully updated report instance",
      id,
      "with short URL",
    );
    return new Response(
      JSON.stringify({ success: true, short_url: shortUrl.shortUrl }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[on-report-instance-ready] Unhandled error:", message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
});
```

**Step 3: Commit**

```
feat(edge-functions): add on-report-instance-ready for Shlink short URLs
```

---

## Task 7: Create `generate-report` Edge Function

**Files:**
- Create: `supabase/functions/generate-report/index.ts`
- Create: `supabase/functions/generate-report/deno.json`

**Step 1: Create deno.json**

```json
{
  "imports": {
    "@supabase/functions-js": "jsr:@supabase/functions-js@^2",
    "@supabase/supabase-js": "jsr:@supabase/supabase-js@^2"
  }
}
```

**Step 2: Create index.ts**

This is the most complex Edge Function. It handles both direct HTTP calls (from Root Admin) and pg_net trigger calls (auto-generation).

```typescript
import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// Formula resolution helpers
// ---------------------------------------------------------------------------

type AggregateFunction = "SUM" | "AVERAGE" | "MIN" | "MAX" | "COUNT" | "MEDIAN";

const AGGREGATE_FUNCTIONS: Record<AggregateFunction, (values: number[]) => number> = {
  SUM: (vals) => vals.reduce((a, b) => a + b, 0),
  AVERAGE: (vals) => vals.length === 0 ? 0 : vals.reduce((a, b) => a + b, 0) / vals.length,
  MIN: (vals) => vals.length === 0 ? 0 : Math.min(...vals),
  MAX: (vals) => vals.length === 0 ? 0 : Math.max(...vals),
  COUNT: (vals) => vals.length,
  MEDIAN: (vals) => {
    if (vals.length === 0) return 0;
    const sorted = [...vals].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  },
};

/**
 * Resolve aggregate function calls in an expression string.
 * E.g., "SUM(field_uuid)" -> the computed number as a string.
 *
 * fieldValues is a Map of template_field_id -> number[] (all values across instances).
 */
function resolveAggregates(
  expression: string,
  fieldValues: Map<string, number[]>,
): string {
  // Match FUNCTION(field_id) patterns
  return expression.replace(
    /\b(SUM|AVERAGE|MIN|MAX|COUNT|MEDIAN)\(\s*([a-f0-9-]+)\s*\)/gi,
    (_match, funcName: string, fieldId: string) => {
      const func = AGGREGATE_FUNCTIONS[funcName.toUpperCase() as AggregateFunction];
      if (!func) return "0";
      const values = fieldValues.get(fieldId) ?? [];
      return String(func(values));
    },
  );
}

/**
 * Evaluate a simple arithmetic expression (numbers and +, -, *, /).
 * All aggregate functions must be resolved to numbers before calling this.
 */
function evaluateArithmetic(expr: string): number {
  // Remove whitespace
  const cleaned = expr.replace(/\s+/g, "");
  // Security: only allow digits, decimal points, +, -, *, /, (, )
  if (!/^[\d.+\-*/()]+$/.test(cleaned)) {
    throw new Error(`Invalid arithmetic expression: ${expr}`);
  }
  // Use Function constructor for simple eval (safe since we validated the input)
  try {
    const result = new Function(`return (${cleaned})`)();
    if (typeof result !== "number" || !isFinite(result)) {
      return 0;
    }
    return result;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  console.info("[generate-report] Request received");

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const sbSecretKey = Deno.env.get("SB_SECRET_KEY") ?? "";
  const sbPublishableKey = Deno.env.get("SB_PUBLISHABLE_KEY") ?? "";

  // Service role client — bypasses RLS for cross-instance queries
  const supabaseAdmin = createClient(supabaseUrl, sbSecretKey);

  // Determine if this is a direct HTTP call or a pg_net trigger call.
  // pg_net calls have no Authorization header.
  const authHeader = req.headers.get("Authorization");
  const isDirectCall = !!authHeader;

  try {
    // ---- Auth check for direct HTTP calls ----
    if (isDirectCall) {
      const token = authHeader!.replace("Bearer ", "");
      const { data: { user: caller }, error: authError } =
        await supabaseAdmin.auth.getUser(token);
      if (authError || !caller) {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid or expired token" }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Check caller is Root Admin
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("role")
        .eq("id", caller.id)
        .single();

      if (profile?.role !== "root_admin") {
        return new Response(
          JSON.stringify({ success: false, error: "Only Root Admin can generate reports" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    // ---- Parse input ----
    const body = await req.json();
    const {
      report_template_id,
      form_instance_ids,
      auto_generated = false,
    } = body;

    if (!report_template_id || !Array.isArray(form_instance_ids) || form_instance_ids.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing report_template_id or form_instance_ids",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.info(
      "[generate-report] Template:",
      report_template_id,
      "Instances:",
      form_instance_ids.length,
      "Auto:",
      auto_generated,
    );

    // ---- Fetch report template with latest version, sections, fields ----
    const { data: reportTemplate, error: rtErr } = await supabaseAdmin
      .from("report_templates")
      .select("id, name, abbreviation, instance_counter")
      .eq("id", report_template_id)
      .single();

    if (rtErr || !reportTemplate) {
      return new Response(
        JSON.stringify({ success: false, error: "Report template not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Get latest version
    const { data: latestVersion, error: lvErr } = await supabaseAdmin
      .from("report_template_versions")
      .select("id, version_number")
      .eq("report_template_id", report_template_id)
      .eq("is_latest", true)
      .single();

    if (lvErr || !latestVersion) {
      return new Response(
        JSON.stringify({ success: false, error: "No published version found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Fetch sections with fields
    const { data: sections, error: sErr } = await supabaseAdmin
      .from("report_template_sections")
      .select("id, title, description, sort_order")
      .eq("report_template_version_id", latestVersion.id)
      .order("sort_order");

    if (sErr) throw sErr;

    const sectionIds = (sections ?? []).map((s) => s.id);
    const { data: fields, error: fErr } = await supabaseAdmin
      .from("report_template_fields")
      .select("id, report_template_section_id, label, field_type, sort_order, config")
      .in("report_template_section_id", sectionIds)
      .order("sort_order");

    if (fErr) throw fErr;

    // ---- Create report instance with 'generating' status ----
    const newCounter = reportTemplate.instance_counter + 1;
    const readableId = `${reportTemplate.abbreviation}-r-${String(newCounter).padStart(3, "0")}`;

    // Determine created_by: for auto-generated, use the system (first root admin profile)
    let createdBy: string;
    if (auto_generated) {
      const { data: rootAdmin } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("role", "root_admin")
        .limit(1)
        .single();
      createdBy = rootAdmin?.id ?? "";
    } else {
      // Direct call — get caller ID from auth
      const token = authHeader!.replace("Bearer ", "");
      const { data: { user } } = await supabaseAdmin.auth.getUser(token);
      createdBy = user?.id ?? "";
    }

    const { data: newInstance, error: insertErr } = await supabaseAdmin
      .from("report_instances")
      .insert({
        readable_id: readableId,
        report_template_version_id: latestVersion.id,
        status: "generating",
        created_by: createdBy,
        form_instances_included: form_instance_ids,
        data_snapshot: null,
      })
      .select("id, readable_id")
      .single();

    if (insertErr) throw insertErr;

    // Increment the instance counter
    await supabaseAdmin
      .from("report_templates")
      .update({ instance_counter: newCounter })
      .eq("id", report_template_id);

    console.info(
      "[generate-report] Created instance:",
      newInstance!.id,
      "readable_id:",
      newInstance!.readable_id,
    );

    // ---- Fetch field values from form instances ----
    const { data: fieldValuesRaw, error: fvErr } = await supabaseAdmin
      .from("field_values")
      .select("template_field_id, value, form_instance_id")
      .in("form_instance_id", form_instance_ids);

    if (fvErr) throw fvErr;

    // Build a map of template_field_id -> number[] for formula resolution
    const numericFieldValues = new Map<string, number[]>();
    // Build a map of template_field_id -> string[] for dynamic variables
    const rawFieldValues = new Map<string, Array<{ value: string | null; form_instance_id: string }>>();

    for (const fv of fieldValuesRaw ?? []) {
      // Numeric values for formulas
      const num = parseFloat(fv.value ?? "");
      if (!isNaN(num)) {
        const existing = numericFieldValues.get(fv.template_field_id) ?? [];
        existing.push(num);
        numericFieldValues.set(fv.template_field_id, existing);
      }

      // All values for dynamic variables and tables
      const existingRaw = rawFieldValues.get(fv.template_field_id) ?? [];
      existingRaw.push({ value: fv.value, form_instance_id: fv.form_instance_id });
      rawFieldValues.set(fv.template_field_id, existingRaw);
    }

    // ---- Resolve each report field ----
    const dataSnapshot: Record<string, unknown> = {
      report_name: reportTemplate.name,
      version_number: latestVersion.version_number,
      generated_at: new Date().toISOString(),
      sections: [] as unknown[],
    };

    const snapshotSections: unknown[] = [];

    for (const section of sections ?? []) {
      const sectionFields = (fields ?? []).filter(
        (f) => f.report_template_section_id === section.id,
      );

      const resolvedFields: unknown[] = [];

      for (const field of sectionFields) {
        const config = field.config as Record<string, unknown>;
        let resolvedValue: unknown = null;

        switch (field.field_type) {
          case "formula": {
            const expression = (config.expression as string) ?? "";
            try {
              const resolved = resolveAggregates(expression, numericFieldValues);
              resolvedValue = evaluateArithmetic(resolved);
            } catch (e) {
              resolvedValue = { error: e instanceof Error ? e.message : "Formula error" };
            }
            break;
          }

          case "dynamic_variable": {
            const templateFieldId = config.template_field_id as string;
            const values = rawFieldValues.get(templateFieldId);
            // Take the first (most recent) value
            resolvedValue = values?.[0]?.value ?? null;
            break;
          }

          case "table": {
            const columns = (config.columns as Array<{ template_field_id: string; label: string }>) ?? [];
            // Build table rows: each form instance is a row
            const rows: Record<string, unknown>[] = [];
            for (const instanceId of form_instance_ids) {
              const row: Record<string, unknown> = { form_instance_id: instanceId };
              for (const col of columns) {
                const values = rawFieldValues.get(col.template_field_id);
                const match = values?.find((v) => v.form_instance_id === instanceId);
                row[col.label] = match?.value ?? null;
              }
              rows.push(row);
            }
            resolvedValue = { columns: columns.map((c) => c.label), rows };
            break;
          }

          case "static_text": {
            resolvedValue = config.content ?? "";
            break;
          }
        }

        resolvedFields.push({
          field_id: field.id,
          label: field.label,
          field_type: field.field_type,
          value: resolvedValue,
        });
      }

      snapshotSections.push({
        section_id: section.id,
        title: section.title,
        description: section.description,
        fields: resolvedFields,
      });
    }

    dataSnapshot.sections = snapshotSections;

    // ---- Update instance to 'ready' with data_snapshot ----
    const { error: updateErr } = await supabaseAdmin
      .from("report_instances")
      .update({
        status: "ready",
        data_snapshot: dataSnapshot,
      })
      .eq("id", newInstance!.id);

    if (updateErr) throw updateErr;

    console.info("[generate-report] Report instance ready:", newInstance!.id);

    return new Response(
      JSON.stringify({
        success: true,
        report_instance_id: newInstance!.id,
        readable_id: newInstance!.readable_id,
      }),
      {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[generate-report] Error:", message);

    // If we created an instance, mark it as failed
    // Try to extract the instance ID from the error context
    // This is a best-effort cleanup
    try {
      const body = await req.clone().json().catch(() => null);
      if (body) {
        // We can't easily get the instance ID here since it's created inside the try block.
        // The instance will remain in 'generating' status. A cleanup job could handle this.
        console.error("[generate-report] Instance may be stuck in 'generating' status");
      }
    } catch {
      // Ignore cleanup errors
    }

    const status = isDirectCall ? 500 : 200; // pg_net expects 200
    return new Response(
      JSON.stringify({ success: false, error: message }),
      {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
```

**Important note on error handling:** The instance ID is created inside the try block, so if an error occurs after INSERT but before the status update, the instance will be stuck in `'generating'` status. A pragmatic fix: move the instance ID to a variable accessible in the catch block so we can mark it as `'failed'`. Let me fix that in the actual implementation (the catch block should update the instance status to 'failed' if the ID is known).

**Step 3: Commit**

```
feat(edge-functions): add generate-report with formula resolution and data snapshots
```

---

## Task 8: Create `export-report` Edge Function

**Files:**
- Create: `supabase/functions/export-report/index.ts`
- Create: `supabase/functions/export-report/deno.json`

**Step 1: Create deno.json**

```json
{
  "imports": {
    "@supabase/functions-js": "jsr:@supabase/functions-js@^2",
    "@supabase/supabase-js": "jsr:@supabase/supabase-js@^2",
    "pdf-lib": "npm:pdf-lib",
    "docx": "npm:docx"
  }
}
```

**Step 2: Create index.ts**

```typescript
import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
} from "docx";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// PDF generation
// ---------------------------------------------------------------------------

interface ReportSection {
  title: string;
  description: string | null;
  fields: ReportField[];
}

interface ReportField {
  label: string;
  field_type: string;
  value: unknown;
}

async function generatePdf(
  reportName: string,
  versionNumber: number,
  generatedAt: string,
  sections: ReportSection[],
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_WIDTH = 595; // A4
  const PAGE_HEIGHT = 842;
  const MARGIN = 50;
  const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
  const LINE_HEIGHT = 16;
  const HEADING_SIZE = 18;
  const SUBHEADING_SIZE = 14;
  const BODY_SIZE = 10;
  const SMALL_SIZE = 8;

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  }

  // Title
  page.drawText(reportName, {
    x: MARGIN,
    y,
    size: HEADING_SIZE,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  y -= HEADING_SIZE + 8;

  // Metadata line
  const metaText = `Version ${versionNumber} • Generated ${new Date(generatedAt).toLocaleDateString()}`;
  page.drawText(metaText, {
    x: MARGIN,
    y,
    size: SMALL_SIZE,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });
  y -= LINE_HEIGHT + 12;

  // Sections
  for (const section of sections) {
    ensureSpace(SUBHEADING_SIZE + LINE_HEIGHT * 2);

    // Section title
    page.drawText(section.title, {
      x: MARGIN,
      y,
      size: SUBHEADING_SIZE,
      font: boldFont,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= SUBHEADING_SIZE + 4;

    if (section.description) {
      ensureSpace(LINE_HEIGHT);
      page.drawText(section.description, {
        x: MARGIN,
        y,
        size: BODY_SIZE,
        font,
        color: rgb(0.3, 0.3, 0.3),
      });
      y -= LINE_HEIGHT + 4;
    }

    // Fields
    for (const field of section.fields) {
      ensureSpace(LINE_HEIGHT * 3);

      // Label
      page.drawText(field.label, {
        x: MARGIN,
        y,
        size: BODY_SIZE,
        font: boldFont,
        color: rgb(0.2, 0.2, 0.2),
      });
      y -= LINE_HEIGHT;

      // Value
      let displayValue = "";
      if (field.field_type === "static_text") {
        // Strip HTML tags for PDF
        displayValue = String(field.value ?? "").replace(/<[^>]*>/g, "");
      } else if (field.field_type === "table") {
        const tableData = field.value as { columns: string[]; rows: Record<string, unknown>[] } | null;
        if (tableData) {
          // Render table as aligned text rows
          const header = tableData.columns.join("  |  ");
          page.drawText(header, {
            x: MARGIN + 10,
            y,
            size: SMALL_SIZE,
            font: boldFont,
            color: rgb(0.3, 0.3, 0.3),
          });
          y -= LINE_HEIGHT;

          for (const row of tableData.rows) {
            ensureSpace(LINE_HEIGHT);
            const rowText = tableData.columns
              .map((col) => String(row[col] ?? "-"))
              .join("  |  ");
            page.drawText(rowText, {
              x: MARGIN + 10,
              y,
              size: SMALL_SIZE,
              font,
              color: rgb(0.2, 0.2, 0.2),
            });
            y -= LINE_HEIGHT;
          }
        }
        displayValue = ""; // Already rendered
      } else if (field.field_type === "formula") {
        const val = field.value;
        if (typeof val === "number") {
          displayValue = Number.isInteger(val) ? String(val) : val.toFixed(2);
        } else if (typeof val === "object" && val !== null && "error" in (val as Record<string, unknown>)) {
          displayValue = `Error: ${(val as Record<string, unknown>).error}`;
        } else {
          displayValue = String(val ?? "-");
        }
      } else {
        displayValue = String(field.value ?? "-");
      }

      if (displayValue) {
        // Wrap long text (simple word-wrap)
        const words = displayValue.split(" ");
        let line = "";
        for (const word of words) {
          const testLine = line ? `${line} ${word}` : word;
          const width = font.widthOfTextAtSize(testLine, BODY_SIZE);
          if (width > CONTENT_WIDTH - 10) {
            ensureSpace(LINE_HEIGHT);
            page.drawText(line, {
              x: MARGIN + 10,
              y,
              size: BODY_SIZE,
              font,
              color: rgb(0.1, 0.1, 0.1),
            });
            y -= LINE_HEIGHT;
            line = word;
          } else {
            line = testLine;
          }
        }
        if (line) {
          ensureSpace(LINE_HEIGHT);
          page.drawText(line, {
            x: MARGIN + 10,
            y,
            size: BODY_SIZE,
            font,
            color: rgb(0.1, 0.1, 0.1),
          });
          y -= LINE_HEIGHT;
        }
      }

      y -= 8; // spacing between fields
    }

    y -= 12; // spacing between sections
  }

  return pdfDoc.save();
}

// ---------------------------------------------------------------------------
// DOCX generation
// ---------------------------------------------------------------------------

async function generateDocx(
  reportName: string,
  versionNumber: number,
  generatedAt: string,
  sections: ReportSection[],
): Promise<Uint8Array> {
  const children: (Paragraph | Table)[] = [];

  // Title
  children.push(
    new Paragraph({
      text: reportName,
      heading: HeadingLevel.HEADING_1,
    }),
  );

  // Metadata
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Version ${versionNumber} • Generated ${new Date(generatedAt).toLocaleDateString()}`,
          size: 18,
          color: "888888",
        }),
      ],
    }),
  );

  children.push(new Paragraph({ text: "" })); // spacer

  for (const section of sections) {
    // Section heading
    children.push(
      new Paragraph({
        text: section.title,
        heading: HeadingLevel.HEADING_2,
      }),
    );

    if (section.description) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: section.description, color: "666666", size: 20 }),
          ],
        }),
      );
    }

    for (const field of section.fields) {
      // Field label
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: field.label, bold: true, size: 22 }),
          ],
        }),
      );

      // Field value
      if (field.field_type === "table") {
        const tableData = field.value as { columns: string[]; rows: Record<string, unknown>[] } | null;
        if (tableData && tableData.columns.length > 0) {
          const colWidth = Math.floor(9000 / tableData.columns.length);

          // Header row
          const headerRow = new TableRow({
            children: tableData.columns.map(
              (col) =>
                new TableCell({
                  width: { size: colWidth, type: WidthType.DXA },
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: col, bold: true, size: 20 })],
                    }),
                  ],
                }),
            ),
          });

          // Data rows
          const dataRows = tableData.rows.map(
            (row) =>
              new TableRow({
                children: tableData.columns.map(
                  (col) =>
                    new TableCell({
                      width: { size: colWidth, type: WidthType.DXA },
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({ text: String(row[col] ?? "-"), size: 20 }),
                          ],
                        }),
                      ],
                    }),
                ),
              }),
          );

          children.push(
            new Table({
              rows: [headerRow, ...dataRows],
            }),
          );
        }
      } else if (field.field_type === "static_text") {
        const text = String(field.value ?? "").replace(/<[^>]*>/g, "");
        children.push(
          new Paragraph({
            children: [new TextRun({ text, size: 20 })],
          }),
        );
      } else if (field.field_type === "formula") {
        const val = field.value;
        let displayValue: string;
        if (typeof val === "number") {
          displayValue = Number.isInteger(val) ? String(val) : val.toFixed(2);
        } else if (typeof val === "object" && val !== null && "error" in (val as Record<string, unknown>)) {
          displayValue = `Error: ${(val as Record<string, unknown>).error}`;
        } else {
          displayValue = String(val ?? "-");
        }
        children.push(
          new Paragraph({
            children: [new TextRun({ text: displayValue, size: 22 })],
          }),
        );
      } else {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: String(field.value ?? "-"), size: 22 })],
          }),
        );
      }

      children.push(new Paragraph({ text: "" })); // spacer
    }
  }

  const doc = new Document({
    sections: [{ children }],
  });

  const buffer = await Packer.toBuffer(doc);
  return new Uint8Array(buffer);
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  console.info("[export-report] Request received");

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const sbSecretKey = Deno.env.get("SB_SECRET_KEY") ?? "";

    // Verify caller is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing Authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, sbSecretKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } =
      await supabaseAdmin.auth.getUser(token);

    if (authError || !caller) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid or expired token" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Check caller is active
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("is_active")
      .eq("id", caller.id)
      .single();

    if (!profile?.is_active) {
      return new Response(
        JSON.stringify({ success: false, error: "User account is not active" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Parse input
    const { report_instance_id, format } = await req.json();

    if (!report_instance_id || !["pdf", "docx"].includes(format)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing report_instance_id or invalid format (must be 'pdf' or 'docx')",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.info("[export-report] Instance:", report_instance_id, "Format:", format);

    // Fetch the report instance
    const { data: instance, error: iErr } = await supabaseAdmin
      .from("report_instances")
      .select("id, readable_id, status, data_snapshot, export_pdf_path, export_docx_path")
      .eq("id", report_instance_id)
      .single();

    if (iErr || !instance) {
      return new Response(
        JSON.stringify({ success: false, error: "Report instance not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (instance.status !== "ready") {
      return new Response(
        JSON.stringify({ success: false, error: "Report is not ready for export" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Check if export already exists (cached)
    const cachedPath = format === "pdf" ? instance.export_pdf_path : instance.export_docx_path;
    if (cachedPath) {
      console.info("[export-report] Export already cached at:", cachedPath);
      const { data: signedUrl } = await supabaseAdmin.storage
        .from("report-exports")
        .createSignedUrl(cachedPath, 3600); // 1 hour expiry

      return new Response(
        JSON.stringify({ success: true, download_url: signedUrl?.signedUrl }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Generate the export
    const snapshot = instance.data_snapshot as {
      report_name: string;
      version_number: number;
      generated_at: string;
      sections: ReportSection[];
    };

    let fileBytes: Uint8Array;
    const fileName = `report.${format}`;
    const storagePath = `${instance.id}/${fileName}`;
    const contentType = format === "pdf"
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    if (format === "pdf") {
      fileBytes = await generatePdf(
        snapshot.report_name,
        snapshot.version_number,
        snapshot.generated_at,
        snapshot.sections,
      );
    } else {
      fileBytes = await generateDocx(
        snapshot.report_name,
        snapshot.version_number,
        snapshot.generated_at,
        snapshot.sections,
      );
    }

    console.info("[export-report] Generated", format, "— size:", fileBytes.length, "bytes");

    // Upload to Storage
    const { error: uploadErr } = await supabaseAdmin.storage
      .from("report-exports")
      .upload(storagePath, fileBytes, {
        contentType,
        upsert: true,
      });

    if (uploadErr) {
      console.error("[export-report] Upload failed:", uploadErr.message);
      return new Response(
        JSON.stringify({ success: false, error: `Upload failed: ${uploadErr.message}` }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Update instance with the storage path
    const updateField = format === "pdf"
      ? { export_pdf_path: storagePath }
      : { export_docx_path: storagePath };

    await supabaseAdmin
      .from("report_instances")
      .update(updateField)
      .eq("id", instance.id);

    // Return signed download URL
    const { data: signedUrl } = await supabaseAdmin.storage
      .from("report-exports")
      .createSignedUrl(storagePath, 3600);

    console.info("[export-report] Export complete for instance:", instance.id);

    return new Response(
      JSON.stringify({ success: true, download_url: signedUrl?.signedUrl }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[export-report] Error:", message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
```

**Step 3: Commit**

```
feat(edge-functions): add export-report for PDF and DOCX generation with Storage caching
```

---

## Task 9: Create the service layer

**Files:**
- Create: `src/services/reports.ts`

**Step 1: Create the service file**

```typescript
/**
 * Reports service — data access for report templates and instances.
 * Template CRUD uses the Supabase Client SDK (RLS enforced).
 * Report generation and export use Edge Functions.
 */
import { supabase } from './supabase'
import { getCurrentAuthUser } from './auth'

import type { Json } from '../types/database'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Row for the report templates list page. */
export interface ReportTemplateListRow {
  id: string
  name: string
  abbreviation: string
  description: string | null
  is_active: boolean
  auto_generate: boolean
  form_template_id: string
  form_template_name: string
  instance_count: number
  latest_version_number: number
  created_at: string
  updated_at: string
}

/** Full report template detail — includes latest version, sections, fields. */
export interface ReportTemplateDetail {
  id: string
  name: string
  abbreviation: string
  description: string | null
  is_active: boolean
  auto_generate: boolean
  form_template_id: string
  form_template_name: string
  instance_counter: number
  created_at: string
  updated_at: string
  latest_version: {
    id: string
    version_number: number
    created_at: string
  }
  sections: ReportSection[]
}

export interface ReportSection {
  id: string
  title: string
  description: string | null
  sort_order: number
  fields: ReportField[]
}

export interface ReportField {
  id: string
  label: string
  field_type: string
  sort_order: number
  config: Record<string, unknown>
}

/** Version history entry. */
export interface ReportVersionRow {
  id: string
  version_number: number
  is_latest: boolean
  restored_from: string | null
  created_by: string
  created_by_name: string
  created_at: string
}

/** Report instance list row. */
export interface ReportInstanceListRow {
  id: string
  readable_id: string
  status: string
  short_url: string | null
  created_by: string
  created_by_name: string
  created_at: string
}

/** Full report instance detail. */
export interface ReportInstanceDetail {
  id: string
  readable_id: string
  status: string
  error_message: string | null
  short_url: string | null
  data_snapshot: Record<string, unknown> | null
  form_instances_included: string[]
  export_pdf_path: string | null
  export_docx_path: string | null
  report_template_name: string
  version_number: number
  created_at: string
}

/** Input for creating a report template. */
export interface CreateReportTemplateInput {
  form_template_id: string
  name: string
  abbreviation: string
  description: string | null
  auto_generate: boolean
  sections: CreateReportSectionInput[]
}

export interface CreateReportSectionInput {
  title: string
  description: string | null
  sort_order: number
  fields: CreateReportFieldInput[]
}

export interface CreateReportFieldInput {
  label: string
  field_type: string
  sort_order: number
  config: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Fetch all report templates with stats for the list page.
 * Root Admin only (RLS enforces).
 */
export async function fetchReportTemplates(): Promise<ReportTemplateListRow[]> {
  const { data, error } = await supabase
    .from('report_templates')
    .select(`
      id, name, abbreviation, description, is_active, auto_generate,
      form_template_id, created_at, updated_at,
      form_templates!inner ( name ),
      report_template_versions ( version_number, is_latest ),
      report_instances ( id )
    `)
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((row) => {
    const ft = row.form_templates as unknown as { name: string }
    const versions = row.report_template_versions as unknown as Array<{ version_number: number; is_latest: boolean }>
    const latestVersion = versions?.find((v) => v.is_latest)
    const instances = row.report_instances as unknown as Array<{ id: string }>

    return {
      id: row.id,
      name: row.name,
      abbreviation: row.abbreviation,
      description: row.description,
      is_active: row.is_active,
      auto_generate: row.auto_generate,
      form_template_id: row.form_template_id,
      form_template_name: ft.name,
      instance_count: instances?.length ?? 0,
      latest_version_number: latestVersion?.version_number ?? 1,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  })
}

/**
 * Fetch a report template by ID with latest version, sections, and fields.
 */
export async function fetchReportTemplateById(
  templateId: string,
): Promise<ReportTemplateDetail> {
  // Fetch template
  const { data: template, error: tErr } = await supabase
    .from('report_templates')
    .select(`
      id, name, abbreviation, description, is_active, auto_generate,
      form_template_id, instance_counter, created_at, updated_at,
      form_templates!inner ( name )
    `)
    .eq('id', templateId)
    .single()

  if (tErr || !template) throw tErr ?? new Error('Report template not found')

  // Fetch latest version
  const { data: version, error: vErr } = await supabase
    .from('report_template_versions')
    .select('id, version_number, created_at')
    .eq('report_template_id', templateId)
    .eq('is_latest', true)
    .single()

  if (vErr || !version) throw vErr ?? new Error('No version found')

  // Fetch sections
  const { data: sections, error: sErr } = await supabase
    .from('report_template_sections')
    .select('id, title, description, sort_order')
    .eq('report_template_version_id', version.id)
    .order('sort_order')

  if (sErr) throw sErr

  // Fetch fields
  const sectionIds = (sections ?? []).map((s) => s.id)
  const { data: fields, error: fErr } = await supabase
    .from('report_template_fields')
    .select('id, report_template_section_id, label, field_type, sort_order, config')
    .in('report_template_section_id', sectionIds.length > 0 ? sectionIds : ['__none__'])
    .order('sort_order')

  if (fErr) throw fErr

  // Group fields by section
  const fieldsBySection = new Map<string, ReportField[]>()
  for (const f of fields ?? []) {
    const list = fieldsBySection.get(f.report_template_section_id) ?? []
    list.push({
      id: f.id,
      label: f.label,
      field_type: f.field_type,
      sort_order: f.sort_order,
      config: f.config as Record<string, unknown>,
    })
    fieldsBySection.set(f.report_template_section_id, list)
  }

  const ft = template.form_templates as unknown as { name: string }

  return {
    id: template.id,
    name: template.name,
    abbreviation: template.abbreviation,
    description: template.description,
    is_active: template.is_active,
    auto_generate: template.auto_generate,
    form_template_id: template.form_template_id,
    form_template_name: ft.name,
    instance_counter: template.instance_counter,
    created_at: template.created_at,
    updated_at: template.updated_at,
    latest_version: {
      id: version.id,
      version_number: version.version_number,
      created_at: version.created_at,
    },
    sections: (sections ?? []).map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      sort_order: s.sort_order,
      fields: fieldsBySection.get(s.id) ?? [],
    })),
  }
}

/**
 * Fetch version history for a report template.
 */
export async function fetchReportTemplateVersions(
  templateId: string,
): Promise<ReportVersionRow[]> {
  const { data, error } = await supabase
    .from('report_template_versions')
    .select(`
      id, version_number, is_latest, restored_from, created_by, created_at,
      profiles!inner ( full_name )
    `)
    .eq('report_template_id', templateId)
    .order('version_number', { ascending: false })

  if (error) throw error

  return (data ?? []).map((row) => {
    const profile = row.profiles as unknown as { full_name: string }
    return {
      id: row.id,
      version_number: row.version_number,
      is_latest: row.is_latest,
      restored_from: row.restored_from,
      created_by: row.created_by,
      created_by_name: profile.full_name ?? 'Unknown',
      created_at: row.created_at,
    }
  })
}

/**
 * Fetch report instances, optionally filtered by template.
 */
export async function fetchReportInstances(
  templateId?: string,
): Promise<ReportInstanceListRow[]> {
  let query = supabase
    .from('report_instances')
    .select(`
      id, readable_id, status, short_url, created_by, created_at,
      report_template_versions!inner (
        report_template_id,
        report_templates!inner ( id )
      ),
      profiles!inner ( full_name )
    `)
    .order('created_at', { ascending: false })

  if (templateId) {
    query = query.eq(
      'report_template_versions.report_templates.id',
      templateId,
    )
  }

  const { data, error } = await query

  if (error) throw error

  return (data ?? []).map((row) => {
    const profile = row.profiles as unknown as { full_name: string }
    return {
      id: row.id,
      readable_id: row.readable_id,
      status: row.status,
      short_url: row.short_url,
      created_by: row.created_by,
      created_by_name: profile.full_name ?? 'Unknown',
      created_at: row.created_at,
    }
  })
}

/**
 * Fetch a report instance by ID.
 */
export async function fetchReportInstanceById(
  instanceId: string,
): Promise<ReportInstanceDetail> {
  const { data, error } = await supabase
    .from('report_instances')
    .select(`
      id, readable_id, status, error_message, short_url,
      data_snapshot, form_instances_included,
      export_pdf_path, export_docx_path, created_at,
      report_template_versions!inner (
        version_number,
        report_templates!inner ( name )
      )
    `)
    .eq('id', instanceId)
    .single()

  if (error || !data) throw error ?? new Error('Report instance not found')

  const version = data.report_template_versions as unknown as {
    version_number: number
    report_templates: { name: string }
  }

  return {
    id: data.id,
    readable_id: data.readable_id,
    status: data.status,
    error_message: data.error_message,
    short_url: data.short_url,
    data_snapshot: data.data_snapshot as Record<string, unknown> | null,
    form_instances_included: data.form_instances_included as string[],
    export_pdf_path: data.export_pdf_path,
    export_docx_path: data.export_docx_path,
    report_template_name: version.report_templates.name,
    version_number: version.version_number,
    created_at: data.created_at,
  }
}

/**
 * Fetch a report instance by readable_id (for short URL resolution).
 */
export async function fetchReportInstanceByReadableId(
  readableId: string,
): Promise<ReportInstanceDetail> {
  const { data, error } = await supabase
    .from('report_instances')
    .select(`
      id, readable_id, status, error_message, short_url,
      data_snapshot, form_instances_included,
      export_pdf_path, export_docx_path, created_at,
      report_template_versions!inner (
        version_number,
        report_templates!inner ( name )
      )
    `)
    .eq('readable_id', readableId)
    .single()

  if (error || !data) throw error ?? new Error('Report instance not found')

  const version = data.report_template_versions as unknown as {
    version_number: number
    report_templates: { name: string }
  }

  return {
    id: data.id,
    readable_id: data.readable_id,
    status: data.status,
    error_message: data.error_message,
    short_url: data.short_url,
    data_snapshot: data.data_snapshot as Record<string, unknown> | null,
    form_instances_included: data.form_instances_included as string[],
    export_pdf_path: data.export_pdf_path,
    export_docx_path: data.export_docx_path,
    report_template_name: version.report_templates.name,
    version_number: version.version_number,
    created_at: data.created_at,
  }
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Create a new report template with version 1, sections, and fields.
 */
export async function createReportTemplate(
  input: CreateReportTemplateInput,
): Promise<string> {
  const user = await getCurrentAuthUser()

  // 1. Insert report template
  const { data: template, error: tErr } = await supabase
    .from('report_templates')
    .insert({
      form_template_id: input.form_template_id,
      name: input.name,
      abbreviation: input.abbreviation,
      description: input.description,
      auto_generate: input.auto_generate,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (tErr || !template) throw tErr ?? new Error('Failed to create report template')

  // 2. Insert version 1
  const { data: version, error: vErr } = await supabase
    .from('report_template_versions')
    .insert({
      report_template_id: template.id,
      version_number: 1,
      is_latest: true,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (vErr || !version) throw vErr ?? new Error('Failed to create version')

  // 3. Insert sections and fields
  for (const section of input.sections) {
    const { data: sectionRow, error: sErr } = await supabase
      .from('report_template_sections')
      .insert({
        report_template_version_id: version.id,
        title: section.title,
        description: section.description,
        sort_order: section.sort_order,
      })
      .select('id')
      .single()

    if (sErr || !sectionRow) throw sErr ?? new Error('Failed to create section')

    if (section.fields.length > 0) {
      const fieldRows = section.fields.map((f) => ({
        report_template_section_id: sectionRow.id,
        label: f.label,
        field_type: f.field_type,
        sort_order: f.sort_order,
        config: f.config as unknown as Json,
      }))

      const { error: fErr } = await supabase
        .from('report_template_fields')
        .insert(fieldRows)

      if (fErr) throw fErr
    }
  }

  return template.id
}

/**
 * Update a report template (version-on-edit pattern).
 * Sets old version is_latest = false, creates a new version with updated content.
 */
export async function updateReportTemplate(
  templateId: string,
  input: { name?: string; description?: string | null; abbreviation?: string; auto_generate?: boolean; sections: CreateReportSectionInput[] },
): Promise<void> {
  const user = await getCurrentAuthUser()

  // Update template metadata if provided
  const updates: Record<string, unknown> = {}
  if (input.name !== undefined) updates.name = input.name
  if (input.description !== undefined) updates.description = input.description
  if (input.abbreviation !== undefined) updates.abbreviation = input.abbreviation
  if (input.auto_generate !== undefined) updates.auto_generate = input.auto_generate

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from('report_templates')
      .update(updates)
      .eq('id', templateId)
    if (error) throw error
  }

  // Get current latest version number
  const { data: currentVersion, error: cvErr } = await supabase
    .from('report_template_versions')
    .select('id, version_number')
    .eq('report_template_id', templateId)
    .eq('is_latest', true)
    .single()

  if (cvErr || !currentVersion) throw cvErr ?? new Error('No current version found')

  // Set current version to not latest
  const { error: ulErr } = await supabase
    .from('report_template_versions')
    .update({ is_latest: false })
    .eq('id', currentVersion.id)

  if (ulErr) throw ulErr

  // Create new version
  const newVersionNumber = currentVersion.version_number + 1
  const { data: newVersion, error: nvErr } = await supabase
    .from('report_template_versions')
    .insert({
      report_template_id: templateId,
      version_number: newVersionNumber,
      is_latest: true,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (nvErr || !newVersion) throw nvErr ?? new Error('Failed to create new version')

  // Insert sections and fields
  for (const section of input.sections) {
    const { data: sectionRow, error: sErr } = await supabase
      .from('report_template_sections')
      .insert({
        report_template_version_id: newVersion.id,
        title: section.title,
        description: section.description,
        sort_order: section.sort_order,
      })
      .select('id')
      .single()

    if (sErr || !sectionRow) throw sErr ?? new Error('Failed to create section')

    if (section.fields.length > 0) {
      const fieldRows = section.fields.map((f) => ({
        report_template_section_id: sectionRow.id,
        label: f.label,
        field_type: f.field_type,
        sort_order: f.sort_order,
        config: f.config as unknown as Json,
      }))

      const { error: fErr } = await supabase
        .from('report_template_fields')
        .insert(fieldRows)

      if (fErr) throw fErr
    }
  }
}

/**
 * Restore a previous version as the new latest version.
 */
export async function restoreReportTemplateVersion(
  templateId: string,
  versionId: string,
): Promise<void> {
  const user = await getCurrentAuthUser()

  // Fetch the version to restore (with sections + fields)
  const { data: oldVersion, error: ovErr } = await supabase
    .from('report_template_versions')
    .select('id, version_number')
    .eq('id', versionId)
    .single()

  if (ovErr || !oldVersion) throw ovErr ?? new Error('Version not found')

  // Fetch sections and fields from old version
  const { data: oldSections } = await supabase
    .from('report_template_sections')
    .select('id, title, description, sort_order')
    .eq('report_template_version_id', versionId)
    .order('sort_order')

  const sectionIds = (oldSections ?? []).map((s) => s.id)
  const { data: oldFields } = await supabase
    .from('report_template_fields')
    .select('report_template_section_id, label, field_type, sort_order, config')
    .in('report_template_section_id', sectionIds.length > 0 ? sectionIds : ['__none__'])
    .order('sort_order')

  // Get current latest version number
  const { data: currentVersion, error: cvErr } = await supabase
    .from('report_template_versions')
    .select('id, version_number')
    .eq('report_template_id', templateId)
    .eq('is_latest', true)
    .single()

  if (cvErr || !currentVersion) throw cvErr ?? new Error('No current version')

  // Set current to not latest
  await supabase
    .from('report_template_versions')
    .update({ is_latest: false })
    .eq('id', currentVersion.id)

  // Create new version (restored)
  const newVersionNumber = currentVersion.version_number + 1
  const { data: newVersion, error: nvErr } = await supabase
    .from('report_template_versions')
    .insert({
      report_template_id: templateId,
      version_number: newVersionNumber,
      is_latest: true,
      restored_from: versionId,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (nvErr || !newVersion) throw nvErr ?? new Error('Failed to create restored version')

  // Copy sections and fields
  const fieldsByOldSection = new Map<string, Array<typeof oldFields extends Array<infer T> ? T : never>>()
  for (const f of oldFields ?? []) {
    const list = fieldsByOldSection.get(f.report_template_section_id) ?? []
    list.push(f)
    fieldsByOldSection.set(f.report_template_section_id, list)
  }

  for (const section of oldSections ?? []) {
    const { data: newSection, error: sErr } = await supabase
      .from('report_template_sections')
      .insert({
        report_template_version_id: newVersion.id,
        title: section.title,
        description: section.description,
        sort_order: section.sort_order,
      })
      .select('id')
      .single()

    if (sErr || !newSection) throw sErr ?? new Error('Failed to copy section')

    const sectionFields = fieldsByOldSection.get(section.id) ?? []
    if (sectionFields.length > 0) {
      const fieldRows = sectionFields.map((f) => ({
        report_template_section_id: newSection.id,
        label: f.label,
        field_type: f.field_type,
        sort_order: f.sort_order,
        config: f.config as unknown as Json,
      }))

      const { error: fErr } = await supabase
        .from('report_template_fields')
        .insert(fieldRows)

      if (fErr) throw fErr
    }
  }
}

/**
 * Toggle auto_generate on a report template.
 */
export async function toggleAutoGenerate(
  templateId: string,
  value: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('report_templates')
    .update({ auto_generate: value })
    .eq('id', templateId)

  if (error) throw error
}

/**
 * Soft-delete a report template.
 */
export async function deactivateReportTemplate(
  templateId: string,
): Promise<void> {
  const { error } = await supabase
    .from('report_templates')
    .update({ is_active: false })
    .eq('id', templateId)

  if (error) throw error
}

// ---------------------------------------------------------------------------
// Edge Function callers
// ---------------------------------------------------------------------------

/**
 * Generate a report instance by calling the generate-report Edge Function.
 */
export async function generateReport(
  reportTemplateId: string,
  formInstanceIds: string[],
): Promise<{ report_instance_id: string; readable_id: string }> {
  const { data, error } = await supabase.functions.invoke('generate-report', {
    body: {
      report_template_id: reportTemplateId,
      form_instance_ids: formInstanceIds,
      auto_generated: false,
    },
  })

  if (error) throw error
  if (!data?.success) throw new Error(data?.error ?? 'Failed to generate report')

  return {
    report_instance_id: data.report_instance_id,
    readable_id: data.readable_id,
  }
}

/**
 * Export a report instance as PDF or DOCX.
 * Returns a signed download URL.
 */
export async function exportReport(
  reportInstanceId: string,
  format: 'pdf' | 'docx',
): Promise<string> {
  const { data, error } = await supabase.functions.invoke('export-report', {
    body: {
      report_instance_id: reportInstanceId,
      format,
    },
  })

  if (error) throw error
  if (!data?.success) throw new Error(data?.error ?? 'Failed to export report')

  return data.download_url
}
```

**Step 2: Type-check**

Run: `npx tsc -b`
Expected: Clean (or errors related to missing database types — fixed in Task 10).

**Step 3: Commit**

```
feat(services): add reports service layer with template CRUD and instance operations
```

---

## Task 10: Regenerate TypeScript types

**Files:**
- Modify: `src/types/database.ts`

**Step 1: Regenerate types**

Run: `npx supabase gen types typescript --local 2>/dev/null > src/types/database.ts`

**Step 2: Verify new tables appear**

Open `src/types/database.ts` and confirm these tables are present:
- `report_templates`
- `report_template_versions`
- `report_template_sections`
- `report_template_fields`
- `report_instances`

**Step 3: Type-check the full project**

Run: `npx tsc -b`
Expected: Clean.

**Step 4: Commit**

```
chore(types): regenerate database types with report tables
```

---

## Task 11: Update TODO.md

**Files:**
- Modify: `docs/TODO.md`

**Step 1: Check off completed report backend items**

Mark as complete:
- [x] `report_templates` table + RLS
- [x] `report_template_versions` table + RLS
- [x] `report_template_sections` table + RLS
- [x] `report_template_fields` table + RLS
- [x] `report_instances` table + RLS
- [x] Report triggers (auto-report, short URLs)
- [x] `on-report-instance-ready` Edge Function
- [x] `generate-report` Edge Function
- [x] `export-report` Edge Function
- [x] `trigger_on_form_instance_submitted` (auto-report)

**Step 2: Commit**

```
docs(todo): check off completed report backend items
```

---

## Implementation Order & Dependencies

```
Task 1 (report_templates + versions) → Task 2 (sections + fields) → Task 3 (instances)
  → Task 4 (storage bucket) → Task 5 (triggers)
  → Task 6 (on-report-instance-ready EF) [parallel with Task 7, Task 8]
  → Task 7 (generate-report EF) [parallel with Task 6, Task 8]
  → Task 8 (export-report EF) [parallel with Task 6, Task 7]
  → Task 9 (service layer) → Task 10 (TypeScript types) → Task 11 (TODO.md)
```

Tasks 1-5 must be sequential (schema dependencies).
Tasks 6, 7, 8 are independent Edge Functions and can be built in parallel.
Task 9 depends on types from Task 10 conceptually, but can be written first and type-checked after.
