import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  allowedWebsiteOrigin,
  validateWebsiteLead,
  verifyWebsiteIngestKey,
  websiteLeadMessage,
  websiteLeadSource,
} from "../lib/website-lead.ts";

test("generic website leads accept common form field aliases", () => {
  const result = validateWebsiteLead({
    fullName: "Nadia Rahman",
    emailAddress: "NADIA@example.com",
    product: "Supplier research",
    city: "Dhaka",
    budget: "BDT 25000",
    comments: "Please contact me about a sourcing project.",
    formName: "Client portfolio website",
    page_url: "https://example.com/contact",
  });
  assert.equal(result.ok, true);
  assert.equal(result.ignored, false);
  assert.equal(result.lead.customerName, "Nadia Rahman");
  assert.equal(result.lead.email, "nadia@example.com");
  assert.equal(result.lead.expectedValue, 25000);
  assert.equal(result.lead.sourceName, "Client portfolio website");
  assert.match(websiteLeadMessage(result.lead), /Supplier research/);
  assert.equal(websiteLeadSource(result.lead.sourceName), "Website · Client portfolio website");
});

test("generic website leads require contact details and useful intent", () => {
  assert.deepEqual(
    validateWebsiteLead({ customerName: "A", message: "Hi" }),
    { ok: false, error: "Enter the customer's name." },
  );
  assert.deepEqual(
    validateWebsiteLead({ customerName: "Ayesha", message: "I need a quote" }),
    { ok: false, error: "Enter an email address or phone number." },
  );
});

test("website lead honeypots are accepted without creating a real lead", () => {
  assert.deepEqual(
    validateWebsiteLead({ customerName: "Bot", email: "bot@example.com", message: "spam", companyWebsite: "casino.example" }),
    { ok: true, ignored: true },
  );
});

test("website integration keys use exact comparison and origins are allowlisted", () => {
  assert.equal(verifyWebsiteIngestKey("secret-123", "secret-123"), true);
  assert.equal(verifyWebsiteIngestKey("secret-124", "secret-123"), false);
  assert.equal(verifyWebsiteIngestKey("", "secret-123"), false);
  assert.equal(allowedWebsiteOrigin("https://client.example", "https://client.example,https://shop.example"), true);
  assert.equal(allowedWebsiteOrigin("https://evil.example", "https://client.example"), false);
  assert.equal(allowedWebsiteOrigin(null, "https://client.example"), true);
});

test("StepFresh and reusable website connector routes remain wired", () => {
  const stepfreshRoute = readFileSync("app/api/public/leads/route.ts", "utf8");
  const publicWebsiteRoute = readFileSync("app/api/public/website-leads/route.ts", "utf8");
  const secureWebsiteRoute = readFileSync("app/api/integrations/website-leads/route.ts", "utf8");
  const genericForm = readFileSync("app/lead-form/generic-website-lead-form.tsx", "utf8");
  const runtimeEnv = readFileSync("lib/runtime-env.ts", "utf8");

  assert.match(stepfreshRoute, /StepFresh landing page/);
  assert.match(stepfreshRoute, /notifyWebsiteLead/);
  assert.match(publicWebsiteRoute, /websiteLeadSource/);
  assert.match(publicWebsiteRoute, /notifyWebsiteLead/);
  assert.match(secureWebsiteRoute, /WEBSITE_INGEST_KEY/);
  assert.match(secureWebsiteRoute, /WEBSITE_ALLOWED_ORIGINS/);
  assert.match(secureWebsiteRoute, /authorization/);
  assert.match(genericForm, /api\/public\/website-leads/);
  assert.match(runtimeEnv, /WEBSITE_INGEST_KEY/);
});
