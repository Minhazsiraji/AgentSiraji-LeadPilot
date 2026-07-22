import { apiError, requireOwner } from "../../../../../lib/api-auth";
import { approveDraft } from "../../../../../lib/data";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const auth = await requireOwner(request);
    if ("response" in auth) return auth.response;
    const { id } = await context.params;
    const payload = (await request.json()) as { message?: unknown };
    const message = typeof payload.message === "string" ? payload.message.slice(0, 5000) : "";
    const approved = await approveDraft(id, message, auth.user.email);
    return approved ? Response.json({ ok: true }) : Response.json({ error: "This draft cannot be approved." }, { status: 409 });
  } catch (error) {
    return apiError(error);
  }
}
