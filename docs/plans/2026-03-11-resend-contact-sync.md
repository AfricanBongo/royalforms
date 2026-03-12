# Resend Contact & Segment Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep Resend contacts and segments in sync with the app's groups and user lifecycle via database triggers and a single Edge Function.

**Architecture:** Database triggers on `groups` (INSERT) and `profiles` (UPDATE, DELETE) fire `pg_net.http_post()` calls to a `sync-resend-contacts` Edge Function. The Edge Function uses the Resend JS SDK (`npm:resend`) to manage contacts and segments. Failed calls are persisted in a `resend_sync_queue` table for retry.

**Tech Stack:** PostgreSQL triggers, pg_net, Supabase Edge Functions (Deno), Resend JS SDK (`npm:resend`), Supabase service-role client.

---

### Task 1: Migration -- Add `resend_segment_id` to `groups` and create `resend_sync_queue` table

**Files:**
- Create: `supabase/migrations/20260312200001_add_resend_sync_schema.sql`

**Step 1: Write the migration SQL**

```sql
-- Add resend_segment_id to groups table
-- Stores the Resend segment ID created when the group is synced
ALTER TABLE public.groups ADD COLUMN resend_segment_id TEXT;

-- Create resend_sync_queue table for retry of failed Resend API calls
CREATE TABLE public.resend_sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL CHECK (action IN (
    'create_segment',
    'create_contact',
    'delete_contact',
    'move_contact',
    'deactivate_contact',
    'reactivate_contact'
  )),
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: only root_admin can read/update the sync queue
ALTER TABLE public.resend_sync_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY resend_sync_queue_select ON public.resend_sync_queue
FOR SELECT USING (
  (select is_active_user()) = true
  AND (select get_current_user_role()) = 'root_admin'
);

CREATE POLICY resend_sync_queue_update ON public.resend_sync_queue
FOR UPDATE USING (
  (select is_active_user()) = true
  AND (select get_current_user_role()) = 'root_admin'
);

-- Allow service role to insert (Edge Function uses service role key)
CREATE POLICY resend_sync_queue_insert ON public.resend_sync_queue
FOR INSERT WITH CHECK (true);

-- Apply updated_at trigger
CREATE TRIGGER set_resend_sync_queue_updated_at
  BEFORE UPDATE ON public.resend_sync_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();
```

**Step 2: Apply the migration**

Run via Supabase MCP: `supabase_apply_migration` with name `add_resend_sync_schema` and the SQL above.

**Step 3: Verify schema**

Run: `supabase_list_tables` (verbose) -- confirm `resend_sync_queue` table exists and `groups.resend_segment_id` column is present.

**Step 4: Run security advisors**

Run: `supabase_get_advisors` (security) -- check for any RLS warnings.

**Step 5: Commit**

```bash
git add supabase/migrations/20260312200001_add_resend_sync_schema.sql
git commit -m "feat(db): add resend_segment_id to groups and resend_sync_queue table"
```

---

### Task 2: Create the `sync-resend-contacts` Edge Function

**Files:**
- Create: `supabase/functions/sync-resend-contacts/index.ts`

**Step 1: Write the Edge Function**

This function follows the `on-instance-created` pattern (trigger-called, no CORS, no auth header, always returns 200). It uses the Resend JS SDK (`npm:resend`).

```typescript
import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "npm:resend";

// Valid actions this function handles
const VALID_ACTIONS = [
  "create_segment",
  "create_contact",
  "delete_contact",
  "move_contact",
  "deactivate_contact",
  "reactivate_contact",
] as const;
type Action = (typeof VALID_ACTIONS)[number];

/**
 * Log a failed sync attempt to the resend_sync_queue table.
 */
async function logFailure(
  supabaseAdmin: ReturnType<typeof createClient>,
  action: string,
  payload: Record<string, unknown>,
  error: string,
): Promise<void> {
  const { error: insertError } = await supabaseAdmin
    .from("resend_sync_queue")
    .insert({
      action,
      payload,
      status: "pending",
      attempts: 1,
      last_error: error,
    });

  if (insertError) {
    console.error(
      "[sync-resend-contacts] Failed to log to sync queue:",
      insertError.message,
    );
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    console.info(
      "[sync-resend-contacts] Rejected non-POST request:",
      req.method,
    );
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  console.info("[sync-resend-contacts] Request received");

  try {
    // Read environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const sbSecretKey = Deno.env.get("SB_SECRET_KEY") ?? "";
    const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
    const generalSegmentId = Deno.env.get("RESEND_GENERAL_SEGMENT_ID") ?? "";

    if (!resendApiKey) {
      console.error("[sync-resend-contacts] RESEND_API_KEY is not set");
      return new Response(
        JSON.stringify({
          success: false,
          error: "Resend not configured",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const resend = new Resend(resendApiKey);
    const supabaseAdmin = createClient(supabaseUrl, sbSecretKey);

    // Parse payload from pg_net trigger
    const body = await req.json();
    const { action, ...payload } = body as { action: string } & Record<
      string,
      unknown
    >;

    if (!action || !VALID_ACTIONS.includes(action as Action)) {
      console.error("[sync-resend-contacts] Invalid action:", action);
      return new Response(
        JSON.stringify({ success: false, error: `Invalid action: ${action}` }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    console.info(
      "[sync-resend-contacts] Processing action:",
      action,
      "payload:",
      JSON.stringify(payload),
    );

    switch (action as Action) {
      // -------------------------------------------------------
      // CREATE_SEGMENT: A new group was created
      // Payload: { group_id, group_name }
      // -------------------------------------------------------
      case "create_segment": {
        const { group_id, group_name } = payload as {
          group_id: string;
          group_name: string;
        };

        const { data, error } = await resend.segments.create({
          name: group_name,
        });

        if (error) {
          console.error(
            "[sync-resend-contacts] Failed to create segment:",
            error.message,
          );
          await logFailure(supabaseAdmin, action, payload, error.message);
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        // Store the Resend segment ID back on the groups table
        const { error: updateError } = await supabaseAdmin
          .from("groups")
          .update({ resend_segment_id: data!.id })
          .eq("id", group_id);

        if (updateError) {
          console.error(
            "[sync-resend-contacts] Failed to store segment ID on group:",
            updateError.message,
          );
          // Segment was created in Resend but we couldn't store the ID locally.
          // Log for manual fix.
          await logFailure(
            supabaseAdmin,
            action,
            { ...payload, resend_segment_id: data!.id },
            `Segment created (${data!.id}) but failed to update groups table: ${updateError.message}`,
          );
        }

        console.info(
          "[sync-resend-contacts] Segment created:",
          data!.id,
          "for group:",
          group_name,
        );
        break;
      }

      // -------------------------------------------------------
      // CREATE_CONTACT: User completed onboarding (active + completed)
      // Payload: { email, first_name, last_name, group_id }
      // -------------------------------------------------------
      case "create_contact": {
        const { email, first_name, last_name, group_id } = payload as {
          email: string;
          first_name: string;
          last_name: string;
          group_id: string;
        };

        // Create the contact in Resend
        const { data: contactData, error: contactError } =
          await resend.contacts.create({
            email,
            firstName: first_name ?? "",
            lastName: last_name ?? "",
          });

        if (contactError) {
          console.error(
            "[sync-resend-contacts] Failed to create contact:",
            contactError.message,
          );
          await logFailure(
            supabaseAdmin,
            action,
            payload,
            contactError.message,
          );
          return new Response(
            JSON.stringify({ success: false, error: contactError.message }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        console.info(
          "[sync-resend-contacts] Contact created:",
          contactData!.id,
        );

        // Add to general segment
        if (generalSegmentId) {
          const { error: generalError } =
            await resend.contacts.segments.add({
              email,
              segmentId: generalSegmentId,
            });
          if (generalError) {
            console.error(
              "[sync-resend-contacts] Failed to add contact to general segment:",
              generalError.message,
            );
            await logFailure(
              supabaseAdmin,
              "create_contact",
              { email, segment: "general", segmentId: generalSegmentId },
              generalError.message,
            );
          }
        }

        // Add to group segment
        if (group_id) {
          const { data: groupRow } = await supabaseAdmin
            .from("groups")
            .select("resend_segment_id")
            .eq("id", group_id)
            .single();

          if (groupRow?.resend_segment_id) {
            const { error: groupError } =
              await resend.contacts.segments.add({
                email,
                segmentId: groupRow.resend_segment_id,
              });
            if (groupError) {
              console.error(
                "[sync-resend-contacts] Failed to add contact to group segment:",
                groupError.message,
              );
              await logFailure(
                supabaseAdmin,
                "create_contact",
                {
                  email,
                  segment: "group",
                  segmentId: groupRow.resend_segment_id,
                },
                groupError.message,
              );
            }
          } else {
            console.warn(
              "[sync-resend-contacts] Group",
              group_id,
              "has no resend_segment_id -- skipping group segment add",
            );
          }
        }

        break;
      }

      // -------------------------------------------------------
      // DELETE_CONTACT: User's profile was deleted (cascade from auth.users)
      // Payload: { email }
      // -------------------------------------------------------
      case "delete_contact": {
        const { email } = payload as { email: string };

        const { error } = await resend.contacts.remove({ email });

        if (error) {
          console.error(
            "[sync-resend-contacts] Failed to delete contact:",
            error.message,
          );
          await logFailure(supabaseAdmin, action, payload, error.message);
        } else {
          console.info(
            "[sync-resend-contacts] Contact deleted:",
            email,
          );
        }
        break;
      }

      // -------------------------------------------------------
      // DEACTIVATE_CONTACT: User was deactivated (is_active -> false)
      // Payload: { email, group_id }
      // -------------------------------------------------------
      case "deactivate_contact": {
        const { email, group_id } = payload as {
          email: string;
          group_id: string;
        };

        // Remove from general segment
        if (generalSegmentId) {
          const { error: generalError } =
            await resend.contacts.segments.remove({
              email,
              segmentId: generalSegmentId,
            });
          if (generalError) {
            console.error(
              "[sync-resend-contacts] Failed to remove from general segment:",
              generalError.message,
            );
            await logFailure(
              supabaseAdmin,
              action,
              { email, segment: "general" },
              generalError.message,
            );
          }
        }

        // Remove from group segment
        if (group_id) {
          const { data: groupRow } = await supabaseAdmin
            .from("groups")
            .select("resend_segment_id")
            .eq("id", group_id)
            .single();

          if (groupRow?.resend_segment_id) {
            const { error: groupError } =
              await resend.contacts.segments.remove({
                email,
                segmentId: groupRow.resend_segment_id,
              });
            if (groupError) {
              console.error(
                "[sync-resend-contacts] Failed to remove from group segment:",
                groupError.message,
              );
              await logFailure(
                supabaseAdmin,
                action,
                {
                  email,
                  segment: "group",
                  segmentId: groupRow.resend_segment_id,
                },
                groupError.message,
              );
            }
          }
        }

        console.info("[sync-resend-contacts] Contact deactivated:", email);
        break;
      }

      // -------------------------------------------------------
      // REACTIVATE_CONTACT: User was reactivated (is_active -> true)
      // Payload: { email, first_name, last_name, group_id }
      // -------------------------------------------------------
      case "reactivate_contact": {
        const { email, first_name, last_name, group_id } = payload as {
          email: string;
          first_name: string;
          last_name: string;
          group_id: string;
        };

        // Ensure contact exists in Resend (may have been removed)
        // contacts.create is idempotent -- if the contact already exists,
        // Resend returns the existing contact
        await resend.contacts.create({
          email,
          firstName: first_name ?? "",
          lastName: last_name ?? "",
        });

        // Add back to general segment
        if (generalSegmentId) {
          const { error: generalError } =
            await resend.contacts.segments.add({
              email,
              segmentId: generalSegmentId,
            });
          if (generalError) {
            console.error(
              "[sync-resend-contacts] Failed to re-add to general segment:",
              generalError.message,
            );
            await logFailure(
              supabaseAdmin,
              action,
              { email, segment: "general" },
              generalError.message,
            );
          }
        }

        // Add back to group segment
        if (group_id) {
          const { data: groupRow } = await supabaseAdmin
            .from("groups")
            .select("resend_segment_id")
            .eq("id", group_id)
            .single();

          if (groupRow?.resend_segment_id) {
            const { error: groupError } =
              await resend.contacts.segments.add({
                email,
                segmentId: groupRow.resend_segment_id,
              });
            if (groupError) {
              console.error(
                "[sync-resend-contacts] Failed to re-add to group segment:",
                groupError.message,
              );
              await logFailure(
                supabaseAdmin,
                action,
                {
                  email,
                  segment: "group",
                  segmentId: groupRow.resend_segment_id,
                },
                groupError.message,
              );
            }
          }
        }

        console.info("[sync-resend-contacts] Contact reactivated:", email);
        break;
      }

      // -------------------------------------------------------
      // MOVE_CONTACT: User was moved to a different group
      // Payload: { email, old_group_id, new_group_id }
      // -------------------------------------------------------
      case "move_contact": {
        const { email, old_group_id, new_group_id } = payload as {
          email: string;
          old_group_id: string;
          new_group_id: string;
        };

        // Remove from old group segment
        if (old_group_id) {
          const { data: oldGroup } = await supabaseAdmin
            .from("groups")
            .select("resend_segment_id")
            .eq("id", old_group_id)
            .single();

          if (oldGroup?.resend_segment_id) {
            const { error: removeError } =
              await resend.contacts.segments.remove({
                email,
                segmentId: oldGroup.resend_segment_id,
              });
            if (removeError) {
              console.error(
                "[sync-resend-contacts] Failed to remove from old group segment:",
                removeError.message,
              );
              await logFailure(
                supabaseAdmin,
                action,
                {
                  email,
                  segment: "old_group",
                  segmentId: oldGroup.resend_segment_id,
                },
                removeError.message,
              );
            }
          }
        }

        // Add to new group segment
        if (new_group_id) {
          const { data: newGroup } = await supabaseAdmin
            .from("groups")
            .select("resend_segment_id")
            .eq("id", new_group_id)
            .single();

          if (newGroup?.resend_segment_id) {
            const { error: addError } =
              await resend.contacts.segments.add({
                email,
                segmentId: newGroup.resend_segment_id,
              });
            if (addError) {
              console.error(
                "[sync-resend-contacts] Failed to add to new group segment:",
                addError.message,
              );
              await logFailure(
                supabaseAdmin,
                action,
                {
                  email,
                  segment: "new_group",
                  segmentId: newGroup.resend_segment_id,
                },
                addError.message,
              );
            }
          }
        }

        console.info(
          "[sync-resend-contacts] Contact moved:",
          email,
          "from group",
          old_group_id,
          "to",
          new_group_id,
        );
        break;
      }
    }

    return new Response(
      JSON.stringify({ success: true, action }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[sync-resend-contacts] Unhandled error:", message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
});
```

**Step 2: Verify the function compiles**

Since this is a Deno Edge Function, verify by checking syntax. The `npm:resend` specifier is how Deno imports npm packages.

**Step 3: Commit**

```bash
git add supabase/functions/sync-resend-contacts/index.ts
git commit -m "feat(edge-fn): add sync-resend-contacts Edge Function for Resend contact/segment sync"
```

---

### Task 3: Migration -- Create database triggers for Resend sync

**Files:**
- Create: `supabase/migrations/20260312200002_create_resend_sync_triggers.sql`

**Step 1: Write the migration SQL**

This follows the exact patterns from `20260310000008_create_form_instance_created_trigger.sql` and `20260312100005_create_report_triggers.sql`.

```sql
-- ============================================================
-- Trigger 1: Sync new group to Resend as a segment
-- Fires AFTER INSERT on groups.
-- Calls sync-resend-contacts Edge Function with action: 'create_segment'
-- ============================================================

CREATE OR REPLACE FUNCTION public.trigger_on_group_created_sync_resend()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, net
AS $$
DECLARE
  _payload jsonb;
BEGIN
  _payload := jsonb_build_object(
    'action', 'create_segment',
    'group_id', NEW.id,
    'group_name', NEW.name
  );

  PERFORM net.http_post(
    url    := 'http://supabase_kong_royalforms:8000/functions/v1/sync-resend-contacts',
    body   := _payload,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_group_created_sync_resend
  AFTER INSERT ON public.groups
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_on_group_created_sync_resend();


-- ============================================================
-- Trigger 2: Sync profile changes to Resend
-- Fires AFTER UPDATE on profiles.
-- Detects which change occurred and sends the appropriate action.
-- ============================================================

CREATE OR REPLACE FUNCTION public.trigger_on_profile_updated_sync_resend()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, net
AS $$
DECLARE
  _payload jsonb;
BEGIN
  -- Case 1: User completed onboarding (invite_status changed to 'completed')
  -- Only fire if user is active (meets "active onboarded" criteria)
  IF OLD.invite_status = 'invite_sent'
     AND NEW.invite_status = 'completed'
     AND NEW.is_active = true
  THEN
    _payload := jsonb_build_object(
      'action', 'create_contact',
      'email', NEW.email,
      'first_name', COALESCE(NEW.first_name, ''),
      'last_name', COALESCE(NEW.last_name, ''),
      'group_id', NEW.group_id
    );

    PERFORM net.http_post(
      url    := 'http://supabase_kong_royalforms:8000/functions/v1/sync-resend-contacts',
      body   := _payload,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 5000
    );

    RETURN NEW;
  END IF;

  -- Case 2: User deactivated (is_active changed true -> false)
  -- Only for onboarded users (invite_status = 'completed')
  IF OLD.is_active = true
     AND NEW.is_active = false
     AND NEW.invite_status = 'completed'
  THEN
    _payload := jsonb_build_object(
      'action', 'deactivate_contact',
      'email', NEW.email,
      'group_id', NEW.group_id
    );

    PERFORM net.http_post(
      url    := 'http://supabase_kong_royalforms:8000/functions/v1/sync-resend-contacts',
      body   := _payload,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 5000
    );

    RETURN NEW;
  END IF;

  -- Case 3: User reactivated (is_active changed false -> true)
  -- Only for onboarded users
  IF OLD.is_active = false
     AND NEW.is_active = true
     AND NEW.invite_status = 'completed'
  THEN
    _payload := jsonb_build_object(
      'action', 'reactivate_contact',
      'email', NEW.email,
      'first_name', COALESCE(NEW.first_name, ''),
      'last_name', COALESCE(NEW.last_name, ''),
      'group_id', NEW.group_id
    );

    PERFORM net.http_post(
      url    := 'http://supabase_kong_royalforms:8000/functions/v1/sync-resend-contacts',
      body   := _payload,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 5000
    );

    RETURN NEW;
  END IF;

  -- Case 4: User moved to a different group
  -- Only for active, onboarded users
  IF OLD.group_id IS DISTINCT FROM NEW.group_id
     AND NEW.is_active = true
     AND NEW.invite_status = 'completed'
  THEN
    _payload := jsonb_build_object(
      'action', 'move_contact',
      'email', NEW.email,
      'old_group_id', OLD.group_id,
      'new_group_id', NEW.group_id
    );

    PERFORM net.http_post(
      url    := 'http://supabase_kong_royalforms:8000/functions/v1/sync-resend-contacts',
      body   := _payload,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 5000
    );

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_profile_updated_sync_resend
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_on_profile_updated_sync_resend();


-- ============================================================
-- Trigger 3: Remove contact from Resend when profile is deleted
-- Fires BEFORE DELETE on profiles (so we can still read OLD values).
-- ============================================================

CREATE OR REPLACE FUNCTION public.trigger_on_profile_deleted_sync_resend()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, net
AS $$
DECLARE
  _payload jsonb;
BEGIN
  -- Only sync contacts that were onboarded (invite_status = 'completed')
  -- Invited-but-not-onboarded users were never added to Resend
  IF OLD.invite_status = 'completed' THEN
    _payload := jsonb_build_object(
      'action', 'delete_contact',
      'email', OLD.email
    );

    PERFORM net.http_post(
      url    := 'http://supabase_kong_royalforms:8000/functions/v1/sync-resend-contacts',
      body   := _payload,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 5000
    );
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER on_profile_deleted_sync_resend
  BEFORE DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_on_profile_deleted_sync_resend();
```

**Step 2: Apply the migration**

Run via Supabase MCP: `supabase_apply_migration` with name `create_resend_sync_triggers`.

**Step 3: Verify triggers exist**

Run: `supabase_execute_sql` with:
```sql
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE trigger_name LIKE '%resend%'
ORDER BY trigger_name;
```

Expected: 3 triggers (`on_group_created_sync_resend`, `on_profile_updated_sync_resend`, `on_profile_deleted_sync_resend`).

**Step 4: Run security advisors**

Run: `supabase_get_advisors` (security).

**Step 5: Commit**

```bash
git add supabase/migrations/20260312200002_create_resend_sync_triggers.sql
git commit -m "feat(db): add pg_net triggers for Resend contact/segment sync"
```

---

### Task 4: Update environment variables

**Files:**
- Modify: `supabase/functions/.env`
- Modify: `supabase-changes.local`

**Step 1: Add env vars to Edge Function .env (local)**

Append to `supabase/functions/.env`:
```
RESEND_API_KEY=re_xxxxxxxxx
RESEND_GENERAL_SEGMENT_ID=
```

Note: `RESEND_API_KEY` will need a real key for testing. `RESEND_GENERAL_SEGMENT_ID` is populated after creating the "General" segment in Resend.

**Step 2: Update supabase-changes.local**

Add under the "Environment Variables" section:
```
- [ ] `RESEND_GENERAL_SEGMENT_ID` -- ID of the "General" segment in Resend (for sync-resend-contacts Edge Function)
```

**Step 3: Commit**

```bash
git add supabase-changes.local
git commit -m "chore: add RESEND_GENERAL_SEGMENT_ID to deployment checklist"
```

Note: Do NOT commit `.env` -- it is gitignored.

---

### Task 5: Generate updated TypeScript types

**Step 1: Generate types**

Run: `supabase gen types typescript --local 2>/dev/null > src/types/database.ts`

**Step 2: Verify the new types include `resend_sync_queue` and updated `groups`**

Read `src/types/database.ts` and confirm:
- `groups` table type includes `resend_segment_id: string | null`
- `resend_sync_queue` table type exists with all columns

**Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "chore: regenerate TypeScript types for Resend sync schema"
```

---

### Task 6: Update `docs/TODO.md`

**Step 1: Check off completed items and add any new items**

In `docs/TODO.md`, find and check off the Resend SDK setup item. Add a new item for the one-time "General" segment creation and data backfill.

**Step 2: Commit**

```bash
git add docs/TODO.md
git commit -m "docs: update TODO for Resend contact sync completion"
```
