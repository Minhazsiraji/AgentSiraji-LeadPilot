import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  exchangeWhatsAppEmbeddedSignupCode,
  validateWhatsAppConnection,
  validateWhatsAppCredentialInput,
  validateWhatsAppEmbeddedSignupInput,
  validateWhatsAppTestNumberInput,
} from "../lib/whatsapp-integration-core.ts";
import {
  extractWhatsAppMessages,
  hasExplicitWhatsAppOrderIntent,
  routeWhatsAppMessage,
  verifyWhatsAppWebhook,
} from "../lib/whatsapp-webhook-core.ts";
import { buildWhatsAppSendRequest } from "../lib/whatsapp-messenger-core.ts";
import {
  extractCustomerName,
  extractDeliveryLocation,
  inferConfiguredOrder,
} from "../lib/lead-engine.ts";

test("WhatsApp credentials are bounded before any Meta request", () => {
  assert.deepEqual(validateWhatsAppCredentialInput({
    appSecret: "0123456789abcdef0123456789abcdef",
    accessToken: "A".repeat(60),
    wabaId: "123456789012345",
    phoneNumberId: "987654321098765",
  }), {
    appSecret: "0123456789abcdef0123456789abcdef",
    accessToken: "A".repeat(60),
    wabaId: "123456789012345",
    phoneNumberId: "987654321098765",
  });
  assert.throws(() => validateWhatsAppCredentialInput({
    appSecret: "bad",
    accessToken: "short",
    wabaId: "not-an-id",
    phoneNumberId: "also-bad",
  }));
});

test("WhatsApp Embedded Signup validates the one-time code and selected account", () => {
  assert.deepEqual(validateWhatsAppEmbeddedSignupInput({
    code: "AQAB-safe-one-time-code_1234567890",
    wabaId: "123456789012345",
    phoneNumberId: "987654321098765",
  }), {
    code: "AQAB-safe-one-time-code_1234567890",
    wabaId: "123456789012345",
    phoneNumberId: "987654321098765",
  });
  assert.throws(() => validateWhatsAppEmbeddedSignupInput({
    code: "bad code",
    wabaId: "bad",
    phoneNumberId: "bad",
  }));
});

test("Meta test-number input accepts only bounded temporary credentials", () => {
  assert.deepEqual(validateWhatsAppTestNumberInput({
    accessToken: "EAA" + "x".repeat(80),
    wabaId: "123456789012345",
    phoneNumberId: "987654321098765",
    verifyToken: "leadpilot-wa-0123456789abcdef",
  }), {
    accessToken: "EAA" + "x".repeat(80),
    wabaId: "123456789012345",
    phoneNumberId: "987654321098765",
    verifyToken: "leadpilot-wa-0123456789abcdef",
  });
  assert.throws(() => validateWhatsAppTestNumberInput({
    accessToken: "short",
    wabaId: "bad",
    phoneNumberId: "bad",
    verifyToken: "contains spaces",
  }));
});

test("WhatsApp Embedded Signup exchanges its code only on the server", async () => {
  let requestedUrl = "";
  const accessToken = await exchangeWhatsAppEmbeddedSignupCode({
    appId: "1592630249089288",
    appSecret: "0123456789abcdef0123456789abcdef",
    code: "AQAB-safe-one-time-code_1234567890",
  }, "v26.0", async (url) => {
    requestedUrl = String(url);
    return Response.json({ access_token: "EAA" + "x".repeat(80), token_type: "bearer" });
  });
  const parsed = new URL(requestedUrl);
  assert.equal(parsed.pathname, "/v26.0/oauth/access_token");
  assert.equal(parsed.searchParams.get("client_id"), "1592630249089288");
  assert.equal(parsed.searchParams.get("code"), "AQAB-safe-one-time-code_1234567890");
  assert.equal(accessToken, "EAA" + "x".repeat(80));
});

test("WhatsApp connection verifies app, permissions, phone ownership, and webhook subscription", async () => {
  const requests = [];
  const credentials = {
    appSecret: "0123456789abcdef0123456789abcdef",
    accessToken: "A".repeat(60),
    wabaId: "123456789012345",
    phoneNumberId: "987654321098765",
  };
  const identity = await validateWhatsAppConnection(
    credentials,
    "1592630249089288",
    "v26.0",
    async (url, init = {}) => {
      requests.push({ url: String(url), method: init.method || "GET" });
      if (url.pathname.endsWith("/debug_token")) {
        return Response.json({
          data: {
            app_id: "1592630249089288",
            is_valid: true,
            scopes: [
              "whatsapp_business_messaging",
              "whatsapp_business_management",
            ],
            expires_at: 1785466800,
          },
        });
      }
      if (url.pathname.endsWith("/987654321098765")) {
        return Response.json({
          id: "987654321098765",
          display_phone_number: "+880 1404-385101",
          verified_name: "StepFresh",
        });
      }
      if (url.pathname.endsWith("/phone_numbers")) {
        return Response.json({ data: [{ id: "987654321098765" }] });
      }
      if (url.pathname.endsWith("/subscribed_apps")) {
        return Response.json({ success: true });
      }
      return Response.json({ error: { code: 100 } }, { status: 400 });
    },
  );
  assert.deepEqual(identity, {
    wabaId: "123456789012345",
    phoneNumberId: "987654321098765",
    displayPhoneNumber: "+880 1404-385101",
    verifiedName: "StepFresh",
    tokenExpiresAt: "2026-07-31T03:00:00.000Z",
  });
  assert.equal(requests.length, 4);
  assert.equal(requests.at(-1).method, "POST");
  assert.ok(requests.at(-1).url.includes("/123456789012345/subscribed_apps"));
});

test("WhatsApp setup is owner-only and never returns connector secrets", () => {
  const page = readFileSync("app/owner/whatsapp/page.tsx", "utf8");
  const form = readFileSync("app/owner/whatsapp/whatsapp-connection-form.tsx", "utf8");
  const route = readFileSync("app/api/integrations/whatsapp/route.ts", "utf8");
  const schema = readFileSync("db/schema.ts", "utf8");
  const app = readFileSync("app/leadpilot-app.tsx", "utf8");

  assert.match(page, /requireChatGPTUser\("\/owner\/whatsapp"\)/);
  assert.match(route, /requireOwner/);
  assert.equal((form.match(/type="password"/g) || []).length, 1);
  assert.doesNotMatch(form, /Meta App Secret|Permanent WhatsApp access token/);
  assert.match(form, /Temporary access token/);
  assert.match(form, /Webhook verification token/);
  assert.match(route, /validateWhatsAppTestNumberInput/);
  assert.match(route, /connectionMode: "test"/);
  assert.match(form, /response_type: "code"/);
  assert.match(route, /whatsapp_business_messaging/);
  assert.doesNotMatch(route, /appSecretEncrypted|accessTokenEncrypted/);
  assert.match(schema, /whatsappIntegrations/);
  assert.match(app, /href="\/owner\/whatsapp"/);
});

test("WhatsApp webhook verifies the existing or channel-specific token", () => {
  const valid = verifyWhatsAppWebhook(
    new Request("https://example.com/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=leadpilot-secret&hub.challenge=12345"),
    { FACEBOOK_VERIFY_TOKEN: "leadpilot-secret" },
  );
  assert.equal(valid.status, 200);
  assert.equal(valid.text instanceof Function, true);

  const invalid = verifyWhatsAppWebhook(
    new Request("https://example.com/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345"),
    { WHATSAPP_VERIFY_TOKEN: "leadpilot-secret" },
  );
  assert.equal(invalid.status, 403);
});

test("WhatsApp text replies extract identity, timestamp, name, and exact message", () => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [{
      id: "123456789012345",
      changes: [{
        field: "messages",
        value: {
          metadata: {
            display_phone_number: "8801404385101",
            phone_number_id: "987654321098765",
          },
          contacts: [{
            profile: { name: "Minhaz Siraji" },
            wa_id: "8801712345678",
          }],
          messages: [{
            from: "8801712345678",
            id: "wamid.message-1",
            timestamp: "1785380400",
            type: "text",
            text: {
              body: "I want 2 bottles. Address: Savar, Nobinagar.",
            },
          }],
        },
      }],
    }],
  };
  assert.deepEqual(
    extractWhatsAppMessages(payload, "987654321098765", "123456789012345"),
    [{
      eventId: "wamid.message-1",
      waId: "8801712345678",
      phoneNumberId: "987654321098765",
      wabaId: "123456789012345",
      customerName: "Minhaz Siraji",
      text: "I want 2 bottles. Address: Savar, Nobinagar.",
      submittedAt: "2026-07-30T03:00:00.000Z",
    }],
  );
});

test("WhatsApp routing is contact-specific and distinguishes replies, revisions, and repeat orders", () => {
  assert.equal(routeWhatsAppMessage({
    hasContact: false,
    linkedSource: null,
    linkedPipelineStatus: null,
    hasExplicitOrder: true,
  }), "new_lead");
  assert.equal(routeWhatsAppMessage({
    hasContact: true,
    linkedSource: "WhatsApp",
    linkedPipelineStatus: "Order Confirmed",
    hasExplicitOrder: false,
  }), "reply");
  assert.equal(routeWhatsAppMessage({
    hasContact: true,
    linkedSource: "WhatsApp",
    linkedPipelineStatus: "Order Confirmed",
    hasExplicitOrder: true,
  }), "update_order");
  assert.equal(routeWhatsAppMessage({
    hasContact: true,
    linkedSource: "WhatsApp",
    linkedPipelineStatus: "Delivered",
    hasExplicitOrder: true,
  }), "new_order");
  assert.equal(routeWhatsAppMessage({
    hasContact: true,
    linkedSource: "WhatsApp",
    linkedPipelineStatus: "Cancelled",
    hasExplicitOrder: true,
  }), "new_order");
  assert.equal(routeWhatsAppMessage({
    hasContact: true,
    linkedSource: "WhatsApp",
    linkedPipelineStatus: "Returned",
    hasExplicitOrder: true,
  }), "new_order");
  assert.equal(routeWhatsAppMessage({
    hasContact: true,
    linkedSource: "StepFresh landing page",
    linkedPipelineStatus: "Order Confirmed",
    hasExplicitOrder: true,
  }), "new_lead");
  assert.equal(routeWhatsAppMessage({
    hasContact: true,
    linkedSource: "Messenger",
    linkedPipelineStatus: "Order Confirmed",
    hasExplicitOrder: false,
  }), "new_lead");
});

test("WhatsApp order intent excludes ordinary replies and price questions", () => {
  assert.equal(hasExplicitWhatsAppOrderIntent("I want 3 bottles"), true);
  assert.equal(hasExplicitWhatsAppOrderIntent("Ami 5 bottle order korte chai"), true);
  assert.equal(hasExplicitWhatsAppOrderIntent(
    "Name: Version 37 Test\nPhone: 01404385101\nAddress: Ulail, Savar, Dhaka\n3 bottle\nCash on delivery.",
  ), true);
  assert.equal(hasExplicitWhatsAppOrderIntent("Thanks, I received 3 bottles"), false);
  assert.equal(hasExplicitWhatsAppOrderIntent("What is the price for 5 bottles?"), false);
});

test("active WhatsApp order revisions use only the latest verified message facts", () => {
  const services = ["1 bottle — ৳450", "2 bottles — ৳800"];
  assert.deepEqual(inferConfiguredOrder("I want 1 bottle", services), {
    quantity: 1,
    serviceRequested: "1 bottle — ৳450",
    expectedValue: 450,
  });
  assert.deepEqual(inferConfiguredOrder("I want 3 bottles", services), {
    quantity: 3,
    serviceRequested: "3 bottles — ৳1,250",
    expectedValue: 1250,
  });
  assert.deepEqual(inferConfiguredOrder("I want 5 bottles", services), {
    quantity: 5,
    serviceRequested: "5 bottles — ৳2,050",
    expectedValue: 2050,
  });
  const revised = "I want 5 bottles.\nName: Revised Customer\nPhone: 01712345678\nAddress: Savar, Dhaka.";
  assert.equal(extractCustomerName(revised), "Revised Customer");
  assert.equal(extractDeliveryLocation(revised), "Savar, Dhaka");
});

test("a real WhatsApp StepFresh order enters the same package and address extractor", () => {
  const message = "I want 2 bottles.\nPhone: 01712345678\nAddress: Savar, Nobinagar.";
  assert.deepEqual(
    inferConfiguredOrder(message, ["1 bottle — ৳450", "2 bottles — ৳800"]),
    {
      quantity: 2,
      serviceRequested: "2 bottles — ৳800",
      expectedValue: 800,
    },
  );
  assert.equal(extractDeliveryLocation(message), "Savar, Nobinagar");
});

test("approved WhatsApp replies use the Cloud API text-message contract", () => {
  const request = buildWhatsAppSendRequest({
    phoneNumberId: "987654321098765",
    waId: "8801712345678",
    message: "Thanks — your StepFresh order is confirmed.",
    accessToken: "access-token",
    graphVersion: "v26.0",
  });
  assert.equal(
    request.url.origin + request.url.pathname,
    "https://graph.facebook.com/v26.0/987654321098765/messages",
  );
  assert.equal(request.headers.authorization, "Bearer access-token");
  assert.deepEqual(JSON.parse(request.body), {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: "8801712345678",
    type: "text",
    text: {
      preview_url: false,
      body: "Thanks — your StepFresh order is confirmed.",
    },
  });
});

test("WhatsApp is wired into the shared lead, approval, deletion, and live-reply flow", () => {
  const worker = readFileSync("worker/index.ts", "utf8");
  const webhook = readFileSync("lib/whatsapp-webhook.ts", "utf8");
  const schema = readFileSync("db/schema.ts", "utf8");
  const approval = readFileSync("app/api/leads/[id]/approve/route.ts", "utf8");
  const delivery = readFileSync("lib/reply-delivery.ts", "utf8");
  const data = readFileSync("lib/data.ts", "utf8");
  const app = readFileSync("app/leadpilot-app.tsx", "utf8");
  const connection = readFileSync("app/owner/whatsapp/whatsapp-connection-form.tsx", "utf8");
  const connectionRoute = readFileSync("app/api/integrations/whatsapp/route.ts", "utf8");

  assert.match(worker, /\/api\/webhooks\/whatsapp/);
  assert.match(webhook, /ctx\.waitUntil/);
  assert.match(webhook, /x-hub-signature-256/i);
  assert.match(webhook, /whatsappWebhookEvents/);
  assert.match(webhook, /onConflictDoNothing/);
  assert.match(webhook, /recordCustomerReply/);
  assert.match(webhook, /routeWhatsAppMessage/);
  assert.match(webhook, /hasExplicitWhatsAppOrderIntent/);
  assert.match(webhook, /source: leads\.source/);
  assert.match(webhook, /linkedSource: linkedLead\?\.source/);
  assert.match(webhook, /skipDuplicateCheck: true/);
  assert.doesNotMatch(webhook, /eq\(leads\.phone/);
  assert.doesNotMatch(webhook, /phoneMatches/);
  assert.match(webhook, /allowRepeatCustomerOrder: true/);
  assert.match(webhook, /target: \[whatsappContacts\.waId, whatsappContacts\.phoneNumberId\]/);
  assert.match(schema, /primaryKey\(\{ columns: \[table\.waId, table\.phoneNumberId\] \}\)/);
  assert.match(data, /whatsapp_order_revised/);
  assert.match(data, /skipDuplicateCheck/);
  assert.match(data, /input\.allowRepeatCustomerOrder/);
  assert.match(delivery, /leadSource === "WhatsApp"/);
  assert.match(delivery, /hasWhatsAppContact\(leadId\)/);
  assert.match(approval, /WHATSAPP_REPLY_WINDOW_CLOSED/);
  assert.match(approval, /WHATSAPP_ACCESS_TOKEN_EXPIRED/);
  assert.match(app, /Approve & send WhatsApp/);
  assert.match(data, /DELETE FROM whatsapp_contacts WHERE lead_id/);
  assert.match(data, /DELETE FROM whatsapp_webhook_events WHERE lead_id/);
  assert.match(app, /result\.delivery === "whatsapp"/);
  assert.match(data, /replyChannel: whatsappContactRows\.some/);
  assert.match(app, /New Messenger or WhatsApp replies/);
  assert.match(connection, /whatsapp_business_app_onboarding/);
  assert.match(connection, /Meta test number/);
  assert.match(connection, /name="accessToken"/);
  assert.match(connection, /name="verifyToken"/);
  assert.match(connection, /response_type: "code"/);
  assert.match(connection, /override_default_response_type: true/);
  assert.match(connection, /setup: \{\}/);
  assert.doesNotMatch(connection, /name="appSecret"/);
  assert.match(connectionRoute, /exchangeWhatsAppEmbeddedSignupCode/);
  assert.match(connectionRoute, /validateWhatsAppTestNumberInput/);
  assert.match(connectionRoute, /resolveMetaAppSecret/);
});
