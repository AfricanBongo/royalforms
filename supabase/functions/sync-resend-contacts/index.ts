import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "@supabase/supabase-js"
import { Resend } from "npm:resend"

const VALID_ACTIONS = [
  "create_segment",
  "create_contact",
  "delete_contact",
  "move_contact",
  "deactivate_contact",
  "reactivate_contact",
] as const

type Action = (typeof VALID_ACTIONS)[number]

// ---------------------------------------------------------------------------
// Helper: log a failed Resend sync to the retry queue
// ---------------------------------------------------------------------------
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
    })
  if (insertError) {
    console.error(
      "[sync-resend-contacts] Failed to log to sync queue:",
      insertError.message,
    )
  }
}

// ---------------------------------------------------------------------------
// Helper: look up a group's resend_segment_id by group_id
// ---------------------------------------------------------------------------
async function lookupGroupSegmentId(
  supabaseAdmin: ReturnType<typeof createClient>,
  groupId: string,
): Promise<string | null> {
  const { data: group, error } = await supabaseAdmin
    .from("groups")
    .select("resend_segment_id")
    .eq("id", groupId)
    .single()

  if (error) {
    console.error(
      "[sync-resend-contacts] Group lookup failed for",
      groupId,
      ":",
      error.message,
    )
    return null
  }
  return group?.resend_segment_id ?? null
}

// ---------------------------------------------------------------------------
// Helper: ensure a contact exists in Resend and is added to both segments
// Used by both create_contact and reactivate_contact.
// ---------------------------------------------------------------------------
async function ensureContactInSegments(
  resend: Resend,
  supabaseAdmin: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
  generalSegmentId: string,
  actionName: string,
): Promise<void> {
  const { email, first_name, last_name, group_id } = payload as {
    email: string
    first_name: string
    last_name: string
    group_id: string
  }

  // 1. Create the contact in Resend (idempotent — safe for reactivation)
  const { data, error } = await resend.contacts.create({
    email,
    firstName: first_name,
    lastName: last_name,
  })
  if (error) {
    console.error(
      `[sync-resend-contacts] ${actionName} create failed:`,
      error.message,
    )
    await logFailure(supabaseAdmin, actionName, payload, error.message)
    return
  }

  console.info(`[sync-resend-contacts] Contact created/ensured:`, data?.id, email)

  // 2. Look up the group's resend_segment_id
  const segmentId = await lookupGroupSegmentId(supabaseAdmin, group_id)
  if (!segmentId) {
    const msg = "Group has no resend_segment_id"
    await logFailure(
      supabaseAdmin,
      actionName,
      payload,
      `Group segment lookup failed: ${msg}`,
    )
    return
  }

  // 3. Add contact to the General segment
  const { error: generalErr } = await resend.contacts.segments.add({
    email,
    segmentId: generalSegmentId,
  })
  if (generalErr) {
    console.error(
      "[sync-resend-contacts] Failed to add contact to General segment:",
      generalErr.message,
    )
    await logFailure(
      supabaseAdmin,
      actionName,
      { ...payload, step: "add_to_general_segment" },
      generalErr.message,
    )
    return
  }

  // 4. Add contact to their group segment
  const { error: groupSegErr } = await resend.contacts.segments.add({
    email,
    segmentId,
  })
  if (groupSegErr) {
    console.error(
      "[sync-resend-contacts] Failed to add contact to group segment:",
      groupSegErr.message,
    )
    await logFailure(
      supabaseAdmin,
      actionName,
      { ...payload, step: "add_to_group_segment" },
      groupSegErr.message,
    )
    return
  }

  console.info(
    `[sync-resend-contacts] Contact added to General and group segments (${actionName}):`,
    email,
  )
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------
async function handleCreateSegment(
  resend: Resend,
  supabaseAdmin: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
): Promise<void> {
  const { group_id, group_name } = payload as {
    group_id: string
    group_name: string
  }

  const { data, error } = await resend.segments.create({ name: group_name })
  if (error) {
    console.error(
      "[sync-resend-contacts] create_segment failed:",
      error.message,
    )
    await logFailure(supabaseAdmin, "create_segment", payload, error.message)
    return
  }

  console.info(
    "[sync-resend-contacts] Segment created:",
    data?.id,
    "for group:",
    group_id,
  )

  // Write back the Resend segment ID to the groups table
  const { error: updateError } = await supabaseAdmin
    .from("groups")
    .update({ resend_segment_id: data?.id })
    .eq("id", group_id)

  if (updateError) {
    console.error(
      "[sync-resend-contacts] Failed to update groups.resend_segment_id:",
      updateError.message,
    )
    await logFailure(
      supabaseAdmin,
      "create_segment",
      { ...payload, resend_segment_id: data?.id },
      `DB update failed: ${updateError.message}`,
    )
  }
}

async function handleCreateContact(
  resend: Resend,
  supabaseAdmin: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
  generalSegmentId: string,
): Promise<void> {
  await ensureContactInSegments(
    resend,
    supabaseAdmin,
    payload,
    generalSegmentId,
    "create_contact",
  )
}

async function handleDeleteContact(
  resend: Resend,
  supabaseAdmin: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
): Promise<void> {
  const { email } = payload as { email: string }

  const { error } = await resend.contacts.remove({ email })
  if (error) {
    console.error(
      "[sync-resend-contacts] delete_contact failed:",
      error.message,
    )
    await logFailure(supabaseAdmin, "delete_contact", payload, error.message)
    return
  }

  console.info("[sync-resend-contacts] Contact deleted:", email)
}

async function handleDeactivateContact(
  resend: Resend,
  supabaseAdmin: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
  generalSegmentId: string,
): Promise<void> {
  const { email, group_id } = payload as {
    email: string
    group_id: string
  }

  // Look up the group's resend_segment_id
  const segmentId = await lookupGroupSegmentId(supabaseAdmin, group_id)
  if (!segmentId) {
    await logFailure(
      supabaseAdmin,
      "deactivate_contact",
      payload,
      "Group segment lookup failed: Group has no resend_segment_id",
    )
    return
  }

  // Remove from General segment
  const { error: generalErr } = await resend.contacts.segments.remove({
    email,
    segmentId: generalSegmentId,
  })
  if (generalErr) {
    console.error(
      "[sync-resend-contacts] Failed to remove contact from General segment:",
      generalErr.message,
    )
    await logFailure(
      supabaseAdmin,
      "deactivate_contact",
      { ...payload, step: "remove_from_general_segment" },
      generalErr.message,
    )
    return
  }

  // Remove from group segment
  const { error: groupSegErr } = await resend.contacts.segments.remove({
    email,
    segmentId,
  })
  if (groupSegErr) {
    console.error(
      "[sync-resend-contacts] Failed to remove contact from group segment:",
      groupSegErr.message,
    )
    await logFailure(
      supabaseAdmin,
      "deactivate_contact",
      { ...payload, step: "remove_from_group_segment" },
      groupSegErr.message,
    )
    return
  }

  console.info("[sync-resend-contacts] Contact deactivated:", email)
}

async function handleReactivateContact(
  resend: Resend,
  supabaseAdmin: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
  generalSegmentId: string,
): Promise<void> {
  await ensureContactInSegments(
    resend,
    supabaseAdmin,
    payload,
    generalSegmentId,
    "reactivate_contact",
  )
}

async function handleMoveContact(
  resend: Resend,
  supabaseAdmin: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
): Promise<void> {
  const { email, old_group_id, new_group_id } = payload as {
    email: string
    old_group_id: string
    new_group_id: string
  }

  // Look up both groups' resend_segment_ids (batch query — 1 round trip)
  const { data: groups, error: groupsError } = await supabaseAdmin
    .from("groups")
    .select("id, resend_segment_id")
    .in("id", [old_group_id, new_group_id])

  if (groupsError || !groups || groups.length < 2) {
    const msg = groupsError?.message ?? "Could not find both groups"
    console.error(
      "[sync-resend-contacts] move_contact groups lookup failed:",
      msg,
    )
    await logFailure(
      supabaseAdmin,
      "move_contact",
      payload,
      `Groups lookup failed: ${msg}`,
    )
    return
  }

  const oldGroup = groups.find((g) => g.id === old_group_id)
  const newGroup = groups.find((g) => g.id === new_group_id)

  if (!oldGroup?.resend_segment_id || !newGroup?.resend_segment_id) {
    const msg = "One or both groups missing resend_segment_id"
    console.error("[sync-resend-contacts] move_contact:", msg)
    await logFailure(supabaseAdmin, "move_contact", payload, msg)
    return
  }

  // Remove from old group segment
  const { error: removeErr } = await resend.contacts.segments.remove({
    email,
    segmentId: oldGroup.resend_segment_id,
  })
  if (removeErr) {
    console.error(
      "[sync-resend-contacts] Failed to remove contact from old group segment:",
      removeErr.message,
    )
    await logFailure(
      supabaseAdmin,
      "move_contact",
      { ...payload, step: "remove_from_old_segment" },
      removeErr.message,
    )
    return
  }

  // Add to new group segment
  const { error: addErr } = await resend.contacts.segments.add({
    email,
    segmentId: newGroup.resend_segment_id,
  })
  if (addErr) {
    console.error(
      "[sync-resend-contacts] Failed to add contact to new group segment:",
      addErr.message,
    )
    await logFailure(
      supabaseAdmin,
      "move_contact",
      { ...payload, step: "add_to_new_segment" },
      addErr.message,
    )
    return
  }

  console.info(
    "[sync-resend-contacts] Contact moved from",
    old_group_id,
    "to",
    new_group_id,
    ":",
    email,
  )
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method !== "POST") {
    console.info(
      "[sync-resend-contacts] Rejected non-POST request:",
      req.method,
    )
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )
  }

  console.info("[sync-resend-contacts] Request received")

  try {
    // Read environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
    const sbSecretKey = Deno.env.get("SB_SECRET_KEY") ?? ""
    const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? ""
    const generalSegmentId = Deno.env.get("RESEND_GENERAL_SEGMENT_ID") ?? ""

    if (!supabaseUrl || !sbSecretKey) {
      console.error(
        "[sync-resend-contacts] Missing SUPABASE_URL or SB_SECRET_KEY",
      )
      return new Response(
        JSON.stringify({
          success: false,
          error: "Supabase not configured",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    }

    if (!resendApiKey) {
      console.error("[sync-resend-contacts] Missing RESEND_API_KEY env var")
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing RESEND_API_KEY configuration",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    }

    if (!generalSegmentId) {
      console.error(
        "[sync-resend-contacts] Missing RESEND_GENERAL_SEGMENT_ID env var",
      )
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing RESEND_GENERAL_SEGMENT_ID configuration",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    }

    // Parse the payload from pg_net
    const body = await req.json()
    const action = body.action as string

    if (!action || !VALID_ACTIONS.includes(action as Action)) {
      console.error(
        "[sync-resend-contacts] Invalid or missing action:",
        action,
      )
      return new Response(
        JSON.stringify({
          success: false,
          error: `Invalid action: ${action}`,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    }

    console.info("[sync-resend-contacts] Processing action:", action)

    // Initialize clients
    const supabaseAdmin = createClient(supabaseUrl, sbSecretKey)
    const resend = new Resend(resendApiKey)

    // Route to the appropriate handler
    switch (action as Action) {
      case "create_segment":
        await handleCreateSegment(resend, supabaseAdmin, body)
        break
      case "create_contact":
        await handleCreateContact(resend, supabaseAdmin, body, generalSegmentId)
        break
      case "delete_contact":
        await handleDeleteContact(resend, supabaseAdmin, body)
        break
      case "deactivate_contact":
        await handleDeactivateContact(
          resend,
          supabaseAdmin,
          body,
          generalSegmentId,
        )
        break
      case "reactivate_contact":
        await handleReactivateContact(
          resend,
          supabaseAdmin,
          body,
          generalSegmentId,
        )
        break
      case "move_contact":
        await handleMoveContact(resend, supabaseAdmin, body)
        break
    }

    return new Response(
      JSON.stringify({ success: true, action }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("[sync-resend-contacts] Unhandled error:", message)
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )
  }
})
