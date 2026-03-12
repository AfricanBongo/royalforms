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

/** Field types that support numeric aggregates (SUM, AVERAGE, MIN, MAX, MEDIAN) */
const NUMERIC_FIELD_TYPES = new Set(["number", "rating", "range"]);

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

/**
 * Resolve aggregate expressions like SUM(field-id) using field values.
 * Optionally validates that the referenced field types are compatible with
 * the aggregate function (e.g. SUM requires numeric field types).
 */
function resolveAggregates(
  expression: string,
  fieldValues: Map<string, number[]>,
  fieldTypeMap?: Map<string, string>,
): string {
  return expression.replace(
    /\b(SUM|AVERAGE|MIN|MAX|COUNT|MEDIAN)\(\s*([a-f0-9-]+)\s*\)/gi,
    (_match, funcName: string, fieldId: string) => {
      const upperFunc = funcName.toUpperCase() as AggregateFunction;
      const func = AGGREGATE_FUNCTIONS[upperFunc];
      if (!func) return "0";

      // Validate field type compatibility (skip COUNT which works on all types)
      if (fieldTypeMap && upperFunc !== "COUNT") {
        const fieldType = fieldTypeMap.get(fieldId);
        if (fieldType && !NUMERIC_FIELD_TYPES.has(fieldType)) {
          throw new Error(
            `${upperFunc} requires a numeric field type (number, rating, range) but got '${fieldType}'`,
          );
        }
      }

      const values = fieldValues.get(fieldId) ?? [];
      return String(func(values));
    },
  );
}

/**
 * Resolve aggregates scoped to a single group's values (for per-group formula columns).
 */
function resolveAggregatesForGroup(
  expression: string,
  groupNumericValues: Map<string, number[]>,
  fieldTypeMap?: Map<string, string>,
): string {
  return resolveAggregates(expression, groupNumericValues, fieldTypeMap);
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

/**
 * Build a human-readable label for a formula expression by replacing
 * field UUIDs with their labels. E.g. "SUM(uuid)" → "SUM(Revenue)".
 */
function humanizeFormulaLabel(
  expression: string,
  fieldLabelMap: Map<string, string>,
): string {
  if (!expression) return "Formula";
  const readable = expression.replace(
    /\b(SUM|AVERAGE|MIN|MAX|COUNT|MEDIAN)\(\s*([a-f0-9-]+)\s*\)/gi,
    (_match, funcName: string, fieldId: string) => {
      const label = fieldLabelMap.get(fieldId) ?? fieldId;
      return `${funcName.toUpperCase()}(${label})`;
    },
  );
  return readable || "Formula";
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let fields: Record<string, any>[] = [];
    if (sectionIds.length > 0) {
      const { data: fieldData, error: fErr } = await supabaseAdmin
        .from("report_template_fields")
        .select(
          "id, report_template_section_id, label, field_type, sort_order, config",
        )
        .in("report_template_section_id", sectionIds)
        .order("sort_order");
      if (fErr) throw fErr;
      fields = fieldData ?? [];
    }

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

    // Fetch instance-to-group mapping + metadata for snapshot
    const { data: instanceGroups, error: igErr } = await supabaseAdmin
      .from("form_instances")
      .select(
        "id, readable_id, created_at, group_id, groups!inner(id, name), template_versions!inner(template_id, form_templates!inner(name))",
      )
      .in("id", form_instance_ids);
    if (igErr) throw igErr;

    // Build instance → group lookup + metadata for snapshot
    const instanceGroupMap = new Map<
      string,
      { group_id: string; group_name: string }
    >();
    // Ordered list of unique groups (preserves insertion order)
    const groupOrder: Array<{ group_id: string; group_name: string }> = [];
    const seenGroups = new Set<string>();
    // Metadata for each form instance (stored in data_snapshot)
    const formInstancesMetadata: Array<{
      id: string;
      readable_id: string;
      form_template_name: string;
      created_at: string;
    }> = [];

    for (const ig of instanceGroups ?? []) {
      const groupData = ig.groups as unknown as {
        id: string;
        name: string;
      };
      const versionData = ig.template_versions as unknown as {
        template_id: string;
        form_templates: { name: string };
      };
      instanceGroupMap.set(ig.id, {
        group_id: groupData.id,
        group_name: groupData.name,
      });
      formInstancesMetadata.push({
        id: ig.id,
        readable_id: ig.readable_id,
        form_template_name: versionData.form_templates.name,
        created_at: ig.created_at,
      });
      if (!seenGroups.has(groupData.id)) {
        seenGroups.add(groupData.id);
        groupOrder.push({
          group_id: groupData.id,
          group_name: groupData.name,
        });
      }
    }

    // Fetch field values from form instances
    const { data: fieldValuesRaw, error: fvErr } = await supabaseAdmin
      .from("field_values")
      .select("template_field_id, value, form_instance_id")
      .in("form_instance_id", form_instance_ids);
    if (fvErr) throw fvErr;

    // Fetch template field types for aggregate validation
    // Collect all referenced template_field_ids from report fields
    const referencedFieldIds = new Set<string>();
    for (const field of fields ?? []) {
      const config = field.config as Record<string, unknown>;
      if (config.template_field_id) {
        referencedFieldIds.add(config.template_field_id as string);
      }
      if (config.expression) {
        const expr = config.expression as string;
        const matches = expr.matchAll(/[a-f0-9-]{36}/gi);
        for (const m of matches) referencedFieldIds.add(m[0]);
      }
      if (config.columns) {
        for (const col of config.columns as Array<Record<string, unknown>>) {
          if (col.template_field_id) {
            referencedFieldIds.add(col.template_field_id as string);
          }
          if (col.formula) {
            const fExpr = col.formula as string;
            const fMatches = fExpr.matchAll(/[a-f0-9-]{36}/gi);
            for (const m of fMatches) referencedFieldIds.add(m[0]);
          }
        }
      }
    }

    // Fetch field types and labels from template_fields
    const fieldTypeMap = new Map<string, string>();
    const fieldLabelMap = new Map<string, string>();
    if (referencedFieldIds.size > 0) {
      const { data: templateFields, error: tfErr } = await supabaseAdmin
        .from("template_fields")
        .select("id, field_type, label")
        .in("id", [...referencedFieldIds]);
      if (tfErr) throw tfErr;
      for (const tf of templateFields ?? []) {
        fieldTypeMap.set(tf.id, tf.field_type);
        fieldLabelMap.set(tf.id, tf.label);
      }
    }

    // Build value maps — global (all instances) and per-group
    const numericFieldValues = new Map<string, number[]>();
    const rawFieldValues = new Map<
      string,
      Array<{ value: string | null; form_instance_id: string }>
    >();
    // Per-group maps: group_id → (template_field_id → values)
    const groupNumericValues = new Map<string, Map<string, number[]>>();
    const groupRawValues = new Map<
      string,
      Map<string, Array<{ value: string | null; form_instance_id: string }>>
    >();

    for (const fv of fieldValuesRaw ?? []) {
      const groupInfo = instanceGroupMap.get(fv.form_instance_id);
      const groupId = groupInfo?.group_id ?? "unknown";

      const num = parseFloat(fv.value ?? "");
      if (!isNaN(num)) {
        // Global numeric
        const existing = numericFieldValues.get(fv.template_field_id) ?? [];
        existing.push(num);
        numericFieldValues.set(fv.template_field_id, existing);

        // Per-group numeric
        if (!groupNumericValues.has(groupId)) {
          groupNumericValues.set(groupId, new Map());
        }
        const gMap = groupNumericValues.get(groupId)!;
        const gExisting = gMap.get(fv.template_field_id) ?? [];
        gExisting.push(num);
        gMap.set(fv.template_field_id, gExisting);
      }

      // Global raw
      const existingRaw =
        rawFieldValues.get(fv.template_field_id) ?? [];
      existingRaw.push({
        value: fv.value,
        form_instance_id: fv.form_instance_id,
      });
      rawFieldValues.set(fv.template_field_id, existingRaw);

      // Per-group raw
      if (!groupRawValues.has(groupId)) {
        groupRawValues.set(groupId, new Map());
      }
      const gRawMap = groupRawValues.get(groupId)!;
      const gExistingRaw = gRawMap.get(fv.template_field_id) ?? [];
      gExistingRaw.push({
        value: fv.value,
        form_instance_id: fv.form_instance_id,
      });
      gRawMap.set(fv.template_field_id, gExistingRaw);
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
            console.info(
              "[generate-report] Formula field:",
              field.id,
              "expression:",
              expression,
              "numericFieldValues keys:",
              [...numericFieldValues.keys()],
            );
            try {
              const resolved = resolveAggregates(
                expression,
                numericFieldValues,
                fieldTypeMap,
              );
              console.info(
                "[generate-report] After resolveAggregates:",
                resolved,
              );
              resolvedValue = evaluateArithmetic(resolved);
            } catch (e) {
              console.error(
                "[generate-report] Formula error for field:",
                field.id,
                e instanceof Error ? e.message : e,
              );
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
            // Column config supports two modes:
            // 1. Direct field reference: { template_field_id, label }
            // 2. Formula column: { formula, label } (expression evaluated per-group)
            const columns =
              (config.columns as Array<{
                template_field_id?: string;
                formula?: string;
                label: string;
              }>) ?? [];

            // One row per group (not per instance)
            const rows: Record<string, unknown>[] = [];
            const columnLabels = columns.map((c) => c.label);

            for (const group of groupOrder) {
              const row: Record<string, unknown> = {
                group_name: group.group_name,
                group_id: group.group_id,
              };

              for (const col of columns) {
                if (col.formula) {
                  // Formula column — evaluate per-group
                  const gNumVals =
                    groupNumericValues.get(group.group_id) ??
                    new Map();
                  try {
                    const resolved = resolveAggregatesForGroup(
                      col.formula,
                      gNumVals,
                      fieldTypeMap,
                    );
                    row[col.label] = evaluateArithmetic(resolved);
                  } catch (e) {
                    row[col.label] = {
                      error:
                        e instanceof Error
                          ? e.message
                          : "Formula error",
                    };
                  }
                } else if (col.template_field_id) {
                  // Direct field reference — find value for this group's instance(s)
                  const gRawMap = groupRawValues.get(
                    group.group_id,
                  );
                  const gFieldVals = gRawMap?.get(
                    col.template_field_id,
                  );
                  // If multiple instances per group, take first non-null
                  row[col.label] =
                    gFieldVals?.find((v) => v.value !== null)
                      ?.value ?? null;
                } else {
                  row[col.label] = null;
                }
              }

              rows.push(row);
            }

            resolvedValue = {
              columns: columnLabels,
              rows,
            };
            break;
          }
          case "static_text": {
            if (
              config.format === "richtext" &&
              Array.isArray(config.inlineContent)
            ) {
              // Resolve inline formulas and variables, then concatenate
              const parts: string[] = [];
              for (const item of config.inlineContent as Array<
                Record<string, unknown>
              >) {
                if (item.type === "text") {
                  parts.push(String(item.text ?? ""));
                } else if (item.type === "link") {
                  const linkContent = (item.content as Array<
                    Record<string, unknown>
                  >) ?? [];
                  parts.push(
                    linkContent.map((c) => String(c.text ?? "")).join(""),
                  );
                } else if (item.type === "inlineFormula") {
                  const p = item.props as Record<string, string>;
                  const fn = p?.fn ?? "SUM";
                  const fId = p?.fieldId ?? "";
                  if (fId) {
                    try {
                      const expr = `${fn}(${fId})`;
                      const resolved = resolveAggregates(
                        expr,
                        numericFieldValues,
                        fieldTypeMap,
                      );
                      const val = evaluateArithmetic(resolved);
                      parts.push(
                        Number.isInteger(val)
                          ? String(val)
                          : val.toFixed(2),
                      );
                    } catch {
                      parts.push(`[${fn} Error]`);
                    }
                  } else {
                    parts.push(`[${fn}(?)]`);
                  }
                } else if (item.type === "inlineVariable") {
                  const p = item.props as Record<string, string>;
                  const fId = p?.fieldId ?? "";
                  if (fId) {
                    const vals = rawFieldValues.get(fId);
                    parts.push(String(vals?.[0]?.value ?? "-"));
                  } else {
                    parts.push("[?]");
                  }
                }
              }
              resolvedValue = parts.join("");
            } else {
              resolvedValue = config.content ?? "";
            }
            break;
          }
        }

        // For formula fields, build a human-readable label from field names
        const snapshotLabel =
          field.field_type === "formula"
            ? humanizeFormulaLabel(
                (config.expression as string) ?? "",
                fieldLabelMap,
              )
            : field.label;

        resolvedFields.push({
          field_id: field.id,
          label: snapshotLabel,
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
      form_instances_metadata: formInstancesMetadata,
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
