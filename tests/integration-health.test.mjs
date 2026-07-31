import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("integration health returns configuration flags rather than secret values", () => {
  const source = readFileSync("lib/integration-health.ts", "utf8");
  assert.match(source, /verifyToken: present\(env\.FACEBOOK_VERIFY_TOKEN\)/);
  assert.match(source, /accessToken: present\(env\.WHATSAPP_ACCESS_TOKEN\)/);
  assert.match(source, /ingestKey: present\(env\.WEBSITE_INGEST_KEY\)/);
  assert.match(source, /secretsReturned: false/);
  assert.doesNotMatch(source, /FACEBOOK_PAGE_ACCESS_TOKEN\s*[,}]/);
  assert.doesNotMatch(source, /WHATSAPP_ACCESS_TOKEN\s*[,}]/);
  assert.doesNotMatch(source, /WEBSITE_INGEST_KEY\s*[,}]/);
});

test("AI health keeps the deterministic fallback available", () => {
  const source = readFileSync("lib/integration-health.ts", "utf8");
  assert.match(source, /return "rules"/);
  assert.match(source, /rulesFallback: true/);
  assert.match(source, /No test prompt is sent to an AI provider/);
});

test("overall health treats database failure as unavailable", () => {
  const source = readFileSync("lib/integration-health.ts", "utf8");
  assert.match(source, /database\.state === "unavailable"/);
  assert.match(source, /return "unavailable"/);
  assert.match(source, /needs_configuration/);
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
