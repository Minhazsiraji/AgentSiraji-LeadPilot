import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import {
  leads,
  ownerNotifications,
  whatsappContacts,
  whatsappWebhookEvents,
} from "../db/schema";
import {
  businessRowToProfile,
  createLead,
  DEFAULT_BUSINESS_ID,
  ensureBusiness,
  ensureSchema,
  recordCustomerReply,
} from "./data";
import { verifyFacebookSignature } from "./facebook-webhook-core";
import {
  extractCustomerName,
  extractDeliveryLocation,
  extractMessagePhone,
  inferConfiguredOrder,
  normalizePhone,
} from "./lead-engine";
import type { LeadPilotEnv } from "./runtime-env";
import { getWhatsAppRuntimeConfig, type WhatsAppRuntimeConfig } from "./whatsapp-integration";
import {
  extractWhatsAppMessages,
  hasExplicitWhatsAppOrderIntent,
  routeWhatsAppMessage,
  verifyWhatsAppWebhook,
  type WhatsAppMessageEvent,
} from "./whatsapp-webhook-core";

type ExecutionContextLike = {
  waitUntil(promise: Promise<unknown>): void;
};

export async function handleWhatsAppWebhook(
  request: Request,
  env: LeadPilotEnv,
  ctx: ExecutionContextLike,
): Promise<Response> {
  if (request.method === "GET") {
    const integration = await getWhatsAppRuntimeConfig(env).catch(() => null);
    return verifyWhatsAppWebhook(request, env, integration?.verifyToken);
  }
  if (request.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { allow: "GET, POST" },
    });
  }

  const integration = await getWhatsAppRuntimeConfig(env);
  if (
    !integration.appSecret
    || !integration.phoneNumberId
    || !integration.wabaId
  ) {
    return new Response("WhatsApp integration is not configured.", { status: 503 });
  }

  const rawBody = await request.text();
  if (!(await verifyFacebookSignature(
    rawBody,
    request.headers.get("x-hub-signature-256"),
    integration.appSecret,
  ))) {
    return new Response("Invalid webhook signature.", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON.", { status: 400 });
  }

  const events = extractWhatsAppMessages(
    payload,
    integration.phoneNumberId,
    integration.wabaId,
  );
  if (events.length) {
    ctx.waitUntil(processWhatsAppMessages(events, integration));
  }
  return new Response("EVENT_RECEIVED", { status: 200 });
}

async function processWhatsAppMessages(
  events: WhatsAppMessageEvent[],
  integration: WhatsAppRuntimeConfig,
) {
  for (const event of events) {
    try {
      await processWhatsAppMessage(event, integration);
    } catch (error) {
      console.error("LeadPilot WhatsApp webhook processing failed", {
        eventId: event.eventId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      await releaseFailedEvent(event.eventId);
    }
  }
}

async function processWhatsAppMessage(
  event: WhatsAppMessageEvent,
  integration: WhatsAppRuntimeConfig,
) {
  await ensureSchema();
  const db = getDb();
  const claimed = await db
    .insert(whatsappWebhookEvents)
    .values({
      eventId: event.eventId,
      waId: event.waId,
      phoneNumberId: event.phoneNumberId,
      status: "processing",
      receivedAt: new Date().toISOString(),
    })
    .onConflictDoNothing()
    .returning({ eventId: whatsappWebhookEvents.eventId });
  if (!claimed.length) return;

  const [existingContact] = await db
    .select()
    .from(whatsappContacts)
    .where(and(
      eq(whatsappContacts.waId, event.waId),
      eq(whatsappContacts.phoneNumberId, event.phoneNumberId),
    ))
    .limit(1);

  const [linkedLead] = existingContact
    ? await db
      .select({
        id: leads.id,
        customerName: leads.customerName,
        pipelineStatus: leads.pipelineStatus,
      })
      .from(leads)
      .where(and(
        eq(leads.id, existingContact.leadId),
        eq(leads.businessId, DEFAULT_BUSINESS_ID),
      ))
      .limit(1)
    : [];
  const hasExplicitOrder = hasExplicitWhatsAppOrderIntent(event.text);
  const route = routeWhatsAppMessage({
    hasContact: Boolean(existingContact && linkedLead),
    linkedPipelineStatus: linkedLead?.pipelineStatus,
    hasExplicitOrder,
  });
  const messageCustomerName = extractCustomerName(event.text);
  const customerName = messageCustomerName
    || event.customerName
    || existingContact?.customerName
    || `WhatsApp customer · ${event.waId.slice(-6)}`;
  const verifiedPhone = extractMessagePhone(event.text)
    ?? normalizePhone(`+${event.waId}`);
  const messageLocation = extractDeliveryLocation(event.text);

  let leadId: string;
  if (route === "new_lead" || route === "new_order") {
    const result = await createLead({
      customerName,
      email: null,
      phone: verifiedPhone,
      message: event.text,
      source: "WhatsApp",
      submittedAt: event.submittedAt,
      skipContactlessDuplicate: true,
      allowRepeatCustomerOrder: true,
      skipDuplicateCheck: true,
    }, "WhatsApp");
    leadId = result.lead.id;
    await db.insert(whatsappContacts).values({
      waId: event.waId,
      phoneNumberId: event.phoneNumberId,
      leadId,
      customerName,
      createdAt: event.submittedAt,
      updatedAt: event.submittedAt,
    }).onConflictDoUpdate({
      target: [whatsappContacts.waId, whatsappContacts.phoneNumberId],
      set: {
        leadId,
        customerName,
        updatedAt: event.submittedAt,
      },
    });
  } else {
    if (!linkedLead || !existingContact) {
      throw new Error("Linked WhatsApp contact was not found.");
    }
    leadId = linkedLead.id;
    const isOrderRevision = route === "update_order";
    const recorded = await recordCustomerReply(
      leadId,
      event.text,
      "WhatsApp",
      event.submittedAt,
      isOrderRevision
        ? { customerName, phone: verifiedPhone }
        : undefined,
    );
    if (!recorded) throw new Error("Linked WhatsApp lead was not found.");

    await db.update(whatsappContacts).set({
      customerName: isOrderRevision ? customerName : existingContact.customerName,
      updatedAt: event.submittedAt,
    }).where(and(
      eq(whatsappContacts.waId, event.waId),
      eq(whatsappContacts.phoneNumberId, event.phoneNumberId),
    ));

    const configuredOrder = isOrderRevision
      ? inferConfiguredOrder(
        event.text,
        businessRowToProfile(await ensureBusiness()).services,
      )
      : null;
    await db.insert(ownerNotifications).values({
      id: crypto.randomUUID(),
      businessId: DEFAULT_BUSINESS_ID,
      leadId,
      type: isOrderRevision ? "whatsapp_order_updated" : "whatsapp_reply",
      title: isOrderRevision
        ? `WhatsApp order updated by ${customerName}`
        : `New WhatsApp reply from ${existingContact.customerName}`,
      message: isOrderRevision
        ? `${configuredOrder?.serviceRequested ?? "Order details updated"} · ${verifiedPhone ?? "Phone pending"} · ${messageLocation ?? "Location unchanged"}`.slice(0, 240)
        : event.text.slice(0, 240),
      createdAt: event.submittedAt,
    });
  }

  await db.update(whatsappWebhookEvents).set({
    leadId,
    status: "processed",
    processedAt: new Date().toISOString(),
  }).where(eq(whatsappWebhookEvents.eventId, event.eventId));

  void integration;
}

async function releaseFailedEvent(eventId: string) {
  try {
    await getDb()
      .delete(whatsappWebhookEvents)
      .where(eq(whatsappWebhookEvents.eventId, eventId));
  } catch (error) {
    console.error("LeadPilot could not release failed WhatsApp event", {
      eventId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
