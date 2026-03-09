import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import { ShlinkApiClient } from "@shlinkio/shlink-js-sdk";
import { FetchHttpClient } from "@shlinkio/shlink-js-sdk/fetch";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    console.info(
      "[on-instance-created] Rejected non-POST request:",
      req.method,
    );
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  console.info("[on-instance-created] Request received");

  try {
    // Read environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const sbSecretKey = Deno.env.get("SB_SECRET_KEY") ?? "";
    const shlinkBaseUrl = Deno.env.get("SHLINK_BASE_URL") ?? "";
    const shlinkApiKey = Deno.env.get("SHLINK_API_KEY") ?? "";
    const appBaseUrl = Deno.env.get("APP_BASE_URL") ?? "";

    if (!shlinkBaseUrl || !shlinkApiKey) {
      console.error(
        "[on-instance-created] Missing Shlink env vars (SHLINK_BASE_URL, SHLINK_API_KEY)",
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
      console.error("[on-instance-created] Missing APP_BASE_URL env var");
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing APP_BASE_URL configuration",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // Parse the payload from pg_net (via database trigger)
    const body = await req.json();
    const record = body.record;
    if (!record?.id || !record?.readable_id) {
      console.error(
        "[on-instance-created] Missing record.id or record.readable_id in payload:",
        JSON.stringify(body),
      );
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing record.id or record.readable_id",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const { id, readable_id } = record;
    console.info(
      "[on-instance-created] Processing instance:",
      id,
      "readable_id:",
      readable_id,
    );

    // Initialize Shlink client
    const shlinkClient = new ShlinkApiClient(
      new FetchHttpClient(),
      { baseUrl: shlinkBaseUrl, apiKey: shlinkApiKey },
    );

    // Create two short URLs with f/ prefix and -view/-edit suffixes
    // Short URL: short.domain/f/epr-001-view -> app.domain/forms/epr-001?mode=view
    // Short URL: short.domain/f/epr-001-edit -> app.domain/forms/epr-001?mode=edit
    const viewLongUrl = `${appBaseUrl}/forms/${readable_id}?mode=view`;
    const editLongUrl = `${appBaseUrl}/forms/${readable_id}?mode=edit`;

    console.info(
      "[on-instance-created] Creating view short URL for:",
      viewLongUrl,
    );
    const viewShortUrl = await shlinkClient.createShortUrl({
      longUrl: viewLongUrl,
      customSlug: `f/${readable_id}-view`,
    });
    console.info(
      "[on-instance-created] View short URL created:",
      viewShortUrl.shortUrl,
    );

    console.info(
      "[on-instance-created] Creating edit short URL for:",
      editLongUrl,
    );
    const editShortUrl = await shlinkClient.createShortUrl({
      longUrl: editLongUrl,
      customSlug: `f/${readable_id}-edit`,
    });
    console.info(
      "[on-instance-created] Edit short URL created:",
      editShortUrl.shortUrl,
    );

    // Update the form_instances row with the short URLs
    const supabaseAdmin = createClient(supabaseUrl, sbSecretKey);
    const { error: updateError } = await supabaseAdmin
      .from("form_instances")
      .update({
        short_url_view: viewShortUrl.shortUrl,
        short_url_edit: editShortUrl.shortUrl,
      })
      .eq("id", id);

    if (updateError) {
      console.error(
        "[on-instance-created] Failed to update form_instances row:",
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
      "[on-instance-created] Successfully updated instance",
      id,
      "with short URLs",
    );
    return new Response(
      JSON.stringify({
        success: true,
        short_url_view: viewShortUrl.shortUrl,
        short_url_edit: editShortUrl.shortUrl,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[on-instance-created] Unhandled error:", message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
});
