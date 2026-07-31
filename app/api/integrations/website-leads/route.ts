import { apiError } from "../../../../lib/api-auth";
import { createLead, updateLead } from "../../../../lib/data";
import { getCloudflareEnv } from "../../../../lib/runtime-env";
import {
  allowedWebsiteOrigin,
  bearerToken,
  validateWebsiteLead,
  verifyWebsiteIngestKey,
  websiteLeadMessage,
  websiteLeadSource,
} from "../../../../lib/website-lead";
import { notifyWebsiteLead } from "../../../../lib/website-lead-notification";

export async function OPTIONS(request: Request) {
  const env = getCloudflareEnv();
  const origin = request.headers.get("origin");
  if (!allowedWebsiteOrigin(origin, env.WEBSITE_ALLOWED_ORIGINS)) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(request: Request) {
  const env = getCloudflareEnv();
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  try {
    if (!allowedWebsiteOrigin(origin, env.WEBSITE_ALLOWED_ORIGINS)) {
      return Response.json({ error: "This website origin is not allowed." }, { status: 403, headers });
    }
    if (!verifyWebsiteIngestKey(bearerToken(request), env.WEBSITE_INGEST_KEY)) {
      return Response.json({ error: "Invalid website integration key." }, { status: 401, headers });
    }

    const payload = await readPayload(request);
    const validation = validateWebsiteLead(payload);
    if (!validation.ok) return Response.json({ error: validation.error }, { status: 400, headers });
    if (validation.ignored) return Response.json({ ok: true }, { status: 202, headers });

    const input = validation.lead;
    const source = websiteLeadSource(input.sourceName);
    const result = await createLead({
      customerName: input.customerName,
      email: input.email,
      phone: input.phone,
      message: websiteLeadMessage(input),
      source,
      expectedValue: input.expectedValue,
    }, source);

    if (!result.duplicate) {
      if (input.location) await updateLead(result.lead.id, { location: input.location }, source);
      await notifyWebsiteLead({ ...result.lead, location: input.location || result.lead.location }, source, "website_lead");
    }

    return Response.json({
      ok: true,
      duplicate: result.duplicate,
      leadId: result.lead.id,
    }, { status: result.duplicate ? 200 : 201, headers });
  } catch (error) {
    const response = apiError(error);
    for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
    return response;
  }
}

function corsHeaders(origin: string | null) {
  return {
    "access-control-allow-origin": origin || "null",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type, x-leadpilot-key",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

async function readPayload(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/json")) {
    return await request.json() as Record<string, unknown>;
  }
  const form = await request.formData();
  return Object.fromEntries(form.entries()) as Record<string, unknown>;
}
