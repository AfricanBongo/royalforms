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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    const rootAdminEmail = Deno.env.get("ROOT_ADMIN_EMAIL")
    const rootAdminPassword = Deno.env.get("ROOT_ADMIN_PASSWORD")

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    if (!rootAdminEmail || !rootAdminPassword) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing ROOT_ADMIN_EMAIL or ROOT_ADMIN_PASSWORD" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // Check if a root_admin already exists (idempotency)
    const { data: existingAdmin, error: selectError } = await supabase
      .from("profiles")
      .select("id")
      .eq("role", "root_admin")
      .limit(1)
      .maybeSingle()

    if (selectError) {
      return new Response(
        JSON.stringify({ success: false, error: selectError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    if (existingAdmin) {
      return new Response(
        JSON.stringify({ created: false, message: "Root admin already exists" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    // Create the auth user
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
      return new Response(
        JSON.stringify({ success: false, error: createError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    // Insert the profiles row
    const { error: insertError } = await supabase.from("profiles").insert({
      id: authData.user.id,
      email: rootAdminEmail,
      full_name: "Root Admin",
      role: "root_admin",
      group_id: null,
      is_active: true,
    })

    if (insertError) {
      return new Response(
        JSON.stringify({ success: false, error: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    return new Response(
      JSON.stringify({ created: true, message: "Root admin created" }),
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
