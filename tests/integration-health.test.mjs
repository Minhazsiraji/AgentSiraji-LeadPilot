import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  configurationFlags,
  overallIntegrationState,
  selectedAiProvider,
} from "../lib/integration-health.ts";

test("integration health exposes configuration presence without secret values", () => {
  const env = {
    DB: {},
    FACEBOOK_VERIFY_TOKEN: "verify-secret",
    FACEBOOK_APP_SECRET: "app-secret",
    FACEBOOK_PAGE_ACCESS_TOKEN: "page-token",
    FACEBOOK_PAGE_ID: "page-id",
    WEBSITE_INGEST_KEY: "website-secret",
    WEBSITE_ALLOWED_ORIGINS: "https://client.example",
    WHATSAPP_VERIFY_TOKEN: "wa-verify",
    WHATSAPP_ACCESS_TOKEN: "wa-token",
    WHATSAPP_PHONE_NUMBER_ID: "phone-id",
    GEMINI_API_KEY: "gemini-secret",
    AI_PROVIDER: "gemini",
  };
  const flags = configurationFlags(env);
  assert.deepEqual(flags.facebook, {
    verifyToken: true,
    appSecret: true,
    pageAccessToken: true,
    pageId: true,
  });
  assert.equal(flags.website.ingestKey, true);
  assert.equal(flags.whatsapp.accessToken, true);
  assert.equal(flags.ai.provider, "gemini");
  assert.doesNotMatch(JSON.stringify(flags), /verify-secret|app-secret|page-token|website-secret|wa-token|gemini-secret/);
});

test("AI health always keeps the deterministic fallback available", () => {
  assert.equal(selectedAiProvider({ DB: {} }), "rules");
  assert.equal(selectedAiProvider({ DB: {}, AI_PROVIDER: "gemini", GEMINI_API_KEY: "key" }), "gemini");
  assert.equal(selectedAiProvider({ DB: {}, AI_PROVIDER: "openai", OPENAI_API_KEY: "key" }), "openai");
  assert.equal(selectedAiProvider({ DB: {}, AI_PROVIDER: "gemini" }), "rules");
});

test("overall health treats database failure as unavailable and optional setup as incomplete", () => {
  assert.equal(overallIntegrationState([
    { id: "database", label: "D1", state: "unavailable", summary: "down" },
    { id: "ai", label: "AI", state: "ready", summary: "rules" },
  ]), "unavailable");
  assert.equal(overallIntegrationState([
    { id: "database", label: "D1", state: "ready", summary: "up" },
    { id: "website-api", label: "Website", state: "needs_configuration", summary: "missing" },
  ]), "needs_configuration");
  assert.equal(overallIntegrationState([
    { id: "database", label: "D1", state: "ready", summary: "up" },
    { id: "ai", label: "AI", state: "ready", summary: "rules" },
  ]), "ready");
});

test("integration health and smoke-test APIs require the workspace owner", () => {
  const healthRoute = readFileSync("app/api/integrations/health/route.ts", "utf8");
  const smokeRoute = readFileSync("app/api/integrations/smoke-test/route.ts", "utf8");
  for (const route of [healthRoute, smokeRoute]) {
    assert.match(route, /requireOwner\(request\)/);
    assert.match(route, /cache-control/);
  }
  assert.match(smokeRoute, /runSafeSmokeTest/);
});

test("owner setup center provides safe automated and manual deployment checks", () => {
  const page = readFileSync("app/integrations/page.tsx", "utf8");
  const panel = readFileSync("app/integrations/integration-health-panel.tsx", "utf8");
  const owner = readFileSync("app/owner/page.tsx", "utf8");
  const docs = readFileSync("docs/deployment-smoke-test.md", "utf8");

  assert.match(page, /requireChatGPTUser\("\/integrations"\)/);
  assert.match(panel, /Run safe smoke test/);
  assert.match(panel, /No secrets returned/);
  assert.match(panel, /No customer records created/);
  assert.match(panel, /No Messenger or WhatsApp messages sent/);
  assert.match(owner, /href="\/integrations"/);
  assert.match(docs, /Messenger repeat order/);
  assert.match(docs, /StepFresh order form/);
  assert.match(docs, /Reusable client form/);
  assert.match(docs, /WhatsApp/);
});
