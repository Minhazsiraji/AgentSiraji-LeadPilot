import assert from "node:assert/strict";
import test from "node:test";
import { buildLeadPilotAnalytics } from "../lib/analytics.ts";

const now = "2026-07-30T12:00:00.000Z";

function lead(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    customerName: "StepFresh customer",
    phone: "+8801700000000",
    email: null,
    serviceRequested: "2 bottles — ৳800",
    source: "Facebook Messenger",
    temperature: "Hot",
    pipelineStatus: "New",
    expectedValue: 800,
    possibleSpam: false,
    doNotContact: false,
    createdAt: "2026-07-28T10:00:00.000Z",
    updatedAt: "2026-07-28T10:00:00.000Z",
    ...overrides,
  };
}

test("analytics separates generated sales value from active pipeline and cancelled value", () => {
  const result = buildLeadPilotAnalytics([
    lead({ pipelineStatus: "Delivered", expectedValue: 800 }),
    lead({ pipelineStatus: "Shipped", expectedValue: 450 }),
    lead({ pipelineStatus: "Cancelled", expectedValue: 800 }),
    lead({ pipelineStatus: "New", expectedValue: 450 }),
  ], [], now);

  assert.equal(result.summary.generatedValue, 800);
  assert.equal(result.summary.grossSalesValue, 800);
  assert.equal(result.summary.returnedValue, 0);
  assert.equal(result.summary.netSalesValue, 800);
  assert.equal(result.summary.returnRate, 0);
  assert.equal(result.summary.pipelineValue, 900);
  assert.equal(result.summary.activeOrderValue, 450);
  assert.equal(result.summary.cancelledValue, 800);
  assert.equal(result.summary.confirmedOrders, 0);
  assert.equal(result.summary.shippedOrders, 1);
  assert.equal(result.summary.deliveredOrders, 1);
  assert.equal(result.summary.deliveryRate, 50);
  assert.equal(result.summary.cancelledOrders, 1);
});

test("analytics reconciles gross sales, returned value, net sales, and return rate", () => {
  const result = buildLeadPilotAnalytics([
    lead({ pipelineStatus: "Delivered", expectedValue: 2850 }),
    lead({ pipelineStatus: "Delivered", expectedValue: 800 }),
    lead({ pipelineStatus: "Returned", expectedValue: 450 }),
  ], [], now);

  assert.equal(result.summary.grossSalesValue, 4100);
  assert.equal(result.summary.returnedValue, 450);
  assert.equal(result.summary.netSalesValue, 3650);
  assert.equal(result.summary.generatedValue, 3650);
  assert.equal(result.summary.returnedOrders, 1);
  assert.equal(result.summary.returnRate.toFixed(1), "33.3");
  assert.equal(result.summary.averageOrderValue, 1825);
});

test("analytics counts conversions deterministically and excludes spam from the denominator", () => {
  const result = buildLeadPilotAnalytics([
    lead({ pipelineStatus: "Order Confirmed" }),
    lead({ pipelineStatus: "Delivered" }),
    lead({ pipelineStatus: "New" }),
    lead({ pipelineStatus: "New", possibleSpam: true }),
  ], [], now);

  assert.equal(result.summary.totalCaptured, 4);
  assert.equal(result.summary.legitimateLeads, 3);
  assert.equal(result.summary.convertedOrders, 2);
  assert.equal(result.summary.conversionRate.toFixed(1), "66.7");
});

test("delivered customers become reorder opportunities after the StepFresh cycle", () => {
  const delivered = lead({
    id: "delivered-customer",
    customerName: "Repeat Customer",
    pipelineStatus: "Delivered",
    updatedAt: "2026-06-20T10:00:00.000Z",
  });
  const result = buildLeadPilotAnalytics([delivered], [], now, 30);

  assert.equal(result.summary.reorderDue, 1);
  assert.equal(result.reorderOpportunities[0].leadId, "delivered-customer");
  assert.equal(result.reorderOpportunities[0].customerName, "Repeat Customer");
  assert.ok(result.reorderOpportunities[0].daysOverdue >= 9);
  assert.equal(result.reorderOpportunities[0].daysUntil, 0);
});

test("delivered customers appear in the repeat-order schedule before they are due", () => {
  const delivered = lead({
    id: "recent-delivery",
    pipelineStatus: "Delivered",
    updatedAt: "2026-07-29T10:00:00.000Z",
  });
  const result = buildLeadPilotAnalytics([delivered], [], now, 30);

  assert.equal(result.summary.reorderDue, 0);
  assert.equal(result.reorderOpportunities.length, 1);
  assert.equal(result.reorderOpportunities[0].leadId, "recent-delivery");
  assert.equal(result.reorderOpportunities[0].daysUntil, 29);
});

test("source performance reports conversion and delivered value", () => {
  const result = buildLeadPilotAnalytics([
    lead({ source: "Facebook Messenger", pipelineStatus: "Delivered", expectedValue: 800 }),
    lead({ source: "Facebook Messenger", pipelineStatus: "New", expectedValue: 450 }),
    lead({ source: "Website", pipelineStatus: "Order Confirmed", expectedValue: 450 }),
  ], [], now);

  const messenger = result.sources.find((item) => item.source === "Facebook Messenger");
  assert.equal(messenger.leads, 2);
  assert.equal(messenger.converted, 1);
  assert.equal(messenger.delivered, 1);
  assert.equal(messenger.returned, 0);
  assert.equal(messenger.returnRate, 0);
  assert.equal(messenger.grossSalesValue, 800);
  assert.equal(messenger.returnedValue, 0);
  assert.equal(messenger.netSalesValue, 800);
  assert.equal(messenger.conversionRate, 50);
  assert.equal(messenger.value, 800);
});

test("source performance reconciles returns without inflating net sales", () => {
  const result = buildLeadPilotAnalytics([
    lead({ source: "Facebook Messenger", pipelineStatus: "Delivered", expectedValue: 800 }),
    lead({ source: "Facebook Messenger", pipelineStatus: "Returned", expectedValue: 450 }),
  ], [], now);

  const messenger = result.sources.find((item) => item.source === "Facebook Messenger");
  assert.equal(messenger.grossSalesValue, 1250);
  assert.equal(messenger.returnedValue, 450);
  assert.equal(messenger.netSalesValue, 800);
  assert.equal(messenger.returned, 1);
  assert.equal(messenger.returnRate, 50);
});
