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

    if (!supabaseUrl || !sbSecretKey) {
      console.info("[bootstrap-root-admin] Missing SUPABASE_URL or SB_SECRET_KEY env vars")
      return new Response(
        JSON.stringify({ success: false, error: "Missing SUPABASE_URL or SB_SECRET_KEY" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    // Read email, password, orgName from request body, fall back to env vars
    let bodyEmail: string | undefined
    let bodyPassword: string | undefined
    let bodyOrgName: string | undefined

    try {
      const body = await req.json()
      bodyEmail = body.email
      bodyPassword = body.password
      bodyOrgName = body.orgName
    } catch {
      // Body is empty or not valid JSON — fall back to env vars
      console.info("[bootstrap-root-admin] No JSON body, falling back to env vars")
    }

    const rootAdminEmail = bodyEmail || Deno.env.get("ROOT_ADMIN_EMAIL")
    const rootAdminPassword = bodyPassword || Deno.env.get("ROOT_ADMIN_PASSWORD")
    const orgName = bodyOrgName || "RoyalHouse Root"

    if (!rootAdminEmail || !rootAdminPassword) {
      console.info("[bootstrap-root-admin] Missing email or password (body + env vars)")
      return new Response(
        JSON.stringify({ success: false, error: "Missing email or password. Provide in request body or set ROOT_ADMIN_EMAIL / ROOT_ADMIN_PASSWORD env vars." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
          name: orgName,
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

    // -----------------------------------------------------------------------
    // Fresh setup — create bootstrap group, auth user, profile, sample form
    // -----------------------------------------------------------------------

    // Create the bootstrap group first
    console.info("[bootstrap-root-admin] Creating bootstrap group")
    const { data: groupData, error: groupError } = await supabase
      .from("groups")
      .insert({
        name: orgName,
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

    const rootAdminId = authData.user.id
    console.info("[bootstrap-root-admin] Auth user created:", rootAdminId)

    // Insert the profiles row (assigned to bootstrap group)
    console.info("[bootstrap-root-admin] Inserting profiles row")
    const { error: insertError } = await supabase.from("profiles").insert({
      id: rootAdminId,
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
      .update({ created_by: rootAdminId })
      .eq("id", bootstrapGroupId)

    // -----------------------------------------------------------------------
    // Create sample form template with all field types
    // -----------------------------------------------------------------------
    console.info("[bootstrap-root-admin] Creating sample form template")

    const sampleFormResult = await createSampleFormTemplate(supabase, rootAdminId)
    if (sampleFormResult.error) {
      // Non-fatal: root admin was created successfully, just log the error
      console.info("[bootstrap-root-admin] Sample form creation failed (non-fatal):", sampleFormResult.error)
    } else {
      console.info("[bootstrap-root-admin] Sample form template created:", sampleFormResult.templateId)
    }

    console.info("[bootstrap-root-admin] Completed successfully — root admin created:", rootAdminId)
    return new Response(
      JSON.stringify({
        created: true,
        message: "Root admin created",
        sampleFormCreated: !sampleFormResult.error,
      }),
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

// -----------------------------------------------------------------------
// Sample form template creation helper
// -----------------------------------------------------------------------

interface SampleFormResult {
  templateId?: string
  error?: string
}

// deno-lint-ignore no-explicit-any
async function createSampleFormTemplate(supabase: any, rootAdminId: string): Promise<SampleFormResult> {
  try {
    // 1. Create the form template
    const { data: template, error: templateError } = await supabase
      .from("form_templates")
      .insert({
        name: "Sample Form — All Field Types",
        description: "A demo form showcasing every field type available in the system. Use it to explore how each field works before creating your own forms.",
        created_by: rootAdminId,
        is_active: true,
        sharing_mode: "all",
        status: "published",
      })
      .select("id")
      .single()

    if (templateError) return { error: templateError.message }

    const templateId = template.id

    // 2. Create the template version
    const { data: version, error: versionError } = await supabase
      .from("template_versions")
      .insert({
        template_id: templateId,
        version_number: 1,
        is_latest: true,
        status: "published",
        created_by: rootAdminId,
      })
      .select("id")
      .single()

    if (versionError) return { error: versionError.message }

    const versionId = version.id

    // 3. Create sections
    const { data: sections, error: sectionsError } = await supabase
      .from("template_sections")
      .insert([
        {
          template_version_id: versionId,
          title: "Text & Numbers",
          sort_order: 1,
        },
        {
          template_version_id: versionId,
          title: "Choices & Ratings",
          sort_order: 2,
        },
        {
          template_version_id: versionId,
          title: "Date & Files",
          sort_order: 3,
        },
      ])
      .select("id, sort_order")
      .order("sort_order", { ascending: true })

    if (sectionsError) return { error: sectionsError.message }

    // Map sections by sort_order for clarity
    const section1Id = sections[0].id // Text & Numbers
    const section2Id = sections[1].id // Choices & Ratings
    const section3Id = sections[2].id // Date & Files

    // 4. Create all fields
    const { error: fieldsError } = await supabase
      .from("template_fields")
      .insert([
        // Section 1: Text & Numbers
        {
          template_section_id: section1Id,
          label: "Full Name",
          field_type: "text",
          is_required: true,
          sort_order: 1,
        },
        {
          template_section_id: section1Id,
          label: "Bio",
          field_type: "textarea",
          is_required: false,
          sort_order: 2,
          validation_rules: { min_length: 10, max_length: 500 },
        },
        {
          template_section_id: section1Id,
          label: "Age",
          field_type: "number",
          is_required: false,
          sort_order: 3,
          validation_rules: { min_value: 0, max_value: 150 },
        },
        // Section 2: Choices & Ratings
        {
          template_section_id: section2Id,
          label: "Department",
          field_type: "select",
          is_required: true,
          sort_order: 1,
          options: ["Engineering", "Marketing", "Sales", "HR", "Finance"],
        },
        {
          template_section_id: section2Id,
          label: "Skills",
          field_type: "multi_select",
          is_required: false,
          sort_order: 2,
          options: ["JavaScript", "Python", "Design", "Leadership", "Communication"],
        },
        {
          template_section_id: section2Id,
          label: "I agree to the terms and conditions",
          field_type: "checkbox",
          is_required: true,
          sort_order: 3,
        },
        {
          template_section_id: section2Id,
          label: "Overall Satisfaction",
          field_type: "rating",
          is_required: false,
          sort_order: 4,
        },
        {
          template_section_id: section2Id,
          label: "Confidence Level",
          field_type: "range",
          is_required: false,
          sort_order: 5,
          validation_rules: { min_value: 0, max_value: 100, step: 5 },
        },
        // Section 3: Date & Files
        {
          template_section_id: section3Id,
          label: "Start Date",
          field_type: "date",
          is_required: true,
          sort_order: 1,
        },
        {
          template_section_id: section3Id,
          label: "Upload Resume",
          field_type: "file",
          is_required: false,
          sort_order: 2,
          validation_rules: { accepted_types: ".pdf,.docx", max_size_mb: 5, allow_multiple: false },
        },
      ])

    if (fieldsError) return { error: fieldsError.message }

    return { templateId }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return { error: message }
  }
}
