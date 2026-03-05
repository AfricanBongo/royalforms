import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "@supabase/supabase-js"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const VALID_ROLES = ["admin", "editor", "viewer"] as const

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    // Service role client for admin API calls (bypasses RLS)
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    // Verify the caller's identity via the auth server
    const token = authHeader.replace("Bearer ", "")
    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !caller) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    // Client scoped to the caller's JWT -- RLS policies apply
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    // Get the caller's profile (uses RLS -- caller can read their own profile)
    const { data: callerProfile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("id, role, group_id, is_active")
      .eq("id", caller.id)
      .single()

    if (profileError || !callerProfile) {
      return new Response(
        JSON.stringify({ success: false, error: "Caller profile not found" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    if (!callerProfile.is_active) {
      return new Response(
        JSON.stringify({ success: false, error: "Account is disabled" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    if (callerProfile.role !== "root_admin" && callerProfile.role !== "admin") {
      return new Response(
        JSON.stringify({ success: false, error: "Insufficient permissions" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    // Parse and validate the request body
    const body = await req.json()
    const { email, full_name, role, group_id } = body

    if (!email || !full_name || !role || !group_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields: email, full_name, role, group_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    if (!VALID_ROLES.includes(role)) {
      return new Response(
        JSON.stringify({ success: false, error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    // Admin callers must have an approved member_request backing this invite
    if (callerProfile.role === "admin") {
      const { data: approvedRequest, error: requestError } = await supabaseClient
        .from("member_requests")
        .select("id")
        .eq("email", email)
        .eq("group_id", group_id)
        .eq("proposed_role", role)
        .eq("status", "approved")
        .limit(1)
        .maybeSingle()

      if (requestError) {
        return new Response(
          JSON.stringify({ success: false, error: requestError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        )
      }

      if (!approvedRequest) {
        return new Response(
          JSON.stringify({ success: false, error: "No approved member request found for this invite" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        )
      }
    }

    // Invite the user via Supabase Auth admin API
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email,
      {
        data: {
          full_name,
          role,
          group_id,
          is_active: true,
        },
      },
    )

    if (inviteError) {
      return new Response(
        JSON.stringify({ success: false, error: inviteError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    // Create the profiles row via service role (no INSERT RLS policy on profiles)
    const { error: insertError } = await supabaseAdmin.from("profiles").insert({
      id: inviteData.user.id,
      email,
      full_name,
      role,
      group_id,
      is_active: true,
    })

    if (insertError) {
      return new Response(
        JSON.stringify({ success: false, error: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    return new Response(
      JSON.stringify({ success: true, user_id: inviteData.user.id }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }
})
