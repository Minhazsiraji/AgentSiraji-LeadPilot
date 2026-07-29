import { apiError, requireOwner } from "../../../../lib/api-auth";
import { markOwnerNotificationsRead } from "../../../../lib/data";

export async function POST(request: Request) {
  try {
    const auth = await requireOwner(request);
    if ("response" in auth) return auth.response;
    const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
    const notificationId = typeof payload.notificationId === "string" ? payload.notificationId : undefined;
    return Response.json(await markOwnerNotificationsRead(notificationId));
  } catch (error) {
    return apiError(error);
  }
}
