import { apiError, requireOwner } from "../../../../../lib/api-auth";
import { prepareFollowUpDraft } from "../../../../../lib/data";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const auth = await requireOwner(request);
    if ("response" in auth) return auth.response;
    const { id } = await context.params;
    const prepared = await prepareFollowUpDraft(id, auth.user.email);
    return prepared ? Response.json({ ok: true }) : Response.json({ error: "This follow-up cannot be prepared because the lead is closed, restricted, replied, or the task is no longer pending." }, { status: 409 });
  } catch (error) {
    return apiError(error);
  }
}
