import { apiError, requireOwner } from "../../../../../lib/api-auth";
import { recordCustomerReply } from "../../../../../lib/data";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const auth = await requireOwner(request);
    if ("response" in auth) return auth.response;
    const { id } = await context.params;
    const payload = (await request.json()) as { message?: unknown };
    const message = typeof payload.message === "string" ? payload.message.slice(0, 5000) : "";
    const recorded = await recordCustomerReply(id, message, auth.user.email);
    return recorded ? Response.json({ ok: true }) : Response.json({ error: "Enter a customer reply." }, { status: 400 });
  } catch (error) {
    return apiError(error);
  }
}
