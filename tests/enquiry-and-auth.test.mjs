import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("public enquiry form keeps a stable form reference across submission", () => {
  const source = readFileSync("app/enquire/public-enquiry-form.tsx", "utf8");
  assert.match(source, /const formElement = event\.currentTarget/);
  assert.match(source, /formElement\.reset\(\)/);
  assert.doesNotMatch(source, /event\.currentTarget\.reset\(\)/);
});

test("public order form requires structured delivery and anti-fake-order fields", () => {
  const form = readFileSync("app/enquire/public-enquiry-form.tsx", "utf8");
  const route = readFileSync("app/api/public/leads/route.ts", "utf8");
  for (const field of ["phone", "quantity", "district", "thana", "address", "codConfirmed", "detailsConfirmed"]) {
    assert.match(form, new RegExp(`name="${field}"`));
  }
  assert.match(form, /pattern="[^"]*880[^"]*1\[3-9\]\[0-9\]\{8\}"/);
  assert.match(route, /validatePublicOrder\(payload\)/);
  assert.match(route, /publicOrderMessage\(order\)/);
  assert.match(route, /location: `\$\{order\.thana\}, \$\{order\.district\}`/);
  assert.doesNotMatch(route, /payload\.message/);
});

test("public order validation is enforced on the server", () => {
  const source = readFileSync("lib/public-order.ts", "utf8");
  assert.match(source, /quantity < 1 \|\| quantity > 20/);
  assert.match(source, /valid Bangladesh mobile number/);
  assert.match(source, /Choose a valid district/);
  assert.match(source, /getThanasForDistrict\(district\)/);
  assert.match(source, /valid thana or upazila for the selected district/);
  assert.match(source, /complete delivery address/);
  assert.match(source, /cash on delivery/);
  assert.match(source, /phone number and delivery details are correct/);
});

test("thana selection depends on the chosen district", () => {
  const form = readFileSync("app/enquire/public-enquiry-form.tsx", "utf8");
  const locations = JSON.parse(readFileSync("lib/bangladesh-thanas.json", "utf8"));
  assert.equal(Object.keys(locations).length, 64);
  assert.ok(locations.Dhaka.includes("Savar"));
  assert.ok(locations.Chattogram.includes("Pahartali"));
  assert.match(form, /getThanasForDistrict\(district\)/);
  assert.match(form, /disabled=\{!district\}/);
  assert.match(form, /setThana\(""\)/);
  assert.doesNotMatch(form, /name="thana"[^>]*<input/);
});

test("owner sign-in uses a protected owner route", () => {
  const ownerPage = readFileSync("app/owner/page.tsx", "utf8");
  const appSource = readFileSync("app/leadpilot-app.tsx", "utf8");
  assert.match(ownerPage, /requireChatGPTUser\("\/owner"\)/);
  assert.match(appSource, /href="\/owner"/);
});

test("owner dashboard exposes a controlled order workflow", async () => {
  const { isValidOrderTransition, nextOrderStatuses } = await import("../lib/order-workflow.ts");
  assert.deepEqual(nextOrderStatuses("New"), ["Order Confirmed", "Cancelled"]);
  assert.equal(isValidOrderTransition("New", "Delivered"), false);
  assert.equal(isValidOrderTransition("Order Confirmed", "Shipped"), true);
  assert.equal(isValidOrderTransition("Shipped", "Delivered"), true);
  assert.equal(isValidOrderTransition("Delivered", "New"), false);

  const app = readFileSync("app/leadpilot-app.tsx", "utf8");
  const data = readFileSync("lib/data.ts", "utf8");
  const route = readFileSync("app/api/leads/[id]/route.ts", "utf8");
  assert.match(app, /Order workflow/);
  assert.match(app, /nextOrderStatuses/);
  assert.match(data, /isValidOrderTransition/);
  assert.match(route, /status: 409/);
});

test("verified public orders create persistent owner notifications", () => {
  const data = readFileSync("lib/data.ts", "utf8");
  const schema = readFileSync("db/schema.ts", "utf8");
  const app = readFileSync("app/leadpilot-app.tsx", "utf8");
  const route = readFileSync("app/api/notifications/read/route.ts", "utf8");
  assert.match(schema, /ownerNotifications/);
  assert.match(data, /cleanInput\.source === "Facebook order form"/);
  assert.match(data, /New verified order from/);
  assert.match(data, /markOwnerNotificationsRead/);
  assert.match(app, /Order notifications/);
  assert.match(app, /unreadNotifications/);
  assert.match(route, /requireOwner/);
});

test("confirming an order prepares a verified customer confirmation message", async () => {
  const { buildOrderConfirmationMessage, whatsappMessageUrl } = await import("../lib/order-confirmation.ts");
  const message = buildOrderConfirmationMessage({
    businessName: "StepFresh",
    currency: "BDT",
    customerName: "Atiar",
    expectedValue: 800,
    location: "Savar, Dhaka",
    originalMessage: "I want 2 bottles. District: Dhaka. Thana/Upazila: Savar. Delivery address: House 12, Road 3, Savar. Payment: Cash on delivery.",
    phone: "+8801404385101",
    serviceRequested: "2 bottles — ৳800",
  });
  assert.match(message, /Atiar/);
  assert.match(message, /2 bottles/);
  assert.match(message, /৳800/);
  assert.match(message, /Savar, Dhaka/);
  assert.match(message, /House 12, Road 3, Savar/);
  assert.match(message, /ক্যাশ অন ডেলিভারি/);
  assert.doesNotMatch(message, /delivery date|guaranteed/i);
  assert.match(whatsappMessageUrl("+8801404385101", message), /^https:\/\/wa\.me\/8801404385101\?text=/);

  const data = readFileSync("lib/data.ts", "utf8");
  const app = readFileSync("app/leadpilot-app.tsx", "utf8");
  assert.match(data, /ensureOrderStatusDraft/);
  assert.match(data, /order_confirmation_drafted/);
  assert.match(data, /repairMissingOrderMessages/);
  assert.match(app, /Open WhatsApp/);
  assert.match(app, /Mark as sent/);
});

test("order status changes prepare safe WhatsApp and SMS customer messages", async () => {
  const {
    buildCustomerOrderStatusMessage,
    customerOrderDraftType,
    customerOrderMessageTitle,
    isCustomerOrderDraft,
  } = await import("../lib/order-confirmation.ts");
  const input = {
    businessName: "StepFresh",
    currency: "BDT",
    customerName: "Atiar",
    expectedValue: 800,
    location: "Savar, Dhaka",
    originalMessage: "I want 2 bottles. District: Dhaka. Thana/Upazila: Savar. Delivery address: House 12, Road 3, Savar. Payment: Cash on delivery.",
    phone: "+8801404385101",
    serviceRequested: "2 bottles — ৳800",
  };

  const shipped = buildCustomerOrderStatusMessage(input, "Shipped");
  const delivered = buildCustomerOrderStatusMessage(input, "Delivered");
  const cancelled = buildCustomerOrderStatusMessage(input, "Cancelled");
  for (const message of [shipped, delivered, cancelled]) {
    assert.match(message, /Atiar/);
    assert.match(message, /2 bottles/);
    assert.match(message, /৳800/);
    assert.match(message, /Savar, Dhaka/);
    assert.doesNotMatch(message, /tracking|delivery date|guaranteed/i);
  }
  assert.match(shipped, /কুরিয়ারে দেওয়া হয়েছে/);
  assert.match(delivered, /ডেলিভারি সম্পন্ন হয়েছে/);
  assert.match(cancelled, /বাতিল করা হয়েছে/);
  assert.equal(customerOrderDraftType("Shipped"), "order_status_shipped");
  assert.equal(customerOrderMessageTitle("order_status_delivered"), "Delivery confirmation");
  assert.equal(isCustomerOrderDraft("order_status_cancelled"), true);

  const data = readFileSync("lib/data.ts", "utf8");
  const app = readFileSync("app/leadpilot-app.tsx", "utf8");
  assert.match(data, /ensureOrderStatusDraft/);
  assert.match(data, /repairMissingOrderMessages/);
  assert.match(data, /Customer Message Approval/);
  assert.match(data, /isCustomerOrderDraft/);
  assert.match(app, /customerOrderMessageTitle/);
  assert.match(app, /isCustomerOrderDraft/);
});
