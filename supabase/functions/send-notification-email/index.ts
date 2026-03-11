import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const VALID_TEMPLATES = [
  "member_request_pending",
  "member_request_approved",
  "member_request_rejected",
] as const;
type Template = (typeof VALID_TEMPLATES)[number];

interface TemplateData {
  requester_name?: string;
  group_name?: string;
  proposed_role?: string;
}

/**
 * Render email subject and HTML body for a given template.
 */
function renderEmail(
  template: Template,
  data: TemplateData,
): { subject: string; html: string } {
  const requesterName = data.requester_name ?? "Someone";
  const groupName = data.group_name ?? "the group";
  const proposedRole = data.proposed_role ?? "member";

  switch (template) {
    case "member_request_pending":
      return {
        subject: `New member request from ${requesterName}`,
        html: `<p><strong>${requesterName}</strong> has requested to join <strong>${groupName}</strong> as <strong>${proposedRole}</strong>. Please review this request in RoyalForms.</p>`,
      };

    case "member_request_approved":
      return {
        subject: `Your request to join ${groupName} was approved`,
        html: `<p>Your request to join <strong>${groupName}</strong> has been approved. You can now access the group's forms.</p>`,
      };

    case "member_request_rejected":
      return {
        subject: `Your request to join ${groupName} was not approved`,
        html: `<p>Your request to join <strong>${groupName}</strong> was not approved at this time.</p>`,
      };
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    console.info(
      "[send-notification-email] Rejected non-POST request:",
      req.method,
    );
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  console.info("[send-notification-email] Request received");

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const sbPublishableKey = Deno.env.get("SB_PUBLISHABLE_KEY") ?? "";
    const sbSecretKey = Deno.env.get("SB_SECRET_KEY") ?? "";
    const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";

    if (!resendApiKey) {
      console.error("[send-notification-email] RESEND_API_KEY is not set");
      return new Response(
        JSON.stringify({
          success: false,
          error: "Email service not configured",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // --- Authorization ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.info(
        "[send-notification-email] Missing Authorization header",
      );
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing Authorization header",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Service role client for verifying caller identity (bypasses RLS)
    const supabaseAdmin = createClient(supabaseUrl, sbSecretKey);

    // Verify the caller's identity via the auth server
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await supabaseAdmin
      .auth.getUser(token);
    if (authError || !caller) {
      console.info("[send-notification-email] Auth verification failed");
      return new Response(
        JSON.stringify({ success: false, error: "Invalid or expired token" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.info(
      "[send-notification-email] Caller authenticated:",
      caller.id,
    );

    // Client scoped to the caller's JWT -- RLS policies apply
    const supabaseClient = createClient(supabaseUrl, sbPublishableKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get the caller's profile (uses RLS -- caller can read their own profile)
    const { data: callerProfile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("id, role, is_active")
      .eq("id", caller.id)
      .single();

    if (profileError || !callerProfile) {
      console.info(
        "[send-notification-email] Caller profile not found for user:",
        caller.id,
      );
      return new Response(
        JSON.stringify({ success: false, error: "Caller profile not found" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!callerProfile.is_active) {
      console.info(
        "[send-notification-email] Caller account is disabled:",
        caller.id,
      );
      return new Response(
        JSON.stringify({ success: false, error: "Account is disabled" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (
      callerProfile.role !== "root_admin" && callerProfile.role !== "admin"
    ) {
      console.info(
        "[send-notification-email] Insufficient permissions, caller role:",
        callerProfile.role,
      );
      return new Response(
        JSON.stringify({ success: false, error: "Insufficient permissions" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // --- Parse and validate request body ---
    const body = await req.json();
    const { to, template, data } = body as {
      to: string;
      template: string;
      data: TemplateData;
    };

    if (!to || !template) {
      console.info(
        "[send-notification-email] Missing required fields: to, template",
      );
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required fields: to, template",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!VALID_TEMPLATES.includes(template as Template)) {
      console.info(
        "[send-notification-email] Invalid template:",
        template,
      );
      return new Response(
        JSON.stringify({
          success: false,
          error: `Invalid template. Must be one of: ${VALID_TEMPLATES.join(", ")}`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // --- Render email ---
    const { subject, html } = renderEmail(
      template as Template,
      data ?? {},
    );

    console.info(
      "[send-notification-email] Sending email to:",
      to,
      "template:",
      template,
      "subject:",
      subject,
    );

    // --- Send via Resend API ---
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "RoyalForms <noreply@royalforms.app>",
        to: [to],
        subject,
        html,
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error(
        "[send-notification-email] Resend API error:",
        JSON.stringify(resendData),
      );
      return new Response(
        JSON.stringify({
          success: false,
          error: resendData.message ?? "Failed to send email",
        }),
        {
          status: resendResponse.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.info(
      "[send-notification-email] Email sent successfully, message_id:",
      resendData.id,
    );
    return new Response(
      JSON.stringify({ success: true, message_id: resendData.id }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[send-notification-email] Unhandled error:", message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
