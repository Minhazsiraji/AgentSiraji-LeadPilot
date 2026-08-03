import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { facebookContacts } from "../db/schema";
import { ensureSchema } from "./data";
import { createFacebookAppSecretProof } from "./facebook-integration-core";
import { getFacebookRuntimeConfig } from "./facebook-integration";
import { buildMessengerSendRequest } from "./facebook-messenger-core";
import { getCloudflareEnv } from "./runtime-env";

export type MessengerDeliveryResult =
  | { channel: "recorded"; messageId: null }
  | { channel: "facebook"; messageId: string | null };

export async function deliverApprovedReply(
  leadId: string,
  leadSource: string,
  message: string,
  lastCustomerActivityAt: string | null,
  fetcher: typeof fetch = fetch,
): Promise<MessengerDeliveryResult> {
  if (leadSource !== "Facebook Messenger") {
    return { channel: "recorded", messageId: null };
  }

  await ensureSchema();
  const [contact] = await getDb()
    .select()
    .from(facebookContacts)
    .where(eq(facebookContacts.leadId, leadId))
    .limit(1);
  if (!contact) throw new Error("FACEBOOK_CONTACT_NOT_FOUND");
  const lastActivity = lastCustomerActivityAt
    ? new Date(lastCustomerActivityAt).getTime()
    : Number.NaN;
  if (
    !Number.isFinite(lastActivity)
    || Date.now() - lastActivity > 24 * 60 * 60 * 1_000
  ) {
    throw new Error("FACEBOOK_REPLY_WINDOW_CLOSED");
  }

  const env = getCloudflareEnv();
  const integration = await getFacebookRuntimeConfig(env);
  const pageAccessToken = integration.pageAccessToken;
  const appSecret = integration.appSecret;
  const pageId = integration.pageId;
  if (!pageAccessToken || !appSecret || !pageId) {
    throw new Error("FACEBOOK_INTEGRATION_NOT_CONFIGURED");
  }

  const version = env.FACEBOOK_GRAPH_API_VERSION?.trim() || "v26.0";
  const request = buildMessengerSendRequest({
    pageId,
    senderId: contact.senderId,
    message,
    pageAccessToken,
    appSecretProof: await createFacebookAppSecretProof(pageAccessToken, appSecret),
    graphVersion: version,
  });
  const response = await fetcher(request.url, {
    method: "POST",
    headers: request.headers,
    body: request.body,
  });
  const payload = await response.json().catch(() => null) as {
    message_id?: unknown;
    error?: { code?: unknown; error_subcode?: unknown };
  } | null;
  if (!response.ok || payload?.error) {
    const code = typeof payload?.error?.code === "number" ? payload.error.code : null;
    const subcode = typeof payload?.error?.error_subcode === "number"
      ? payload.error.error_subcode
      : null;
    console.error("LeadPilot Messenger delivery failed", {
      code,
      subcode,
      status: response.status,
    });
    throw new Error("FACEBOOK_SEND_FAILED");
  }

  return {
    channel: "facebook",
    messageId: typeof payload?.message_id === "string"
      ? payload.message_id.slice(0, 300)
      : null,
  };
}
