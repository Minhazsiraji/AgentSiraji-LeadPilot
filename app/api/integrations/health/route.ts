import { apiError, requireOwner } from "../../../../lib/api-auth";
import { getIntegrationHealth } from "../../../../lib/integration-health";

export async function GET(request: Request) {
  try {
    const auth = await requireOwner(request);
    if ("response" in auth) return auth.response;
    return Response.json(await getIntegrationHealth(), {
      headers: { "cache-control": "no-store, max-age=0" },
    });
  } catch (error) {
    return apiError(error);
  }
}
