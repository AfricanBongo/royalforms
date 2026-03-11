import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
} from "docx";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReportSection {
  title: string;
  description: string | null;
  fields: ReportField[];
}

interface ReportField {
  label: string;
  field_type: string;
  value: unknown;
}

// ---------------------------------------------------------------------------
// PDF generation
// ---------------------------------------------------------------------------

async function generatePdf(
  reportName: string,
  versionNumber: number,
  generatedAt: string,
  sections: ReportSection[],
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_WIDTH = 595;
  const PAGE_HEIGHT = 842;
  const MARGIN = 50;
  const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
  const LINE_HEIGHT = 16;
  const HEADING_SIZE = 18;
  const SUBHEADING_SIZE = 14;
  const BODY_SIZE = 10;
  const SMALL_SIZE = 8;

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  }

  // Title
  page.drawText(reportName, {
    x: MARGIN,
    y,
    size: HEADING_SIZE,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  y -= HEADING_SIZE + 8;

  // Metadata
  const metaText = `Version ${versionNumber} \u2022 Generated ${new Date(generatedAt).toLocaleDateString()}`;
  page.drawText(metaText, {
    x: MARGIN,
    y,
    size: SMALL_SIZE,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });
  y -= LINE_HEIGHT + 12;

  for (const section of sections) {
    ensureSpace(SUBHEADING_SIZE + LINE_HEIGHT * 2);
    page.drawText(section.title, {
      x: MARGIN,
      y,
      size: SUBHEADING_SIZE,
      font: boldFont,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= SUBHEADING_SIZE + 4;

    if (section.description) {
      ensureSpace(LINE_HEIGHT);
      page.drawText(section.description, {
        x: MARGIN,
        y,
        size: BODY_SIZE,
        font,
        color: rgb(0.3, 0.3, 0.3),
      });
      y -= LINE_HEIGHT + 4;
    }

    for (const field of section.fields) {
      ensureSpace(LINE_HEIGHT * 3);
      page.drawText(field.label, {
        x: MARGIN,
        y,
        size: BODY_SIZE,
        font: boldFont,
        color: rgb(0.2, 0.2, 0.2),
      });
      y -= LINE_HEIGHT;

      let displayValue = "";
      if (field.field_type === "static_text") {
        displayValue = String(field.value ?? "").replace(/<[^>]*>/g, "");
      } else if (field.field_type === "table") {
        const tableData = field.value as {
          columns: string[];
          rows: Record<string, unknown>[];
        } | null;
        if (tableData) {
          const header = tableData.columns.join("  |  ");
          page.drawText(header, {
            x: MARGIN + 10,
            y,
            size: SMALL_SIZE,
            font: boldFont,
            color: rgb(0.3, 0.3, 0.3),
          });
          y -= LINE_HEIGHT;
          for (const row of tableData.rows) {
            ensureSpace(LINE_HEIGHT);
            const rowText = tableData.columns
              .map((col) => String(row[col] ?? "-"))
              .join("  |  ");
            page.drawText(rowText, {
              x: MARGIN + 10,
              y,
              size: SMALL_SIZE,
              font,
              color: rgb(0.2, 0.2, 0.2),
            });
            y -= LINE_HEIGHT;
          }
        }
        displayValue = "";
      } else if (field.field_type === "formula") {
        const val = field.value;
        if (typeof val === "number") {
          displayValue = Number.isInteger(val) ? String(val) : val.toFixed(2);
        } else if (
          typeof val === "object" &&
          val !== null &&
          "error" in (val as Record<string, unknown>)
        ) {
          displayValue = `Error: ${(val as Record<string, unknown>).error}`;
        } else {
          displayValue = String(val ?? "-");
        }
      } else {
        displayValue = String(field.value ?? "-");
      }

      if (displayValue) {
        const words = displayValue.split(" ");
        let line = "";
        for (const word of words) {
          const testLine = line ? `${line} ${word}` : word;
          const width = font.widthOfTextAtSize(testLine, BODY_SIZE);
          if (width > CONTENT_WIDTH - 10) {
            ensureSpace(LINE_HEIGHT);
            page.drawText(line, {
              x: MARGIN + 10,
              y,
              size: BODY_SIZE,
              font,
              color: rgb(0.1, 0.1, 0.1),
            });
            y -= LINE_HEIGHT;
            line = word;
          } else {
            line = testLine;
          }
        }
        if (line) {
          ensureSpace(LINE_HEIGHT);
          page.drawText(line, {
            x: MARGIN + 10,
            y,
            size: BODY_SIZE,
            font,
            color: rgb(0.1, 0.1, 0.1),
          });
          y -= LINE_HEIGHT;
        }
      }
      y -= 8;
    }
    y -= 12;
  }

  return pdfDoc.save();
}

// ---------------------------------------------------------------------------
// DOCX generation
// ---------------------------------------------------------------------------

async function generateDocx(
  reportName: string,
  versionNumber: number,
  generatedAt: string,
  sections: ReportSection[],
): Promise<Uint8Array> {
  const children: (Paragraph | Table)[] = [];

  children.push(
    new Paragraph({ text: reportName, heading: HeadingLevel.HEADING_1 }),
  );
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Version ${versionNumber} \u2022 Generated ${new Date(generatedAt).toLocaleDateString()}`,
          size: 18,
          color: "888888",
        }),
      ],
    }),
  );
  children.push(new Paragraph({ text: "" }));

  for (const section of sections) {
    children.push(
      new Paragraph({
        text: section.title,
        heading: HeadingLevel.HEADING_2,
      }),
    );
    if (section.description) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: section.description,
              color: "666666",
              size: 20,
            }),
          ],
        }),
      );
    }

    for (const field of section.fields) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: field.label, bold: true, size: 22 }),
          ],
        }),
      );

      if (field.field_type === "table") {
        const tableData = field.value as {
          columns: string[];
          rows: Record<string, unknown>[];
        } | null;
        if (tableData && tableData.columns.length > 0) {
          const colWidth = Math.floor(9000 / tableData.columns.length);
          const headerRow = new TableRow({
            children: tableData.columns.map(
              (col) =>
                new TableCell({
                  width: { size: colWidth, type: WidthType.DXA },
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: col,
                          bold: true,
                          size: 20,
                        }),
                      ],
                    }),
                  ],
                }),
            ),
          });
          const dataRows = tableData.rows.map(
            (row) =>
              new TableRow({
                children: tableData.columns.map(
                  (col) =>
                    new TableCell({
                      width: { size: colWidth, type: WidthType.DXA },
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: String(row[col] ?? "-"),
                              size: 20,
                            }),
                          ],
                        }),
                      ],
                    }),
                ),
              }),
          );
          children.push(new Table({ rows: [headerRow, ...dataRows] }));
        }
      } else if (field.field_type === "static_text") {
        const text = String(field.value ?? "").replace(/<[^>]*>/g, "");
        children.push(
          new Paragraph({
            children: [new TextRun({ text, size: 20 })],
          }),
        );
      } else if (field.field_type === "formula") {
        const val = field.value;
        let displayValue: string;
        if (typeof val === "number") {
          displayValue = Number.isInteger(val) ? String(val) : val.toFixed(2);
        } else if (
          typeof val === "object" &&
          val !== null &&
          "error" in (val as Record<string, unknown>)
        ) {
          displayValue = `Error: ${(val as Record<string, unknown>).error}`;
        } else {
          displayValue = String(val ?? "-");
        }
        children.push(
          new Paragraph({
            children: [new TextRun({ text: displayValue, size: 22 })],
          }),
        );
      } else {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: String(field.value ?? "-"),
                size: 22,
              }),
            ],
          }),
        );
      }
      children.push(new Paragraph({ text: "" }));
    }
  }

  const doc = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(doc);
  return new Uint8Array(buffer);
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

  console.info("[export-report] Request received");

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const sbSecretKey = Deno.env.get("SB_SECRET_KEY") ?? "";

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
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

    const supabaseAdmin = createClient(supabaseUrl, sbSecretKey);
    const token = authHeader.replace("Bearer ", "");
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
      .select("is_active")
      .eq("id", caller.id)
      .single();

    if (!profile?.is_active) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "User account is not active",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { report_instance_id, format } = await req.json();

    if (!report_instance_id || !["pdf", "docx"].includes(format)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing report_instance_id or invalid format",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.info(
      "[export-report] Instance:",
      report_instance_id,
      "Format:",
      format,
    );

    const { data: instance, error: iErr } = await supabaseAdmin
      .from("report_instances")
      .select(
        "id, readable_id, status, data_snapshot, export_pdf_path, export_docx_path",
      )
      .eq("id", report_instance_id)
      .single();

    if (iErr || !instance) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Report instance not found",
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (instance.status !== "ready") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Report is not ready for export",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Check cache
    const cachedPath =
      format === "pdf" ? instance.export_pdf_path : instance.export_docx_path;
    if (cachedPath) {
      console.info("[export-report] Export already cached at:", cachedPath);
      const { data: signedUrl } = await supabaseAdmin.storage
        .from("report-exports")
        .createSignedUrl(cachedPath, 3600);
      return new Response(
        JSON.stringify({
          success: true,
          download_url: signedUrl?.signedUrl,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Generate export
    const snapshot = instance.data_snapshot as {
      report_name: string;
      version_number: number;
      generated_at: string;
      sections: ReportSection[];
    };

    let fileBytes: Uint8Array;
    const storagePath = `${instance.id}/report.${format}`;
    const contentType =
      format === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    if (format === "pdf") {
      fileBytes = await generatePdf(
        snapshot.report_name,
        snapshot.version_number,
        snapshot.generated_at,
        snapshot.sections,
      );
    } else {
      fileBytes = await generateDocx(
        snapshot.report_name,
        snapshot.version_number,
        snapshot.generated_at,
        snapshot.sections,
      );
    }

    console.info(
      "[export-report] Generated",
      format,
      "size:",
      fileBytes.length,
      "bytes",
    );

    const { error: uploadErr } = await supabaseAdmin.storage
      .from("report-exports")
      .upload(storagePath, fileBytes, { contentType, upsert: true });

    if (uploadErr) {
      console.error("[export-report] Upload failed:", uploadErr.message);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Upload failed: ${uploadErr.message}`,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const updateField =
      format === "pdf"
        ? { export_pdf_path: storagePath }
        : { export_docx_path: storagePath };

    await supabaseAdmin
      .from("report_instances")
      .update(updateField)
      .eq("id", instance.id);

    const { data: signedUrl } = await supabaseAdmin.storage
      .from("report-exports")
      .createSignedUrl(storagePath, 3600);

    console.info(
      "[export-report] Export complete for instance:",
      instance.id,
    );

    return new Response(
      JSON.stringify({
        success: true,
        download_url: signedUrl?.signedUrl,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[export-report] Error:", message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
