import { apiError, requireOwner } from "../../../../lib/api-auth";
import {
  getFacebookIntegrationStatus,
  removeFacebookIntegration,
  saveFacebookIntegration,
} from "../../../../lib/facebook-integration";
import {
  FacebookMetaValidationError,
  validateFacebookCredentialInput,
  validateFacebookPageToken,
} from "../../../../lib/facebook-integration-core";
import { getCloudflareEnv } from "../../../../lib/runtime-env";

export async function GET(request: Request) {
  try {
    const auth = await requireOwner(request);
    if ("response" in auth) return auth.response;
    return Response.json(await getFacebookIntegrationStatus());
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireOwner(request);
    if ("response" in auth) return auth.response;
    const body = await request.json() as {
      appSecret?: unknown;
      pageAccessToken?: unknown;
    };
    if (typeof body.appSecret !== "string" || typeof body.pageAccessToken !== "string") {
      return Response.json({ error: "App Secret and Page Access Token are required." }, { status: 400 });
    }
    let credentials: { appSecret: string; pageAccessToken: string };
    try {
      credentials = validateFacebookCredentialInput(body.appSecret, body.pageAccessToken);
    } catch {
      return Response.json({ error: "Check the App Secret and Page Access Token, then try again." }, { status: 400 });
    }
    const env = getCloudflareEnv();
    const appId = env.FACEBOOK_APP_ID?.trim();
    const expectedPageId = env.FACEBOOK_PAGE_ID?.trim();
    if (!appId || !expectedPageId) {
      return Response.json({
        error: "LeadPilot's Meta app or StepFresh Page identity is not configured on the server.",
      }, { status: 503 });
    }
    let page: { pageId: string; pageName: string };
    try {
      page = await validateFacebookPageToken(
        credentials.pageAccessToken,
        appId,
        credentials.appSecret,
        {
          pageId: expectedPageId,
          pageName: env.FACEBOOK_PAGE_NAME?.trim() || "StepFresh",
        },
        env.FACEBOOK_GRAPH_API_VERSION?.trim() || "v26.0",
      );
    } catch (error) {
      if (error instanceof FacebookMetaValidationError) {
        const code = error.metaCode === null
          ? ""
          : ` (Meta code ${error.metaCode}${error.metaSubcode === null ? "" : `, subcode ${error.metaSubcode}`})`;
        if (error.reason === "app_id") {
          return Response.json({
            error: `The Page token does not belong to the configured LeadPilot Meta app${code}.`,
          }, { status: 400 });
        }
        if (error.reason === "app_secret") {
          return Response.json({
            error: `Meta could not authenticate the LeadPilot app${code}. Copy the current App Secret from LeadPilot → App settings → Basic, then retry with the same valid Page token.`,
          }, { status: 400 });
        }
        if (error.reason === "permissions") {
          return Response.json({
            error: `Meta rejected the Page permission${code}. Keep the same valid token and confirm StepFresh has the messages subscription and pages_messaging permission.`,
          }, { status: 400 });
        }
        if (error.reason === "page_token") {
          return Response.json({
            error: `Meta could not use the Page token${code}. The Token Debugger already showed the StepFresh token as valid, so do not generate another token; recopy the same complete token and try once more.`,
          }, { status: 400 });
        }
        if (error.reason === "page_identity") {
          return Response.json({
            error: "Meta validated the token but did not return a usable StepFresh Page identity.",
          }, { status: 400 });
        }
        return Response.json({
          error: `Meta rejected the connection${code}. Do not rotate the valid StepFresh token; report this exact code so LeadPilot can complete the diagnosis.`,
        }, { status: 400 });
      }
      return Response.json({
        error: "LeadPilot could not complete Meta validation. Keep the current valid token and try again.",
      }, { status: 400 });
    }
    const status = await saveFacebookIntegration({
      ...credentials,
      ...page,
      connectedBy: auth.user.email,
    }, env);
    return Response.json(status);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireOwner(request);
    if ("response" in auth) return auth.response;
    await removeFacebookIntegration();
    return Response.json({ configured: false, pageId: null, pageName: null, updatedAt: null });
  } catch (error) {
    return apiError(error);
  }
}
