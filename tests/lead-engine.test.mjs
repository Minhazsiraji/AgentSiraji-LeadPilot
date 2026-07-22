import assert from "node:assert/strict";
import test from "node:test";
import { analyzeLead, draftFirstReply, draftFollowUpReply, normalizeMessage, temperatureFor } from "../lib/lead-engine.ts";
import { parseLeadCsv } from "../lib/csv.ts";

const business = {
  name: "BrightHome Cleaning",
  description: "Home cleaning",
  timezone: "Europe/London",
  currency: "GBP",
  services: ["Deep cleaning", "Regular cleaning", "End-of-tenancy cleaning", "Office cleaning"],
  excludedServices: ["Appliance repair", "Pest control"],
  serviceAreas: ["London", "Camden", "Hackney"],
  businessHours: "Monday–Friday",
  responseTone: "Warm and professional",
  qualificationFields: ["service", "location", "preferred_date", "budget_or_scope", "contact_information"],
  followUpDays: [1, 3, 7],
  prohibitedClaims: ["Do not invent prices."],
};

function analyse(message, overrides = {}) {
  return analyzeLead({
    customerName: "Emma Collins",
    email: "emma@example.com",
    phone: null,
    message,
    source: "Website",
    submittedAt: "2026-07-22T10:00:00.000Z",
    ...overrides,
  }, business);
}

test("clear high-intent enquiry becomes a transparent Hot lead", () => {
  const result = analyse("I need deep cleaning for a three-bedroom apartment next Saturday. Please send the price.");
  assert.equal(result.serviceRequested, "Deep cleaning");
  assert.equal(result.purchaseIntent, "high");
  assert.equal(result.temperature, "Hot");
  assert.ok(result.score.total >= 70);
  assert.deepEqual(result.missingInformation, ["service location"]);
});

test("vague enquiry never invents a service", () => {
  const result = analyse("Can you tell me more?");
  assert.equal(result.serviceRequested, null);
  assert.equal(result.confidence, "low");
  assert.ok(result.missingInformation.includes("service requested"));
  const draft = draftFirstReply({ customerName: "Emma", email: "e@example.com", phone: null, message: "Can you tell me more?", source: "Website", submittedAt: "2026-07-22T10:00:00.000Z" }, result, business);
  assert.match(draft.message, /Which cleaning service/i);
});

test("unsupported appliance repair is flagged for human review", () => {
  const result = analyse("Can you repair my washing machine?");
  assert.equal(result.serviceFit, "unsupported");
  assert.equal(result.requiresHumanReview, true);
  const draft = draftFirstReply({ customerName: "Emma", email: "e@example.com", phone: null, message: "Can you repair my washing machine?", source: "Website", submittedAt: "2026-07-22T10:00:00.000Z" }, result, business);
  assert.doesNotMatch(draft.message, /we can repair/i);
});

test("relative date is resolved from the submission date and original text is preserved", () => {
  const result = analyse("I need deep cleaning in London next Friday.");
  assert.equal(result.preferredDate, "2026-07-31");
  assert.equal(result.preferredDateText, "next friday");
});

test("missing budget remains null rather than being assumed", () => {
  const result = analyse("I need regular cleaning in Camden every week.");
  assert.equal(result.budgetAmount, null);
  assert.equal(result.budgetCurrency, null);
});

test("duplicate normalization is stable across punctuation and whitespace", () => {
  assert.equal(normalizeMessage("Need a deep clean, please!"), normalizeMessage("  Need a deep clean please  "));
});

test("do-not-contact request stops drafting", () => {
  const result = analyse("Please stop messaging me.");
  assert.equal(result.doNotContact, true);
  assert.equal(draftFirstReply({ customerName: "Emma", email: "e@example.com", phone: null, message: "Please stop messaging me.", source: "Manual", submittedAt: "2026-07-22T10:00:00.000Z" }, result, business), null);
});

test("spam classification does not create a response", () => {
  const result = analyse("Buy my SEO package and backlinks now");
  assert.equal(result.possibleSpam, true);
  assert.equal(result.messageType, "spam");
  assert.equal(draftFirstReply({ customerName: "Spammer", email: "s@example.com", phone: null, message: "Buy my SEO package and backlinks now", source: "Website", submittedAt: "2026-07-22T10:00:00.000Z" }, result, business), null);
});

test("response draft asks no more than two questions and never invents a price", () => {
  const result = analyse("I am interested in cleaning.", { phone: null, email: null });
  const draft = draftFirstReply({ customerName: "Emma", email: null, phone: null, message: "I am interested in cleaning.", source: "Website", submittedAt: "2026-07-22T10:00:00.000Z" }, result, business);
  assert.ok((draft.message.match(/\?/g) ?? []).length <= 2);
  assert.doesNotMatch(draft.message, /£\d|\$\d|guarantee/i);
});

test("follow-up sequence stays respectful and closes politely on the final step", () => {
  const analysis = analyse("I need deep cleaning in London.");
  const first = draftFollowUpReply({ customerName: "Emma", email: "e@example.com", phone: null, message: "I need deep cleaning in London.", source: "Website", submittedAt: "2026-07-22T10:00:00.000Z" }, analysis, business, 1);
  const final = draftFollowUpReply({ customerName: "Emma", email: "e@example.com", phone: null, message: "I need deep cleaning in London.", source: "Website", submittedAt: "2026-07-22T10:00:00.000Z" }, analysis, business, 3);
  assert.doesNotMatch(first.message, /urgent|last chance|must/i);
  assert.match(final.message, /final follow-up/i);
  assert.match(final.message, /reply when the timing is right/i);
});

test("temperature thresholds are deterministic", () => {
  assert.equal(temperatureFor(70), "Hot");
  assert.equal(temperatureFor(69), "Warm");
  assert.equal(temperatureFor(40), "Warm");
  assert.equal(temperatureFor(39), "Cold");
});

test("CSV parser supports quoted commas and rejects invalid rows", () => {
  const csv = 'customer_name,email,phone,message,source\n"Emma Collins",emma@example.com,,"Deep clean, three bedrooms",Website\nBad,bad-email,,Hello,CSV';
  const result = parseLeadCsv(csv);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].message, "Deep clean, three bedrooms");
  assert.match(result.errors[0], /Row 3/);
});
