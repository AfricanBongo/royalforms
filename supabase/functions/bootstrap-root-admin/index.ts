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
    console.info("[bootstrap-root-admin] Rejected non-POST request:", req.method)
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }

  console.info("[bootstrap-root-admin] Request received")

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const sbSecretKey = Deno.env.get("SB_SECRET_KEY")
    const rootAdminEmail = Deno.env.get("ROOT_ADMIN_EMAIL")
    const rootAdminPassword = Deno.env.get("ROOT_ADMIN_PASSWORD")

    if (!supabaseUrl || !sbSecretKey) {
      console.info("[bootstrap-root-admin] Missing SUPABASE_URL or SB_SECRET_KEY env vars")
      return new Response(
        JSON.stringify({ success: false, error: "Missing SUPABASE_URL or SB_SECRET_KEY" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    if (!rootAdminEmail || !rootAdminPassword) {
      console.info("[bootstrap-root-admin] Missing ROOT_ADMIN_EMAIL or ROOT_ADMIN_PASSWORD env vars")
      return new Response(
        JSON.stringify({ success: false, error: "Missing ROOT_ADMIN_EMAIL or ROOT_ADMIN_PASSWORD" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const supabase = createClient(supabaseUrl, sbSecretKey)

    // Check if a root_admin already exists (idempotency)
    console.info("[bootstrap-root-admin] Checking for existing root_admin profile")
    const { data: existingAdmin, error: selectError } = await supabase
      .from("profiles")
      .select("id")
      .eq("role", "root_admin")
      .limit(1)
      .maybeSingle()

    if (selectError) {
      console.info("[bootstrap-root-admin] Error checking existing admin:", selectError.message)
      return new Response(
        JSON.stringify({ success: false, error: selectError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    if (existingAdmin) {
      console.info("[bootstrap-root-admin] Root admin already exists, skipping creation")
      return new Response(
        JSON.stringify({ created: false, message: "Root admin already exists" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    // Create the auth user
    console.info("[bootstrap-root-admin] Creating auth user")
    const { data: authData, error: createError } = await supabase.auth.admin.createUser({
      email: rootAdminEmail,
      password: rootAdminPassword,
      email_confirm: true,
      user_metadata: {
        full_name: "Root Admin",
        role: "root_admin",
        is_active: true,
      },
    })

    if (createError) {
      console.info("[bootstrap-root-admin] Auth user creation failed:", createError.message)
      return new Response(
        JSON.stringify({ success: false, error: createError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    console.info("[bootstrap-root-admin] Auth user created:", authData.user.id)

    // Insert the profiles row
    console.info("[bootstrap-root-admin] Inserting profiles row")
    const { error: insertError } = await supabase.from("profiles").insert({
      id: authData.user.id,
      email: rootAdminEmail,
      full_name: "Root Admin",
      role: "root_admin",
      group_id: null,
      is_active: true,
    })

    if (insertError) {
      console.info("[bootstrap-root-admin] Profile insert failed:", insertError.message)
      return new Response(
        JSON.stringify({ success: false, error: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    console.info("[bootstrap-root-admin] Completed successfully — root admin created:", authData.user.id)
    return new Response(
      JSON.stringify({ created: true, message: "Root admin created" }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.info("[bootstrap-root-admin] Unhandled error:", message)
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }
})
