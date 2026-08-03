import { hasExplicitOrderIntent } from "./order-intent.ts";

export type WhatsAppMessageEvent = {
  eventId: string;
  waId: string;
  phoneNumberId: string;
  wabaId: string;
  customerName: string;
  text: string;
  submittedAt: string;
};

type WhatsAppWebhookEnv = {
  WHATSAPP_VERIFY_TOKEN?: string;
  FACEBOOK_VERIFY_TOKEN?: string;
};

export function verifyWhatsAppWebhook(
  request: Request,
  env: WhatsAppWebhookEnv,
  storedVerifyToken?: string | null,
): Response {
  const verifyToken = storedVerifyToken?.trim()
    || env.WHATSAPP_VERIFY_TOKEN?.trim()
    || env.FACEBOOK_VERIFY_TOKEN?.trim();
  if (!verifyToken) return new Response("WhatsApp integration is not configured.", { status: 503 });

  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token === verifyToken && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Webhook verification failed.", { status: 403 });
}

export function extractWhatsAppMessages(
  payload: unknown,
  configuredPhoneNumberId?: string,
  configuredWabaId?: string,
): WhatsAppMessageEvent[] {
  if (
    !isRecord(payload)
    || payload.object !== "whatsapp_business_account"
    || !Array.isArray(payload.entry)
  ) {
    return [];
  }
  const expectedPhoneNumberId = configuredPhoneNumberId?.trim();
  const expectedWabaId = configuredWabaId?.trim();
  const events: WhatsAppMessageEvent[] = [];

  for (const entry of payload.entry) {
    if (!isRecord(entry)) continue;
    const wabaId = normalizeId(entry.id);
    if (!wabaId || (expectedWabaId && wabaId !== expectedWabaId)) continue;
    if (!Array.isArray(entry.changes)) continue;

    for (const change of entry.changes) {
      if (!isRecord(change) || change.field !== "messages" || !isRecord(change.value)) continue;
      const metadata = isRecord(change.value.metadata) ? change.value.metadata : {};
      const phoneNumberId = normalizeId(metadata.phone_number_id);
      if (
        !phoneNumberId
        || (expectedPhoneNumberId && phoneNumberId !== expectedPhoneNumberId)
      ) {
        continue;
      }
      const contacts = Array.isArray(change.value.contacts) ? change.value.contacts : [];
      const contactNames = new Map<string, string>();
      for (const contact of contacts) {
        if (!isRecord(contact)) continue;
        const waId = normalizeId(contact.wa_id);
        const profile = isRecord(contact.profile) ? contact.profile : {};
        const name = cleanText(profile.name, 120);
        if (waId && name) contactNames.set(waId, name);
      }
      const messages = Array.isArray(change.value.messages) ? change.value.messages : [];
      for (const message of messages) {
        if (
          !isRecord(message)
          || message.type !== "text"
          || !isRecord(message.text)
        ) {
          continue;
        }
        const eventId = cleanText(message.id, 500);
        const waId = normalizeId(message.from);
        const text = cleanText(message.text.body, 5000);
        if (!eventId || !waId || !text) continue;
        const timestampSeconds = typeof message.timestamp === "string"
          ? Number(message.timestamp)
          : typeof message.timestamp === "number"
            ? message.timestamp
            : Number.NaN;
        const date = Number.isFinite(timestampSeconds)
          ? new Date(timestampSeconds * 1_000)
          : new Date();
        events.push({
          eventId,
          waId,
          phoneNumberId,
          wabaId,
          customerName: contactNames.get(waId) || `WhatsApp customer · ${waId.slice(-6)}`,
          text,
          submittedAt: Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString(),
        });
      }
    }
  }
  return events;
}

const terminalPipelineStatuses = new Set([
  "Delivered",
  "Cancelled",
  "Returned",
  "Lost",
  "Won",
  "Closed Won",
  "Closed Lost",
]);

export type WhatsAppMessageRoute = "new_lead" | "new_order" | "update_order" | "reply";

export function routeWhatsAppMessage(input: {
  hasContact: boolean;
  linkedSource?: string | null;
  linkedPipelineStatus?: string | null;
  hasExplicitOrder: boolean;
}): WhatsAppMessageRoute {
  if (
    !input.hasContact
    || input.linkedSource !== "WhatsApp"
    || !input.linkedPipelineStatus
  ) return "new_lead";
  if (input.hasExplicitOrder && terminalPipelineStatuses.has(input.linkedPipelineStatus)) {
    return "new_order";
  }
  if (input.hasExplicitOrder) return "update_order";
  return "reply";
}

export function hasExplicitWhatsAppOrderIntent(message: string) {
  return hasExplicitOrderIntent(message);
}

function normalizeId(value: unknown) {
  if (typeof value === "string" && /^\d{3,30}$/.test(value.trim())) return value.trim();
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  return "";
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
