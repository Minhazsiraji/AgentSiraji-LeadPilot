import { apiError, requireOwner } from "../../../../lib/api-auth";
import { deleteLead, updateLead } from "../../../../lib/data";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const auth = await requireOwner(request);
    if ("response" in auth) return auth.response;
    const { id } = await context.params;
    const updated = await updateLead(id, await request.json() as Record<string, unknown>, auth.user.email);
    return updated ? Response.json({ lead: updated }) : Response.json({ error: "Lead not found." }, { status: 404 });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const auth = await requireOwner(request);
    if ("response" in auth) return auth.response;
    const { id } = await context.params;
    const deleted = await deleteLead(id, auth.user.email);
    return deleted ? Response.json({ ok: true }) : Response.json({ error: "Lead not found." }, { status: 404 });
  } catch (error) {
    return apiError(error);
  }
}
