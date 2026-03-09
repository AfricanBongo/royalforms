import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const VALID_ROLES = ["admin", "editor", "viewer"] as const;

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    console.info("[invite-user] Rejected non-POST request:", req.method);
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  console.info("[invite-user] Request received");

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const sbPublishableKey = Deno.env.get("SB_PUBLISHABLE_KEY") ?? "";
    const sbSecretKey = Deno.env.get("SB_SECRET_KEY") ?? "";

    console.info("[invite-user] Supabase URL:", supabaseUrl);
    console.info("[invite-user] Supabase Publishable Key:", sbPublishableKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.info("[invite-user] Missing Authorization header");
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
      console.info("[invite-user] Auth verification failed");
      return new Response(
        JSON.stringify({ success: false, error: "Invalid or expired token" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.info("[invite-user] Caller authenticated:", caller.id);

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
        "[invite-user] Caller profile not found for user:",
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
      console.info("[invite-user] Caller account is disabled:", caller.id);
      return new Response(
        JSON.stringify({ success: false, error: "Account is disabled" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (callerProfile.role !== "root_admin" && callerProfile.role !== "admin") {
      console.info(
        "[invite-user] Insufficient permissions, caller role:",
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

    // Parse and validate the request body
    const body = await req.json();
    const { email, full_name, role, group_id } = body;

    if (!email || !full_name || !role || !group_id) {
      console.info("[invite-user] Missing required fields in request body");
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required fields: email, full_name, role, group_id",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!VALID_ROLES.includes(role)) {
      console.info("[invite-user] Invalid role provided:", role);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.info(
      "[invite-user] Inviting user with email:",
      email,
      "role:",
      role,
      "group:",
      group_id,
    );

    // Admin callers must have an approved member_request backing this invite
    if (callerProfile.role === "admin") {
      console.info(
        "[invite-user] Admin caller — checking for approved member request",
      );
      const { data: approvedRequest, error: requestError } =
        await supabaseClient
          .from("member_requests")
          .select("id")
          .eq("email", email)
          .eq("group_id", group_id)
          .eq("proposed_role", role)
          .eq("status", "approved")
          .limit(1)
          .maybeSingle();

      if (requestError) {
        console.error(
          "[invite-user] Error checking approved request:",
          requestError.message,
        );
        return new Response(
          JSON.stringify({ success: false, error: requestError.message }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      if (!approvedRequest) {
        console.info(
          "[invite-user] No approved member request found for email:",
          email,
        );
        return new Response(
          JSON.stringify({
            success: false,
            error: "No approved member request found for this invite",
          }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      console.info("[invite-user] Approved request found:", approvedRequest.id);
    }

    // Invite the user via Supabase Auth admin API
    const siteUrl = Deno.env.get("SITE_URL") ?? ""
    const redirectTo = siteUrl ? `${siteUrl}/invite/accept` : undefined
    console.info(
      "[invite-user] Calling auth.admin.inviteUserByEmail for:",
      email,
      "redirectTo:",
      redirectTo ?? "(default)",
    );
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth
      .admin.inviteUserByEmail(
        email,
        {
          redirectTo,
          data: {
            full_name,
            role,
            group_id,
            is_active: true,
          },
        },
      );

    if (inviteError) {
      console.error("[invite-user] Invite failed:", inviteError.message);
      return new Response(
        JSON.stringify({ success: false, error: inviteError.message }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.info("[invite-user] Auth user created:", inviteData.user.id);

    // Create the profiles row via service role (no INSERT RLS policy on profiles)
    console.info(
      "[invite-user] Inserting profiles row for:",
      inviteData.user.id,
    );
    const { error: insertError } = await supabaseAdmin.from("profiles").insert({
      id: inviteData.user.id,
      email,
      full_name,
      role,
      group_id,
      is_active: true,
      invite_status: "invite_sent",
      last_invite_sent_at: new Date().toISOString(),
    });

    if (insertError) {
      console.info("[invite-user] Profile insert failed:", insertError.message);
      return new Response(
        JSON.stringify({ success: false, error: insertError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.info(
      "[invite-user] Completed successfully — user:",
      inviteData.user.id,
      "email:",
      email,
      "role:",
      role,
    );
    return new Response(
      JSON.stringify({ success: true, user_id: inviteData.user.id }),
      {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.info("[invite-user] Unhandled error:", message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
