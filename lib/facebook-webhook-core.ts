import { hasExplicitOrderIntent } from "./order-intent.ts";

export type FacebookMessageEvent = {
  eventId: string;
  senderId: string;
  pageId: string;
  text: string;
  submittedAt: string;
};

type FacebookWebhookEnv = {
  FACEBOOK_VERIFY_TOKEN?: string;
};

const terminalPipelineStatuses = new Set([
  "Delivered",
  "Cancelled",
  "Returned",
  "Lost",
  "Closed Won",
  "Closed Lost",
]);

export function shouldStartNewMessengerOrder(
  pipelineStatus: string | null | undefined,
  hasNewOrderSignal: boolean,
) {
  return Boolean(
    pipelineStatus
    && terminalPipelineStatuses.has(pipelineStatus)
    && hasNewOrderSignal,
  );
}

export function hasExplicitMessengerOrderIntent(message: string) {
  return hasExplicitOrderIntent(message);
}

export function verifyFacebookWebhook(request: Request, env: FacebookWebhookEnv): Response {
  const verifyToken = env.FACEBOOK_VERIFY_TOKEN?.trim();
  if (!verifyToken) return new Response("Facebook integration is not configured.", { status: 503 });

  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token === verifyToken && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Webhook verification failed.", { status: 403 });
}

export async function verifyFacebookSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!signatureHeader?.startsWith("sha256=") || !appSecret) return false;
  const suppliedHex = signatureHeader.slice("sha256=".length).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(suppliedHex)) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody)),
  );
  const expectedHex = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return constantTimeEqual(expectedHex, suppliedHex);
}

export function extractFacebookMessages(
  payload: unknown,
  configuredPageId?: string,
): FacebookMessageEvent[] {
  if (!isRecord(payload) || payload.object !== "page" || !Array.isArray(payload.entry)) return [];
  const expectedPageId = configuredPageId?.trim();
  const events: FacebookMessageEvent[] = [];

  for (const entry of payload.entry) {
    if (!isRecord(entry)) continue;
    const pageId = typeof entry.id === "string" ? entry.id : "";
    if (!pageId || (expectedPageId && pageId !== expectedPageId)) continue;
    if (!Array.isArray(entry.messaging)) continue;

    for (const item of entry.messaging) {
      if (!isRecord(item) || !isRecord(item.sender) || !isRecord(item.message)) continue;
      if (item.message.is_echo === true) continue;
      const senderId = typeof item.sender.id === "string" ? item.sender.id.trim() : "";
      const eventId = typeof item.message.mid === "string" ? item.message.mid.trim() : "";
      const text = typeof item.message.text === "string" ? item.message.text.trim().slice(0, 5000) : "";
      if (!senderId || !eventId || !text) continue;
      const timestamp = typeof item.timestamp === "number" && Number.isFinite(item.timestamp)
        ? new Date(item.timestamp)
        : new Date();
      events.push({
        eventId: eventId.slice(0, 500),
        senderId: senderId.slice(0, 200),
        pageId: pageId.slice(0, 200),
        text,
        submittedAt: Number.isNaN(timestamp.getTime()) ? new Date().toISOString() : timestamp.toISOString(),
      });
    }
  }
  return events;
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
