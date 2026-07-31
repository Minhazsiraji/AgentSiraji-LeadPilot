import { apiError } from "../../../../lib/api-auth";
import { createLead, updateLead } from "../../../../lib/data";
import { publicOrderMessage, validatePublicOrder } from "../../../../lib/public-order";
import { notifyWebsiteLead } from "../../../../lib/website-lead-notification";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    if (typeof payload.companyWebsite === "string" && payload.companyWebsite.trim()) {
      return Response.json({ ok: true }, { status: 202 });
    }
    const validation = validatePublicOrder(payload);
    if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 });
    const order = validation.order;
    const message = publicOrderMessage(order);
    const source = "StepFresh landing page";
    const location = `${order.thana}, ${order.district}`;
    const result = await createLead({
      customerName: order.customerName,
      email: "",
      phone: order.phone,
      message,
      source,
    }, source);
    if (!result.duplicate) {
      await updateLead(result.lead.id, { location: `${order.thana}, ${order.district}` }, source);
      await notifyWebsiteLead({ ...result.lead, location }, source, "landing_order");
    }
    return Response.json({
      ok: true,
      duplicate: result.duplicate,
      message: result.duplicate
        ? "We already received this order request and will follow it up."
        : "Your order request has been received. StepFresh will confirm it before dispatch.",
    }, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return apiError(error);
  }
}
