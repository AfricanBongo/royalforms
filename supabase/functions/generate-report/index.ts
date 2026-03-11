import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// Formula resolution helpers
// ---------------------------------------------------------------------------

type AggregateFunction =
  | "SUM"
  | "AVERAGE"
  | "MIN"
  | "MAX"
  | "COUNT"
  | "MEDIAN";

const AGGREGATE_FUNCTIONS: Record<
  AggregateFunction,
  (values: number[]) => number
> = {
  SUM: (vals) => vals.reduce((a, b) => a + b, 0),
  AVERAGE: (vals) =>
    vals.length === 0
      ? 0
      : vals.reduce((a, b) => a + b, 0) / vals.length,
  MIN: (vals) => (vals.length === 0 ? 0 : Math.min(...vals)),
  MAX: (vals) => (vals.length === 0 ? 0 : Math.max(...vals)),
  COUNT: (vals) => vals.length,
  MEDIAN: (vals) => {
    if (vals.length === 0) return 0;
    const sorted = [...vals].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  },
};

function resolveAggregates(
  expression: string,
  fieldValues: Map<string, number[]>,
): string {
  return expression.replace(
    /\b(SUM|AVERAGE|MIN|MAX|COUNT|MEDIAN)\(\s*([a-f0-9-]+)\s*\)/gi,
    (_match, funcName: string, fieldId: string) => {
      const func =
        AGGREGATE_FUNCTIONS[funcName.toUpperCase() as AggregateFunction];
      if (!func) return "0";
      const values = fieldValues.get(fieldId) ?? [];
      return String(func(values));
    },
  );
}

function evaluateArithmetic(expr: string): number {
  const cleaned = expr.replace(/\s+/g, "");
  if (!/^[\d.+\-*/()]+$/.test(cleaned)) {
    throw new Error(`Invalid arithmetic expression: ${expr}`);
  }
  try {
    const result = new Function(`return (${cleaned})`)();
    if (typeof result !== "number" || !isFinite(result)) return 0;
    return result;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  console.info("[generate-report] Request received");

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const sbSecretKey = Deno.env.get("SB_SECRET_KEY") ?? "";
  const supabaseAdmin = createClient(supabaseUrl, sbSecretKey);

  const authHeader = req.headers.get("Authorization");
  const isDirectCall = !!authHeader;

  // Track instance ID for error handling — declared before try so catch can access it
  let newInstanceId: string | null = null;

  try {
    // Auth check for direct HTTP calls
    if (isDirectCall) {
      const token = authHeader!.replace("Bearer ", "");
      const {
        data: { user: caller },
        error: authError,
      } = await supabaseAdmin.auth.getUser(token);
      if (authError || !caller) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Invalid or expired token",
          }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("role")
        .eq("id", caller.id)
        .single();

      if (profile?.role !== "root_admin") {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Only Root Admin can generate reports",
          }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    // Parse input
    const body = await req.json();
    const {
      report_template_id,
      form_instance_ids,
      auto_generated = false,
    } = body;

    if (
      !report_template_id ||
      !Array.isArray(form_instance_ids) ||
      form_instance_ids.length === 0
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing report_template_id or form_instance_ids",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.info(
      "[generate-report] Template:",
      report_template_id,
      "Instances:",
      form_instance_ids.length,
      "Auto:",
      auto_generated,
    );

    // Fetch report template
    const { data: reportTemplate, error: rtErr } = await supabaseAdmin
      .from("report_templates")
      .select("id, name, abbreviation, instance_counter")
      .eq("id", report_template_id)
      .single();

    if (rtErr || !reportTemplate) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Report template not found",
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Get latest version
    const { data: latestVersion, error: lvErr } = await supabaseAdmin
      .from("report_template_versions")
      .select("id, version_number")
      .eq("report_template_id", report_template_id)
      .eq("is_latest", true)
      .single();

    if (lvErr || !latestVersion) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "No published version found",
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Fetch sections + fields
    const { data: sections, error: sErr } = await supabaseAdmin
      .from("report_template_sections")
      .select("id, title, description, sort_order")
      .eq("report_template_version_id", latestVersion.id)
      .order("sort_order");
    if (sErr) throw sErr;

    const sectionIds = (sections ?? []).map((s) => s.id);
    const { data: fields, error: fErr } = await supabaseAdmin
      .from("report_template_fields")
      .select(
        "id, report_template_section_id, label, field_type, sort_order, config",
      )
      .in(
        "report_template_section_id",
        sectionIds.length > 0 ? sectionIds : ["__none__"],
      )
      .order("sort_order");
    if (fErr) throw fErr;

    // Create report instance with 'generating' status
    const newCounter = reportTemplate.instance_counter + 1;
    const readableId = `${reportTemplate.abbreviation}-r-${String(newCounter).padStart(3, "0")}`;

    // Determine created_by
    let createdBy: string;
    if (auto_generated) {
      const { data: rootAdmin } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("role", "root_admin")
        .limit(1)
        .single();
      createdBy = rootAdmin?.id ?? "";
    } else {
      const token = authHeader!.replace("Bearer ", "");
      const {
        data: { user },
      } = await supabaseAdmin.auth.getUser(token);
      createdBy = user?.id ?? "";
    }

    const { data: newInstance, error: insertErr } = await supabaseAdmin
      .from("report_instances")
      .insert({
        readable_id: readableId,
        report_template_version_id: latestVersion.id,
        status: "generating",
        created_by: createdBy,
        form_instances_included: form_instance_ids,
        data_snapshot: null,
      })
      .select("id, readable_id")
      .single();

    if (insertErr) throw insertErr;
    newInstanceId = newInstance!.id;

    // Increment instance counter
    await supabaseAdmin
      .from("report_templates")
      .update({ instance_counter: newCounter })
      .eq("id", report_template_id);

    console.info(
      "[generate-report] Created instance:",
      newInstanceId,
      "readable_id:",
      readableId,
    );

    // Fetch field values from form instances
    const { data: fieldValuesRaw, error: fvErr } = await supabaseAdmin
      .from("field_values")
      .select("template_field_id, value, form_instance_id")
      .in("form_instance_id", form_instance_ids);
    if (fvErr) throw fvErr;

    // Build value maps
    const numericFieldValues = new Map<string, number[]>();
    const rawFieldValues = new Map<
      string,
      Array<{ value: string | null; form_instance_id: string }>
    >();

    for (const fv of fieldValuesRaw ?? []) {
      const num = parseFloat(fv.value ?? "");
      if (!isNaN(num)) {
        const existing = numericFieldValues.get(fv.template_field_id) ?? [];
        existing.push(num);
        numericFieldValues.set(fv.template_field_id, existing);
      }

      const existingRaw =
        rawFieldValues.get(fv.template_field_id) ?? [];
      existingRaw.push({
        value: fv.value,
        form_instance_id: fv.form_instance_id,
      });
      rawFieldValues.set(fv.template_field_id, existingRaw);
    }

    // Resolve each report field
    const snapshotSections: unknown[] = [];

    for (const section of sections ?? []) {
      const sectionFields = (fields ?? []).filter(
        (f) => f.report_template_section_id === section.id,
      );

      const resolvedFields: unknown[] = [];

      for (const field of sectionFields) {
        const config = field.config as Record<string, unknown>;
        let resolvedValue: unknown = null;

        switch (field.field_type) {
          case "formula": {
            const expression = (config.expression as string) ?? "";
            try {
              const resolved = resolveAggregates(
                expression,
                numericFieldValues,
              );
              resolvedValue = evaluateArithmetic(resolved);
            } catch (e) {
              resolvedValue = {
                error:
                  e instanceof Error ? e.message : "Formula error",
              };
            }
            break;
          }
          case "dynamic_variable": {
            const templateFieldId =
              config.template_field_id as string;
            const values = rawFieldValues.get(templateFieldId);
            resolvedValue = values?.[0]?.value ?? null;
            break;
          }
          case "table": {
            const columns =
              (config.columns as Array<{
                template_field_id: string;
                label: string;
              }>) ?? [];
            const rows: Record<string, unknown>[] = [];
            for (const instanceId of form_instance_ids) {
              const row: Record<string, unknown> = {
                form_instance_id: instanceId,
              };
              for (const col of columns) {
                const values = rawFieldValues.get(
                  col.template_field_id,
                );
                const match = values?.find(
                  (v) => v.form_instance_id === instanceId,
                );
                row[col.label] = match?.value ?? null;
              }
              rows.push(row);
            }
            resolvedValue = {
              columns: columns.map((c) => c.label),
              rows,
            };
            break;
          }
          case "static_text": {
            resolvedValue = config.content ?? "";
            break;
          }
        }

        resolvedFields.push({
          field_id: field.id,
          label: field.label,
          field_type: field.field_type,
          value: resolvedValue,
        });
      }

      snapshotSections.push({
        section_id: section.id,
        title: section.title,
        description: section.description,
        fields: resolvedFields,
      });
    }

    const dataSnapshot = {
      report_name: reportTemplate.name,
      version_number: latestVersion.version_number,
      generated_at: new Date().toISOString(),
      sections: snapshotSections,
    };

    // Update instance to 'ready'
    const { error: updateErr } = await supabaseAdmin
      .from("report_instances")
      .update({ status: "ready", data_snapshot: dataSnapshot })
      .eq("id", newInstanceId);

    if (updateErr) throw updateErr;

    console.info(
      "[generate-report] Report instance ready:",
      newInstanceId,
    );

    return new Response(
      JSON.stringify({
        success: true,
        report_instance_id: newInstanceId,
        readable_id: readableId,
      }),
      {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[generate-report] Error:", message);

    // Mark instance as failed if it was created
    if (newInstanceId) {
      try {
        await supabaseAdmin
          .from("report_instances")
          .update({ status: "failed", error_message: message })
          .eq("id", newInstanceId);
        console.info(
          "[generate-report] Marked instance",
          newInstanceId,
          "as failed",
        );
      } catch (cleanupErr) {
        console.error(
          "[generate-report] Failed to mark instance as failed:",
          cleanupErr,
        );
      }
    }

    const status = isDirectCall ? 500 : 200;
    return new Response(
      JSON.stringify({ success: false, error: message }),
      {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
