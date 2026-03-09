import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const VALID_ACTIONS = ["resend", "change_email", "delete"] as const;
type Action = (typeof VALID_ACTIONS)[number];

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    console.info("[manage-invite] Rejected non-POST request:", req.method);
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  console.info("[manage-invite] Request received");

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const sbPublishableKey = Deno.env.get("SB_PUBLISHABLE_KEY") ?? "";
    const sbSecretKey = Deno.env.get("SB_SECRET_KEY") ?? "";

    console.info("[manage-invite] Supabase URL:", supabaseUrl);
    console.info("[manage-invite] Supabase Publishable Key:", sbPublishableKey);

    // --- Authorization ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.info("[manage-invite] Missing Authorization header");
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing Authorization header",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Service role client for admin API calls (bypasses RLS)
    const supabaseAdmin = createClient(supabaseUrl, sbSecretKey);

    // Verify the caller's identity via the auth server
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await supabaseAdmin
      .auth.getUser(token);
    if (authError || !caller?.email) {
      console.info("[manage-invite] Auth verification failed");
      return new Response(
        JSON.stringify({ success: false, error: "Invalid or expired token" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.info("[manage-invite] Caller authenticated:", caller.id);

    // Client scoped to the caller's JWT -- RLS policies apply
    const supabaseClient = createClient(supabaseUrl, sbPublishableKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get the caller's profile (uses RLS -- caller can read their own profile)
    const { data: callerProfile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("id, role, group_id, is_active")
      .eq("id", caller.id)
      .single();

    if (profileError || !callerProfile) {
      console.info(
        "[manage-invite] Caller profile not found for user:",
        caller.id,
      );
      return new Response(
        JSON.stringify({ success: false, error: "Caller profile not found" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!callerProfile.is_active) {
      console.info("[manage-invite] Caller account is disabled:", caller.id);
      return new Response(
        JSON.stringify({ success: false, error: "Account is disabled" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Root admin only
    if (callerProfile.role !== "root_admin") {
      console.info(
        "[manage-invite] Insufficient permissions, caller role:",
        callerProfile.role,
      );
      return new Response(
        JSON.stringify({ success: false, error: "Insufficient permissions" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // --- Parse and validate request body ---
    const body = await req.json();
    const { action, user_id, new_email } = body as {
      action: string;
      user_id: string;
      new_email?: string;
    };

    if (!action || !user_id) {
      console.info("[manage-invite] Missing required fields: action, user_id");
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required fields: action, user_id",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!VALID_ACTIONS.includes(action as Action)) {
      console.info("[manage-invite] Invalid action:", action);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(", ")}`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.info(
      "[manage-invite] Action:",
      action,
      "Target user_id:",
      user_id,
    );

    // --- Fetch target profile ---
    const { data: targetProfile, error: targetError } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, role, group_id, invite_status, last_invite_sent_at")
      .eq("id", user_id)
      .single();

    if (targetError || !targetProfile) {
      console.info(
        "[manage-invite] Target profile not found for user_id:",
        user_id,
      );
      return new Response(
        JSON.stringify({ success: false, error: "Target user not found" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.info(
      "[manage-invite] Target user:",
      targetProfile.id,
      "email:",
      targetProfile.email,
      "invite_status:",
      targetProfile.invite_status,
    );

    if (targetProfile.invite_status !== "invite_sent") {
      console.info(
        "[manage-invite] Target user invite_status is not 'invite_sent':",
        targetProfile.invite_status,
      );
      return new Response(
        JSON.stringify({
          success: false,
          error: "User is not in 'invite_sent' status",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Rate limit: resend and change_email require 1 hour between invites
    const RATE_LIMIT_MS = 60 * 60 * 1000; // 1 hour
    if (
      (action === "resend" || action === "change_email") &&
      targetProfile.last_invite_sent_at
    ) {
      const lastSent = new Date(targetProfile.last_invite_sent_at).getTime();
      const elapsed = Date.now() - lastSent;
      if (elapsed < RATE_LIMIT_MS) {
        const remainingMin = Math.ceil((RATE_LIMIT_MS - elapsed) / 60000);
        console.info(
          "[manage-invite] Rate limited — last invite sent",
          Math.round(elapsed / 60000),
          "minutes ago, must wait",
          remainingMin,
          "more minutes",
        );
        return new Response(
          JSON.stringify({
            success: false,
            error: `Please wait ${remainingMin} minute${remainingMin === 1 ? "" : "s"} before resending the invite`,
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    // Read SITE_URL for redirectTo
    const siteUrl = Deno.env.get("SITE_URL") ?? "";
    const redirectTo = siteUrl ? `${siteUrl}/invite/accept` : undefined;

    // --- Handle actions ---
    if (action === "resend") {
      console.info(
        "[manage-invite] Resending invite to:",
        targetProfile.email,
      );

      const { error: inviteError } = await supabaseAdmin.auth.admin
        .inviteUserByEmail(
          targetProfile.email,
          {
            redirectTo,
            data: {
              full_name: targetProfile.full_name,
              role: targetProfile.role,
              group_id: targetProfile.group_id,
              is_active: true,
            },
          },
        );

      if (inviteError) {
        console.error(
          "[manage-invite] Resend invite failed:",
          inviteError.message,
        );
        return new Response(
          JSON.stringify({ success: false, error: inviteError.message }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Update rate limit timestamp
      await supabaseAdmin
        .from("profiles")
        .update({ last_invite_sent_at: new Date().toISOString() })
        .eq("id", user_id);

      console.info(
        "[manage-invite] Invite resent successfully to:",
        targetProfile.email,
      );
      return new Response(
        JSON.stringify({ success: true }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (action === "change_email") {
      if (!new_email || !new_email.trim()) {
        console.info("[manage-invite] Missing new_email for change_email action");
        return new Response(
          JSON.stringify({
            success: false,
            error: "new_email is required for change_email action",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      console.info(
        "[manage-invite] Changing email from:",
        targetProfile.email,
        "to:",
        new_email,
      );

      // 1. Update auth user email
      const { error: updateAuthError } = await supabaseAdmin.auth.admin
        .updateUserById(user_id, { email: new_email });
      if (updateAuthError) {
        console.error(
          "[manage-invite] Auth email update failed:",
          updateAuthError.message,
        );
        return new Response(
          JSON.stringify({ success: false, error: updateAuthError.message }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      console.info("[manage-invite] Auth user email updated");

      // 2. Update profiles row
      const { error: updateProfileError } = await supabaseAdmin
        .from("profiles")
        .update({ email: new_email })
        .eq("id", user_id);
      if (updateProfileError) {
        console.error(
          "[manage-invite] Profile email update failed:",
          updateProfileError.message,
        );
        return new Response(
          JSON.stringify({ success: false, error: updateProfileError.message }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      console.info("[manage-invite] Profile email updated");

      // 3. Update member_requests rows
      const { error: updateRequestError } = await supabaseAdmin
        .from("member_requests")
        .update({ email: new_email })
        .eq("email", targetProfile.email)
        .eq("group_id", targetProfile.group_id);
      if (updateRequestError) {
        console.error(
          "[manage-invite] Member request email update failed:",
          updateRequestError.message,
        );
        return new Response(
          JSON.stringify({
            success: false,
            error: updateRequestError.message,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      console.info("[manage-invite] Member request emails updated");

      // 4. Send invite to new email
      const { error: inviteError } = await supabaseAdmin.auth.admin
        .inviteUserByEmail(
          new_email,
          {
            redirectTo,
            data: {
              full_name: targetProfile.full_name,
              role: targetProfile.role,
              group_id: targetProfile.group_id,
              is_active: true,
            },
          },
        );
      if (inviteError) {
        console.error(
          "[manage-invite] Invite to new email failed:",
          inviteError.message,
        );
        return new Response(
          JSON.stringify({ success: false, error: inviteError.message }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Update rate limit timestamp
      await supabaseAdmin
        .from("profiles")
        .update({ last_invite_sent_at: new Date().toISOString() })
        .eq("id", user_id);

      console.info(
        "[manage-invite] Email changed and invite sent to:",
        new_email,
      );
      return new Response(
        JSON.stringify({ success: true }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (action === "delete") {
      console.info(
        "[manage-invite] Deleting invited user:",
        user_id,
        "email:",
        targetProfile.email,
      );

      // 1. Cancel related member_requests
      const { error: cancelError } = await supabaseAdmin
        .from("member_requests")
        .update({ status: "cancelled" })
        .eq("email", targetProfile.email)
        .eq("group_id", targetProfile.group_id)
        .in("status", ["approved"]);
      if (cancelError) {
        console.error(
          "[manage-invite] Cancel member requests failed:",
          cancelError.message,
        );
        return new Response(
          JSON.stringify({ success: false, error: cancelError.message }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      console.info("[manage-invite] Related member requests cancelled");

      // 2. Delete auth user (cascades to profiles via FK)
      const { error: deleteError } = await supabaseAdmin.auth.admin
        .deleteUser(user_id);
      if (deleteError) {
        console.error(
          "[manage-invite] Delete auth user failed:",
          deleteError.message,
        );
        return new Response(
          JSON.stringify({ success: false, error: deleteError.message }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      console.info(
        "[manage-invite] User deleted successfully:",
        user_id,
      );
      return new Response(
        JSON.stringify({ success: true }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Should never reach here due to VALID_ACTIONS check above
    return new Response(
      JSON.stringify({ success: false, error: "Unhandled action" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.info("[manage-invite] Unhandled error:", message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
