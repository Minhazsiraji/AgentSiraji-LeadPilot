import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { facebookContacts, facebookWebhookEvents, leads, ownerNotifications } from "../db/schema";
import {
  businessRowToProfile,
  createLead,
  DEFAULT_BUSINESS_ID,
  ensureBusiness,
  ensureSchema,
  recordCustomerReply,
} from "./data";
import {
  extractFacebookMessages,
  shouldStartNewMessengerOrder,
  verifyFacebookSignature,
  verifyFacebookWebhook,
  type FacebookMessageEvent,
} from "./facebook-webhook-core";
import { inferConfiguredOrder } from "./lead-engine";
import type { LeadPilotEnv } from "./runtime-env";

type ExecutionContextLike = {
  waitUntil(promise: Promise<unknown>): void;
};

export async function handleFacebookWebhook(
  request: Request,
  env: LeadPilotEnv,
  ctx: ExecutionContextLike,
): Promise<Response> {
  if (request.method === "GET") return verifyFacebookWebhook(request, env);
  if (request.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { allow: "GET, POST" },
    });
  }

  const appSecret = env.FACEBOOK_APP_SECRET?.trim();
  if (!appSecret) return new Response("Facebook integration is not configured.", { status: 503 });

  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!(await verifyFacebookSignature(rawBody, signature, appSecret))) {
    return new Response("Invalid webhook signature.", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON.", { status: 400 });
  }

  const events = extractFacebookMessages(payload, env.FACEBOOK_PAGE_ID);
  if (events.length) {
    ctx.waitUntil(processFacebookMessages(events, env));
  }
  return new Response("EVENT_RECEIVED", { status: 200 });
}

async function processFacebookMessages(events: FacebookMessageEvent[], env: LeadPilotEnv) {
  for (const event of events) {
    try {
      await processFacebookMessage(event, env);
    } catch (error) {
      console.error("LeadPilot Facebook webhook processing failed", {
        eventId: event.eventId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      await releaseFailedEvent(event.eventId);
    }
  }
}

async function processFacebookMessage(event: FacebookMessageEvent, env: LeadPilotEnv) {
  await ensureSchema();
  const db = getDb();
  const claimed = await db
    .insert(facebookWebhookEvents)
    .values({
      eventId: event.eventId,
      senderId: event.senderId,
      pageId: event.pageId,
      status: "processing",
      receivedAt: new Date().toISOString(),
    })
    .onConflictDoNothing()
    .returning({ eventId: facebookWebhookEvents.eventId });
  if (!claimed.length) return;

  const existingContact = await db
    .select()
    .from(facebookContacts)
    .where(and(eq(facebookContacts.senderId, event.senderId), eq(facebookContacts.pageId, event.pageId)))
    .limit(1);

  const linkedLead = existingContact[0]
    ? await db
        .select({ id: leads.id, pipelineStatus: leads.pipelineStatus })
        .from(leads)
        .where(and(
          eq(leads.id, existingContact[0].leadId),
          eq(leads.businessId, DEFAULT_BUSINESS_ID),
        ))
        .limit(1)
    : [];

  let startNewLead = !existingContact[0] || !linkedLead[0];
  if (!startNewLead && linkedLead[0]) {
    const profile = businessRowToProfile(await ensureBusiness());
    const configuredOrder = inferConfiguredOrder(event.text, profile.services);
    startNewLead = shouldStartNewMessengerOrder(
      linkedLead[0].pipelineStatus,
      Boolean(configuredOrder),
    );
  }

  let leadId: string;
  if (startNewLead) {
    const customerName = existingContact[0]?.customerName
      ?? await resolveFacebookName(event.senderId, env);
    const result = await createLead({
      customerName,
      email: null,
      phone: null,
      message: event.text,
      source: "Facebook Messenger",
      submittedAt: event.submittedAt,
      skipContactlessDuplicate: true,
    }, "Facebook Messenger");
    leadId = result.lead.id;
    await db.insert(facebookContacts).values({
      senderId: event.senderId,
      pageId: event.pageId,
      leadId,
      customerName,
      createdAt: event.submittedAt,
      updatedAt: event.submittedAt,
    }).onConflictDoUpdate({
      target: facebookContacts.senderId,
      set: { pageId: event.pageId, leadId, customerName, updatedAt: event.submittedAt },
    });
  } else {
    leadId = linkedLead[0].id;
    const recorded = await recordCustomerReply(leadId, event.text, "Facebook Messenger");
    if (!recorded) throw new Error("Linked Messenger lead was not found.");
    await db.update(facebookContacts).set({
      updatedAt: event.submittedAt,
    }).where(eq(facebookContacts.senderId, event.senderId));
    await db.insert(ownerNotifications).values({
      id: crypto.randomUUID(),
      businessId: DEFAULT_BUSINESS_ID,
      leadId,
      type: "messenger_reply",
      title: `New Messenger reply from ${existingContact[0].customerName}`,
      message: event.text.slice(0, 240),
      createdAt: event.submittedAt,
    });
  }

  await db.update(facebookWebhookEvents).set({
    leadId,
    status: "processed",
    processedAt: new Date().toISOString(),
  }).where(eq(facebookWebhookEvents.eventId, event.eventId));
}

async function resolveFacebookName(senderId: string, env: LeadPilotEnv): Promise<string> {
  const fallback = `Messenger customer · ${senderId.slice(-6)}`;
  const pageAccessToken = env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim();
  if (!pageAccessToken) return fallback;
  const version = env.FACEBOOK_GRAPH_API_VERSION?.trim() || "v26.0";
  const url = new URL(`https://graph.facebook.com/${version}/${encodeURIComponent(senderId)}`);
  url.searchParams.set("fields", "first_name,last_name");
  url.searchParams.set("access_token", pageAccessToken);
  try {
    const response = await fetch(url, { headers: { accept: "application/json" } });
    if (!response.ok) return fallback;
    const profile = await response.json() as { first_name?: unknown; last_name?: unknown };
    const name = [profile.first_name, profile.last_name]
      .filter((part): part is string => typeof part === "string" && Boolean(part.trim()))
      .map((part) => part.trim())
      .join(" ")
      .slice(0, 120);
    return name || fallback;
  } catch {
    return fallback;
  }
}

async function releaseFailedEvent(eventId: string) {
  try {
    const db = getDb();
    await db.delete(facebookWebhookEvents).where(eq(facebookWebhookEvents.eventId, eventId));
  } catch (error) {
    console.error("LeadPilot could not release failed Facebook event", {
      eventId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
