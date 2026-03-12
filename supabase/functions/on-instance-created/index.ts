import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import type { ShlinkApiClient as ShlinkApiClientType } from "@shlinkio/shlink-js-sdk";
import { ShlinkApiClient } from "@shlinkio/shlink-js-sdk";
import { FetchHttpClient } from "@shlinkio/shlink-js-sdk/fetch";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create or update a Shlink short URL, handling duplicate-slug gracefully. */
async function createOrUpdateShortUrl(
  client: ShlinkApiClientType,
  longUrl: string,
  customSlug: string,
): Promise<string> {
  try {
    const result = await client.createShortUrl({ longUrl, customSlug });
    return result.shortUrl;
  } catch (err: unknown) {
    const isNonUniqueSlug =
      err !== null &&
      typeof err === "object" &&
      "type" in err &&
      (err as { type: string }).type ===
        "https://shlink.io/api/error/non-unique-slug";

    if (isNonUniqueSlug) {
      console.info(
        `[on-instance-created] Slug "${customSlug}" already exists, updating long URL`,
      );
      const updated = await client.updateShortUrl(
        { shortCode: customSlug },
        { longUrl },
      );
      return updated.shortUrl;
    }
    throw err;
  }
}

/** Stringify any thrown value for logging. */
function errorToString(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return JSON.stringify(err, null, 2);
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

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
    // The trigger sends a flat object: { id, readable_id }
    // Accept both flat and nested { record: { id, readable_id } } for robustness
    const body = await req.json();
    const record = body.record ?? body;
    if (!record?.id || !record?.readable_id) {
      console.error(
        "[on-instance-created] Missing id or readable_id in payload:",
        JSON.stringify(body),
      );
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing id or readable_id in payload",
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

    // Create two short URLs with i/ prefix and -view/-edit suffixes
    // Short URL: short.domain/i/abc1234567-view -> app.domain/instances/abc1234567?mode=view
    // Short URL: short.domain/i/abc1234567-edit -> app.domain/instances/abc1234567?mode=edit
    const viewLongUrl = `${appBaseUrl}/instances/${readable_id}?mode=view`;
    const editLongUrl = `${appBaseUrl}/instances/${readable_id}?mode=edit`;

    console.info(
      "[on-instance-created] Creating view short URL for:",
      viewLongUrl,
    );
    const viewShortUrl = await createOrUpdateShortUrl(
      shlinkClient,
      viewLongUrl,
      `i/${readable_id}-view`,
    );
    console.info(
      "[on-instance-created] View short URL resolved:",
      viewShortUrl,
    );

    console.info(
      "[on-instance-created] Creating edit short URL for:",
      editLongUrl,
    );
    const editShortUrl = await createOrUpdateShortUrl(
      shlinkClient,
      editLongUrl,
      `i/${readable_id}-edit`,
    );
    console.info(
      "[on-instance-created] Edit short URL resolved:",
      editShortUrl,
    );

    // Update the form_instances row with the short URLs
    const supabaseAdmin = createClient(supabaseUrl, sbSecretKey);
    const { error: updateError } = await supabaseAdmin
      .from("form_instances")
      .update({
        short_url_view: viewShortUrl,
        short_url_edit: editShortUrl,
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
        short_url_view: viewShortUrl,
        short_url_edit: editShortUrl,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const message = errorToString(err);
    console.error("[on-instance-created] Unhandled error:", message);
    if (err instanceof Error && err.stack) {
      console.error("[on-instance-created] Stack:", err.stack);
    }
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
});
