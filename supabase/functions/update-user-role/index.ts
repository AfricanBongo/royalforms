import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "@supabase/supabase-js"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

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
      .select("id, role, is_active")
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

    if (callerProfile.role !== "root_admin") {
      return new Response(
        JSON.stringify({ success: false, error: "Only root_admin can update user roles" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    // Parse and validate the request body
    const body = await req.json()
    const { user_id, role, group_id, is_active } = body

    if (!user_id || !role || typeof is_active !== "boolean") {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields: user_id, role, is_active" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const validRoles = ["root_admin", "admin", "editor", "viewer"]
    if (!validRoles.includes(role)) {
      return new Response(
        JSON.stringify({ success: false, error: `Invalid role. Must be one of: ${validRoles.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    // Sync JWT metadata via admin API
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
      user_metadata: {
        role,
        group_id: group_id ?? null,
        is_active,
      },
    })

    if (updateError) {
      // Distinguish between not-found and other errors
      if (updateError.message.includes("not found")) {
        return new Response(
          JSON.stringify({ success: false, error: "User not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        )
      }
      return new Response(
        JSON.stringify({ success: false, error: updateError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }
})
