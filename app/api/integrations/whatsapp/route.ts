import { apiError, requireOwner } from "../../../../lib/api-auth";
import { getCloudflareEnv } from "../../../../lib/runtime-env";
import {
  getWhatsAppIntegrationStatus,
  removeWhatsAppIntegration,
  saveWhatsAppIntegration,
} from "../../../../lib/whatsapp-integration";
import {
  exchangeWhatsAppEmbeddedSignupCode,
  validateWhatsAppConnection,
  validateWhatsAppEmbeddedSignupInput,
  validateWhatsAppTestNumberInput,
  WhatsAppMetaValidationError,
} from "../../../../lib/whatsapp-integration-core";
import { getFacebookRuntimeConfig } from "../../../../lib/facebook-integration";

export async function GET(request: Request) {
  try {
    const auth = await requireOwner(request);
    if ("response" in auth) return auth.response;
    const env = getCloudflareEnv();
    const appId = env.FACEBOOK_APP_ID?.trim() || "";
    const configId = env.WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID?.trim() || "";
    const graphVersion = env.WHATSAPP_GRAPH_API_VERSION?.trim()
      || env.FACEBOOK_GRAPH_API_VERSION?.trim()
      || "v26.0";
    return Response.json({
      ...await getWhatsAppIntegrationStatus(),
      embeddedSignup: {
        ready: /^\d{5,30}$/.test(appId) && /^\d{5,30}$/.test(configId),
        appId: /^\d{5,30}$/.test(appId) ? appId : null,
        configId: /^\d{5,30}$/.test(configId) ? configId : null,
        graphVersion: /^v\d+\.\d+$/.test(graphVersion) ? graphVersion : "v26.0",
        featureType: "whatsapp_business_app_onboarding",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireOwner(request);
    if ("response" in auth) return auth.response;
    const body = await request.json() as Record<string, unknown>;
    if (
      typeof body.code !== "string"
      || typeof body.wabaId !== "string"
      || typeof body.phoneNumberId !== "string"
    ) {
      return Response.json({
        error: "Meta did not return a complete WhatsApp signup result. Start the secure connection again.",
      }, { status: 400 });
    }

    let signup;
    try {
      signup = validateWhatsAppEmbeddedSignupInput({
        code: body.code,
        wabaId: body.wabaId,
        phoneNumberId: body.phoneNumberId,
      });
    } catch {
      return Response.json({
        error: "Meta returned an invalid WhatsApp signup result. Start the secure connection again.",
      }, { status: 400 });
    }

    const env = getCloudflareEnv();
    const appId = env.FACEBOOK_APP_ID?.trim();
    const configId = env.WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID?.trim();
    if (!appId) {
      return Response.json({
        error: "LeadPilot's Meta App ID is not configured on the server.",
      }, { status: 503 });
    }
    if (!configId) {
      return Response.json({
        error: "LeadPilot's Meta Embedded Signup configuration is not ready yet.",
      }, { status: 503 });
    }

    try {
      const appSecret = await resolveMetaAppSecret(env);
      const accessToken = await exchangeWhatsAppEmbeddedSignupCode({
        appId,
        appSecret,
        code: signup.code,
      }, env.WHATSAPP_GRAPH_API_VERSION?.trim()
        || env.FACEBOOK_GRAPH_API_VERSION?.trim()
        || "v26.0");
      const credentials = {
        appSecret,
        accessToken,
        wabaId: signup.wabaId,
        phoneNumberId: signup.phoneNumberId,
      };
      const identity = await validateWhatsAppConnection(
        credentials,
        appId,
        env.WHATSAPP_GRAPH_API_VERSION?.trim()
          || env.FACEBOOK_GRAPH_API_VERSION?.trim()
          || "v26.0",
      );
      return Response.json(await saveWhatsAppIntegration({
        ...credentials,
        ...identity,
        connectionMode: "coexistence",
        verifyToken: null,
        connectedBy: auth.user.email,
      }, env));
    } catch (error) {
      if (error instanceof WhatsAppMetaValidationError) {
        const code = error.metaCode === null
          ? ""
          : ` (Meta code ${error.metaCode}${error.metaSubcode === null ? "" : `, subcode ${error.metaSubcode}`})`;
        const messages: Record<string, string> = {
          app_id: `The WhatsApp token does not belong to the configured LeadPilot Meta app${code}.`,
          app_secret: `Meta could not authenticate the LeadPilot app${code}. Check the current App Secret.`,
          access_token: `Meta rejected the WhatsApp access token${code}. Check that the complete permanent token was copied.`,
          permissions: `The token is missing whatsapp_business_messaging or whatsapp_business_management${code}.`,
          phone_identity: `Meta could not verify that Phone Number ID${code}.`,
          waba_identity: `That Phone Number ID does not belong to the supplied WhatsApp Business Account${code}.`,
          subscription: `Meta verified the WhatsApp account but could not subscribe LeadPilot to its webhooks${code}.`,
          unknown: `Meta rejected the WhatsApp connection${code}.`,
        };
        return Response.json({ error: messages[error.reason] }, { status: 400 });
      }
      if (error instanceof Error && error.message === "META_APP_SECRET_UNAVAILABLE") {
        return Response.json({
          error: "LeadPilot's Meta app secret is not available on the server. Reopen the working Facebook connection or configure the server secret.",
        }, { status: 503 });
      }
      return Response.json({
        error: "LeadPilot could not complete WhatsApp onboarding. Start the secure Meta connection again.",
      }, { status: 400 });
    }
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireOwner(request);
    if ("response" in auth) return auth.response;
    const body = await request.json() as Record<string, unknown>;
    if (
      typeof body.accessToken !== "string"
      || typeof body.wabaId !== "string"
      || typeof body.phoneNumberId !== "string"
      || typeof body.verifyToken !== "string"
    ) {
      return Response.json({
        error: "Temporary token, WABA ID, Phone Number ID, and verification token are required.",
      }, { status: 400 });
    }
    let testInput;
    try {
      testInput = validateWhatsAppTestNumberInput({
        accessToken: body.accessToken,
        wabaId: body.wabaId,
        phoneNumberId: body.phoneNumberId,
        verifyToken: body.verifyToken,
      });
    } catch {
      return Response.json({
        error: "Copy the complete temporary token and numeric IDs from Meta, and keep the generated verification token unchanged.",
      }, { status: 400 });
    }

    const env = getCloudflareEnv();
    const appId = env.FACEBOOK_APP_ID?.trim();
    if (!appId) {
      return Response.json({
        error: "LeadPilot's Meta App ID is not configured on the server.",
      }, { status: 503 });
    }
    try {
      const appSecret = await resolveMetaAppSecret(env);
      const credentials = {
        appSecret,
        accessToken: testInput.accessToken,
        wabaId: testInput.wabaId,
        phoneNumberId: testInput.phoneNumberId,
      };
      const identity = await validateWhatsAppConnection(
        credentials,
        appId,
        env.WHATSAPP_GRAPH_API_VERSION?.trim()
          || env.FACEBOOK_GRAPH_API_VERSION?.trim()
          || "v26.0",
      );
      return Response.json(await saveWhatsAppIntegration({
        ...credentials,
        ...identity,
        connectionMode: "test",
        verifyToken: testInput.verifyToken,
        connectedBy: auth.user.email,
      }, env));
    } catch (error) {
      if (error instanceof WhatsAppMetaValidationError) {
        const code = error.metaCode === null
          ? ""
          : ` (Meta code ${error.metaCode}${error.metaSubcode === null ? "" : `, subcode ${error.metaSubcode}`})`;
        const messages: Record<string, string> = {
          app_id: `The temporary token belongs to a different Meta app${code}.`,
          app_secret: `Meta could not authenticate the LeadPilot app${code}.`,
          access_token: `The temporary token is invalid or expired${code}. Generate a new one in WhatsApp → API Setup.`,
          permissions: `The temporary token is missing WhatsApp messaging permissions${code}. Generate it from this app's WhatsApp API Setup page.`,
          phone_identity: `Meta could not verify that test Phone Number ID${code}.`,
          waba_identity: `That test Phone Number ID does not belong to the supplied WABA ID${code}.`,
          subscription: `Meta verified the test number but could not subscribe LeadPilot to its webhooks${code}.`,
          unknown: `Meta rejected the test-number connection${code}.`,
        };
        return Response.json({ error: messages[error.reason] }, { status: 400 });
      }
      if (error instanceof Error && error.message === "META_APP_SECRET_UNAVAILABLE") {
        return Response.json({
          error: "LeadPilot's Meta app secret is not available on the server.",
        }, { status: 503 });
      }
      return Response.json({
        error: "LeadPilot could not verify the Meta test number. Recopy the current values from WhatsApp → API Setup.",
      }, { status: 400 });
    }
  } catch (error) {
    return apiError(error);
  }
}

async function resolveMetaAppSecret(env: ReturnType<typeof getCloudflareEnv>) {
  const configured = env.FACEBOOK_APP_SECRET?.trim();
  if (configured && /^[a-f0-9]{32}$/i.test(configured)) return configured;
  const facebook = await getFacebookRuntimeConfig(env);
  if (facebook.appSecret && /^[a-f0-9]{32}$/i.test(facebook.appSecret)) {
    return facebook.appSecret;
  }
  throw new Error("META_APP_SECRET_UNAVAILABLE");
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireOwner(request);
    if ("response" in auth) return auth.response;
    await removeWhatsAppIntegration();
    return Response.json({
      configured: false,
      wabaId: null,
      phoneNumberId: null,
      displayPhoneNumber: null,
      verifiedName: null,
      connectionMode: null,
      tokenExpiresAt: null,
      updatedAt: null,
    });
  } catch (error) {
    return apiError(error);
  }
}
