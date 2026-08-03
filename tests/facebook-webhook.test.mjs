import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  extractFacebookMessages,
  hasExplicitMessengerOrderIntent,
  shouldStartNewMessengerOrder,
  verifyFacebookSignature,
  verifyFacebookWebhook,
} from "../lib/facebook-webhook-core.ts";

test("Facebook webhook verification returns Meta's challenge only for the configured token", () => {
  const env = { FACEBOOK_VERIFY_TOKEN: "leadpilot-secret" };
  const valid = verifyFacebookWebhook(
    new Request("https://example.com/api/webhooks/facebook?hub.mode=subscribe&hub.verify_token=leadpilot-secret&hub.challenge=12345"),
    env,
  );
  assert.equal(valid.status, 200);

  const invalid = verifyFacebookWebhook(
    new Request("https://example.com/api/webhooks/facebook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345"),
    env,
  );
  assert.equal(invalid.status, 403);
});

test("Facebook webhook signatures are verified against the exact raw body", async () => {
  const body = JSON.stringify({ object: "page", entry: [] });
  const secret = "facebook-app-secret";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)),
  );
  const signature = `sha256=${Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  assert.equal(await verifyFacebookSignature(body, signature, secret), true);
  assert.equal(await verifyFacebookSignature(`${body} `, signature, secret), false);
  assert.equal(await verifyFacebookSignature(body, null, secret), false);
});

test("Messenger text events are extracted for the configured Page and echoes are ignored", () => {
  const payload = {
    object: "page",
    entry: [
      {
        id: "stepfresh-page",
        messaging: [
          {
            sender: { id: "customer-123" },
            timestamp: 1785380400000,
            message: { mid: "message-1", text: "Ami 2 bottle order korte chai" },
          },
          {
            sender: { id: "stepfresh-page" },
            timestamp: 1785380401000,
            message: { mid: "message-2", text: "Owner reply", is_echo: true },
          },
        ],
      },
      {
        id: "another-page",
        messaging: [
          {
            sender: { id: "other-customer" },
            timestamp: 1785380402000,
            message: { mid: "message-3", text: "Ignore me" },
          },
        ],
      },
    ],
  };

  assert.deepEqual(extractFacebookMessages(payload, "stepfresh-page"), [{
    eventId: "message-1",
    senderId: "customer-123",
    pageId: "stepfresh-page",
    text: "Ami 2 bottle order korte chai",
    submittedAt: "2026-07-30T03:00:00.000Z",
  }]);
});

test("a completed Messenger customer can place a new order without losing normal replies", () => {
  assert.equal(shouldStartNewMessengerOrder("Delivered", true), true);
  assert.equal(shouldStartNewMessengerOrder("Delivered", false), false);
  assert.equal(shouldStartNewMessengerOrder("Order Confirmed", true), false);
});

test("explicit repeat-order wording is detected without treating normal replies as orders", () => {
  assert.equal(hasExplicitMessengerOrderIntent(
    "I want to order 2 bottles of StepFresh. Name: Deployment Test. Address: Savar, Dhaka. Phone: 01400000000. Cash on delivery is okay.",
  ), true);
  assert.equal(hasExplicitMessengerOrderIntent("Ami 2 bottle order korte chai"), true);
  assert.equal(hasExplicitMessengerOrderIntent("Can I order 2 bottles?"), true);
  assert.equal(hasExplicitMessengerOrderIntent("Thanks, I received the 2 bottles."), false);
  assert.equal(hasExplicitMessengerOrderIntent("What is the price for 2 bottles?"), false);
});

test("Facebook integration is wired for fast acknowledgement, persistent deduplication and human review", () => {
  const worker = readFileSync("worker/index.ts", "utf8");
  const webhook = readFileSync("lib/facebook-webhook.ts", "utf8");
  const webhookCore = readFileSync("lib/facebook-webhook-core.ts", "utf8");
  const data = readFileSync("lib/data.ts", "utf8");
  const schema = readFileSync("db/schema.ts", "utf8");

  assert.match(worker, /\/api\/webhooks\/facebook/);
  assert.match(webhook, /ctx\.waitUntil/);
  assert.match(webhook, /x-hub-signature-256/i);
  assert.match(webhookCore, /crypto\.subtle\.sign/);
  assert.match(webhook, /facebookWebhookEvents/);
  assert.match(webhook, /onConflictDoNothing/);
  assert.match(webhook, /recordCustomerReply/);
  assert.match(webhook, /shouldStartNewMessengerOrder/);
  assert.match(webhook, /hasExplicitMessengerOrderIntent/);
  assert.match(webhook, /!linkedLead\[0\]/);
  assert.match(schema, /facebookContacts/);
  assert.match(schema, /facebookWebhookEvents/);
  assert.match(data, /New Messenger enquiry from/);
  assert.doesNotMatch(webhook, /sendMessage|\/messages/);
});
