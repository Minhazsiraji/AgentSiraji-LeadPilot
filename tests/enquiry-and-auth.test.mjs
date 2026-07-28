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
  assert.doesNotMatch(route, /payload\.message/);
});

test("public order validation is enforced on the server", () => {
  const source = readFileSync("lib/public-order.ts", "utf8");
  assert.match(source, /quantity < 1 \|\| quantity > 20/);
  assert.match(source, /valid Bangladesh mobile number/);
  assert.match(source, /Choose a valid district/);
  assert.match(source, /complete delivery address/);
  assert.match(source, /cash on delivery/);
  assert.match(source, /phone number and delivery details are correct/);
});

test("owner sign-in uses a protected owner route", () => {
  const ownerPage = readFileSync("app/owner/page.tsx", "utf8");
  const appSource = readFileSync("app/leadpilot-app.tsx", "utf8");
  assert.match(ownerPage, /requireChatGPTUser\("\/owner"\)/);
  assert.match(appSource, /href="\/owner"/);
});
