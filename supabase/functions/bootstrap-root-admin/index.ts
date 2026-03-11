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
      console.info("[bootstrap-root-admin] Root admin already exists, checking bootstrap group")

      // Check if a bootstrap group already exists
      const { data: existingGroup } = await supabase
        .from("groups")
        .select("id")
        .eq("is_bootstrap", true)
        .limit(1)
        .maybeSingle()

      if (existingGroup) {
        // Check if admin is already assigned to the bootstrap group
        const { data: adminProfile } = await supabase
          .from("profiles")
          .select("group_id")
          .eq("id", existingAdmin.id)
          .single()

        if (adminProfile?.group_id === existingGroup.id) {
          console.info("[bootstrap-root-admin] Bootstrap group already assigned, nothing to do")
          return new Response(
            JSON.stringify({ created: false, message: "Root admin and bootstrap group already set up" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          )
        }

        // Assign existing admin to existing bootstrap group
        console.info("[bootstrap-root-admin] Assigning root admin to existing bootstrap group:", existingGroup.id)
        await supabase
          .from("profiles")
          .update({ group_id: existingGroup.id })
          .eq("id", existingAdmin.id)

        // Sync JWT metadata
        await supabase.auth.admin.updateUserById(existingAdmin.id, {
          user_metadata: { group_id: existingGroup.id },
        })

        return new Response(
          JSON.stringify({ created: false, message: "Root admin assigned to existing bootstrap group" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        )
      }

      // No bootstrap group exists — create one and assign
      console.info("[bootstrap-root-admin] Creating bootstrap group for existing root admin")
      const { data: newGroup, error: newGroupError } = await supabase
        .from("groups")
        .insert({
          name: "RoyalHouse Root",
          created_by: existingAdmin.id,
          is_active: true,
          is_bootstrap: true,
        })
        .select("id")
        .single()

      if (newGroupError) {
        console.info("[bootstrap-root-admin] Bootstrap group creation failed:", newGroupError.message)
        return new Response(
          JSON.stringify({ success: false, error: newGroupError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        )
      }

      // Assign root admin to the new bootstrap group
      await supabase
        .from("profiles")
        .update({ group_id: newGroup.id })
        .eq("id", existingAdmin.id)

      // Sync JWT metadata
      await supabase.auth.admin.updateUserById(existingAdmin.id, {
        user_metadata: { group_id: newGroup.id },
      })

      console.info("[bootstrap-root-admin] Bootstrap group created and assigned:", newGroup.id)
      return new Response(
        JSON.stringify({ created: false, bootstrapGroupCreated: true, message: "Bootstrap group created and assigned to existing root admin" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    // Create the bootstrap group first
    console.info("[bootstrap-root-admin] Creating bootstrap group")
    const { data: groupData, error: groupError } = await supabase
      .from("groups")
      .insert({
        name: "RoyalHouse Root",
        is_active: true,
        is_bootstrap: true,
      })
      .select("id")
      .single()

    if (groupError) {
      console.info("[bootstrap-root-admin] Bootstrap group creation failed:", groupError.message)
      return new Response(
        JSON.stringify({ success: false, error: groupError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const bootstrapGroupId = groupData.id
    console.info("[bootstrap-root-admin] Bootstrap group created:", bootstrapGroupId)

    // Create the auth user
    console.info("[bootstrap-root-admin] Creating auth user")
    const { data: authData, error: createError } = await supabase.auth.admin.createUser({
      email: rootAdminEmail,
      password: rootAdminPassword,
      email_confirm: true,
      user_metadata: {
        full_name: "Root Admin",
        role: "root_admin",
        group_id: bootstrapGroupId,
        is_active: true,
      },
    })

    if (createError) {
      console.info("[bootstrap-root-admin] Auth user creation failed:", createError.message)
      // Clean up the bootstrap group since we failed
      await supabase.from("groups").delete().eq("id", bootstrapGroupId)
      return new Response(
        JSON.stringify({ success: false, error: createError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    console.info("[bootstrap-root-admin] Auth user created:", authData.user.id)

    // Insert the profiles row (assigned to bootstrap group)
    console.info("[bootstrap-root-admin] Inserting profiles row")
    const { error: insertError } = await supabase.from("profiles").insert({
      id: authData.user.id,
      email: rootAdminEmail,
      full_name: "Root Admin",
      role: "root_admin",
      group_id: bootstrapGroupId,
      is_active: true,
    })

    if (insertError) {
      console.info("[bootstrap-root-admin] Profile insert failed:", insertError.message)
      return new Response(
        JSON.stringify({ success: false, error: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    // Backfill created_by on the bootstrap group
    await supabase
      .from("groups")
      .update({ created_by: authData.user.id })
      .eq("id", bootstrapGroupId)

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
