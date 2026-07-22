import { apiError, requireOwner } from "../../../../lib/api-auth";
import { updateFollowUp } from "../../../../lib/data";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const auth = await requireOwner(request);
    if ("response" in auth) return auth.response;
    const { id } = await context.params;
    const payload = (await request.json()) as { status?: unknown };
    if (payload.status !== "completed" && payload.status !== "cancelled") return Response.json({ error: "Status must be completed or cancelled." }, { status: 400 });
    const updated = await updateFollowUp(id, payload.status, auth.user.email);
    return updated ? Response.json({ ok: true }) : Response.json({ error: "Follow-up not found." }, { status: 404 });
  } catch (error) {
    return apiError(error);
  }
}
