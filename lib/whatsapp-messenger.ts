import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { whatsappContacts } from "../db/schema";
import { ensureSchema } from "./data";
import { getCloudflareEnv } from "./runtime-env";
import { getWhatsAppRuntimeConfig } from "./whatsapp-integration";
import { buildWhatsAppSendRequest } from "./whatsapp-messenger-core";

export type WhatsAppDeliveryResult = {
  channel: "whatsapp";
  messageId: string | null;
};

export async function hasWhatsAppContact(leadId: string) {
  await ensureSchema();
  const [contact] = await getDb()
    .select({ waId: whatsappContacts.waId })
    .from(whatsappContacts)
    .where(eq(whatsappContacts.leadId, leadId))
    .limit(1);
  return Boolean(contact);
}

export async function deliverWhatsAppReply(
  leadId: string,
  message: string,
  lastCustomerActivityAt: string | null,
  fetcher: typeof fetch = fetch,
): Promise<WhatsAppDeliveryResult> {
  await ensureSchema();
  const [contact] = await getDb()
    .select()
    .from(whatsappContacts)
    .where(eq(whatsappContacts.leadId, leadId))
    .limit(1);
  if (!contact) throw new Error("WHATSAPP_CONTACT_NOT_FOUND");

  const lastActivity = lastCustomerActivityAt
    ? new Date(lastCustomerActivityAt).getTime()
    : Number.NaN;
  if (
    !Number.isFinite(lastActivity)
    || Date.now() - lastActivity > 24 * 60 * 60 * 1_000
  ) {
    throw new Error("WHATSAPP_REPLY_WINDOW_CLOSED");
  }

  const env = getCloudflareEnv();
  const integration = await getWhatsAppRuntimeConfig(env);
  if (!integration.accessToken || !integration.phoneNumberId) {
    throw new Error("WHATSAPP_INTEGRATION_NOT_CONFIGURED");
  }
  const request = buildWhatsAppSendRequest({
    phoneNumberId: integration.phoneNumberId,
    waId: contact.waId,
    message,
    accessToken: integration.accessToken,
    graphVersion: env.WHATSAPP_GRAPH_API_VERSION?.trim()
      || env.FACEBOOK_GRAPH_API_VERSION?.trim()
      || "v26.0",
  });
  const response = await fetcher(request.url, {
    method: "POST",
    headers: request.headers,
    body: request.body,
  });
  const payload = await response.json().catch(() => null) as {
    messages?: Array<{ id?: unknown }>;
    error?: { code?: unknown; error_subcode?: unknown };
  } | null;
  if (!response.ok || payload?.error) {
    const metaCode = typeof payload?.error?.code === "number"
      ? payload.error.code
      : null;
    console.error("LeadPilot WhatsApp delivery failed", {
      code: metaCode,
      subcode: typeof payload?.error?.error_subcode === "number"
        ? payload.error.error_subcode
        : null,
      status: response.status,
    });
    if (metaCode === 190) {
      throw new Error("WHATSAPP_ACCESS_TOKEN_EXPIRED");
    }
    throw new Error("WHATSAPP_SEND_FAILED");
  }
  const messageId = payload?.messages?.[0]?.id;
  return {
    channel: "whatsapp",
    messageId: typeof messageId === "string" ? messageId.slice(0, 300) : null,
  };
}
