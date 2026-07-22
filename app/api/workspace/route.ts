import { apiError, requireOwner } from "../../../lib/api-auth";
import { getWorkspacePayload } from "../../../lib/data";

export async function GET(request: Request) {
  try {
    const auth = await requireOwner(request);
    if ("response" in auth) return auth.response;
    return Response.json(await getWorkspacePayload());
  } catch (error) {
    return apiError(error);
  }
}
