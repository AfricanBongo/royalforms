import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import { ShlinkApiClient } from "@shlinkio/shlink-js-sdk";
import { FetchHttpClient } from "@shlinkio/shlink-js-sdk/fetch";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    console.info(
      "[on-report-instance-ready] Rejected non-POST request:",
      req.method,
    );
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  console.info("[on-report-instance-ready] Request received");

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const sbSecretKey = Deno.env.get("SB_SECRET_KEY") ?? "";
    const shlinkBaseUrl = Deno.env.get("SHLINK_BASE_URL") ?? "";
    const shlinkApiKey = Deno.env.get("SHLINK_API_KEY") ?? "";
    const appBaseUrl = Deno.env.get("APP_BASE_URL") ?? "";

    if (!shlinkBaseUrl || !shlinkApiKey) {
      console.error(
        "[on-report-instance-ready] Missing Shlink env vars",
      );
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing Shlink configuration",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!appBaseUrl) {
      console.error(
        "[on-report-instance-ready] Missing APP_BASE_URL env var",
      );
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing APP_BASE_URL configuration",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const body = await req.json();
    const record = body.record ?? body;
    if (!record?.id || !record?.readable_id) {
      console.error(
        "[on-report-instance-ready] Missing id or readable_id in payload:",
        JSON.stringify(body),
      );
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing id or readable_id",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const { id, readable_id, report_template_version_id } = record;
    console.info(
      "[on-report-instance-ready] Processing report instance:",
      id,
      "readable_id:",
      readable_id,
    );

    // Look up the template_id from the version row so we can build
    // the correct long URL: /reports/{templateId}/instances/{readableId}
    const supabaseAdmin = createClient(supabaseUrl, sbSecretKey);

    let templateId: string | null = null;
    if (report_template_version_id) {
      const { data: versionRow } = await supabaseAdmin
        .from("report_template_versions")
        .select("report_template_id")
        .eq("id", report_template_version_id)
        .single();
      templateId = versionRow?.report_template_id ?? null;
    }

    if (!templateId) {
      // Fallback: query the report_instances row directly
      const { data: instanceRow } = await supabaseAdmin
        .from("report_instances")
        .select("report_template_version_id, report_template_versions!inner(report_template_id)")
        .eq("id", id)
        .single();
      const ver = instanceRow?.report_template_versions as unknown as
        | { report_template_id: string }
        | undefined;
      templateId = ver?.report_template_id ?? null;
    }

    if (!templateId) {
      console.error(
        "[on-report-instance-ready] Could not resolve template_id for instance:",
        id,
      );
      return new Response(
        JSON.stringify({
          success: false,
          error: "Could not resolve template_id",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const shlinkClient = new ShlinkApiClient(
      new FetchHttpClient(),
      { baseUrl: shlinkBaseUrl, apiKey: shlinkApiKey },
    );

    const longUrl = `${appBaseUrl}/reports/${templateId}/instances/${readable_id}`;
    console.info(
      "[on-report-instance-ready] Creating short URL for:",
      longUrl,
    );

    const shortUrl = await shlinkClient.createShortUrl({
      longUrl,
      customSlug: `r/${readable_id}`,
    });
    console.info(
      "[on-report-instance-ready] Short URL created:",
      shortUrl.shortUrl,
    );

    const { error: updateError } = await supabaseAdmin
      .from("report_instances")
      .update({ short_url: shortUrl.shortUrl })
      .eq("id", id);

    if (updateError) {
      console.error(
        "[on-report-instance-ready] Failed to update report_instances row:",
        updateError.message,
      );
      return new Response(
        JSON.stringify({
          success: false,
          error: `DB update failed: ${updateError.message}`,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    console.info(
      "[on-report-instance-ready] Successfully updated report instance",
      id,
      "with short URL",
    );
    return new Response(
      JSON.stringify({ success: true, short_url: shortUrl.shortUrl }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[on-report-instance-ready] Unhandled error:", message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
});
