import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import { ShlinkApiClient } from "@shlinkio/shlink-js-sdk";
import { FetchHttpClient } from "@shlinkio/shlink-js-sdk/fetch";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** Stringify any thrown value for logging. */
function errorToString(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return JSON.stringify(err, null, 2);
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  console.info("[delete-report-instance] Request received");

  try {
    // --- Auth: verify caller is root_admin or admin ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const sbSecretKey = Deno.env.get("SB_SECRET_KEY") ?? "";
    const supabaseAdmin = createClient(supabaseUrl, sbSecretKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Check role
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role, is_active")
      .eq("id", user.id)
      .single();

    if (!profile?.is_active) {
      return new Response(
        JSON.stringify({ success: false, error: "Account is disabled" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!["root_admin", "admin"].includes(profile.role)) {
      return new Response(
        JSON.stringify({ success: false, error: "Insufficient permissions" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // --- Parse body ---
    const { report_instance_id } = await req.json();
    if (!report_instance_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing report_instance_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.info("[delete-report-instance] Deleting instance:", report_instance_id);

    // --- Fetch the instance to get short_url, export paths, and readable_id ---
    const { data: instance, error: fetchErr } = await supabaseAdmin
      .from("report_instances")
      .select("id, readable_id, short_url, export_pdf_path, export_docx_path")
      .eq("id", report_instance_id)
      .single();

    if (fetchErr || !instance) {
      return new Response(
        JSON.stringify({ success: false, error: "Report instance not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // --- 1. Delete Shlink short URL (best-effort) ---
    const shlinkBaseUrl = Deno.env.get("SHLINK_BASE_URL") ?? "";
    const shlinkApiKey = Deno.env.get("SHLINK_API_KEY") ?? "";

    if (shlinkBaseUrl && shlinkApiKey && instance.short_url) {
      try {
        const shlinkClient = new ShlinkApiClient(
          new FetchHttpClient(),
          { baseUrl: shlinkBaseUrl, apiKey: shlinkApiKey },
        );
        await shlinkClient.deleteShortUrl({
          shortCode: `r/${instance.readable_id}`,
        });
        console.info(
          "[delete-report-instance] Deleted Shlink short URL for:",
          instance.readable_id,
        );
      } catch (shlinkErr: unknown) {
        // Best-effort: log but don't fail the whole operation
        console.warn(
          "[delete-report-instance] Failed to delete Shlink short URL:",
          errorToString(shlinkErr),
        );
      }
    }

    // --- 2. Delete exported files from Storage (best-effort) ---
    const exportPaths: string[] = [];
    if (instance.export_pdf_path) exportPaths.push(instance.export_pdf_path);
    if (instance.export_docx_path) exportPaths.push(instance.export_docx_path);

    if (exportPaths.length > 0) {
      const { error: storageErr } = await supabaseAdmin.storage
        .from("report-exports")
        .remove(exportPaths);

      if (storageErr) {
        console.warn(
          "[delete-report-instance] Failed to delete storage files:",
          storageErr.message,
        );
      } else {
        console.info(
          "[delete-report-instance] Deleted storage files:",
          exportPaths,
        );
      }
    }

    // --- 3. Delete the DB row ---
    const { error: deleteErr } = await supabaseAdmin
      .from("report_instances")
      .delete()
      .eq("id", report_instance_id);

    if (deleteErr) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `DB delete failed: ${deleteErr.message}`,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.info(
      "[delete-report-instance] Successfully deleted report instance:",
      report_instance_id,
    );

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const message = errorToString(err);
    console.error("[delete-report-instance] Unhandled error:", message);
    if (err instanceof Error && err.stack) {
      console.error("[delete-report-instance] Stack:", err.stack);
    }
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
