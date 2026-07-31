import { apiError } from "../../../../../lib/api-auth";
import { createLead, updateLead } from "../../../../../lib/data";
import { validateWebsiteLead, websiteLeadMessage, websiteLeadSource } from "../../../../../lib/website-lead";

export async function POST(request: Request) {
  try {
    const payload = await readPayload(request);
    const validation = validateWebsiteLead(payload);
    if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 });
    if (validation.ignored) return Response.json({ ok: true }, { status: 202 });

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

    if (!result.duplicate && input.location) {
      await updateLead(result.lead.id, { location: input.location }, source);
    }

    return Response.json({
      ok: true,
      duplicate: result.duplicate,
      message: result.duplicate
        ? "We already received this enquiry and will follow it up."
        : "Your enquiry has been received. A person will review it before replying.",
    }, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return apiError(error);
  }
}

async function readPayload(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/json")) {
    return await request.json() as Record<string, unknown>;
  }
  const form = await request.formData();
  return Object.fromEntries(form.entries()) as Record<string, unknown>;
}
