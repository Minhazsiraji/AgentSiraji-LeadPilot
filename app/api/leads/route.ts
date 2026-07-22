import { apiError, requireOwner } from "../../../lib/api-auth";
import { createLead } from "../../../lib/data";

export async function POST(request: Request) {
  try {
    const auth = await requireOwner(request);
    if ("response" in auth) return auth.response;
    const payload = (await request.json()) as Record<string, unknown>;
    const customerName = typeof payload.customerName === "string" ? payload.customerName.trim().slice(0, 120) : "";
    const email = typeof payload.email === "string" ? payload.email.trim().slice(0, 180) : "";
    const phone = typeof payload.phone === "string" ? payload.phone.trim().slice(0, 60) : "";
    const message = typeof payload.message === "string" ? payload.message.trim().slice(0, 5000) : "";
    const expectedValue = Number(payload.expectedValue ?? 0);
    if (!customerName || !message) return Response.json({ error: "Customer name and enquiry message are required." }, { status: 400 });
    const result = await createLead({ customerName, email, phone, message, expectedValue: Number.isFinite(expectedValue) ? expectedValue : 0, source: typeof payload.source === "string" ? payload.source : "Manual" }, auth.user.email);
    return Response.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return apiError(error);
  }
}
