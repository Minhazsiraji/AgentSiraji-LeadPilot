import { apiError, requireOwner } from "../../../lib/api-auth";
import { businessRowToProfile, updateBusinessSettings } from "../../../lib/data";
import type { BusinessProfile } from "../../../lib/types";

export async function GET(request: Request) {
  try {
    const auth = await requireOwner(request);
    if ("response" in auth) return auth.response;
    return Response.json({ business: businessRowToProfile(auth.business) });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireOwner(request);
    if ("response" in auth) return auth.response;
    const updated = await updateBusinessSettings(await request.json() as Partial<BusinessProfile>);
    return Response.json({ business: businessRowToProfile(updated) });
  } catch (error) {
    return apiError(error);
  }
}
