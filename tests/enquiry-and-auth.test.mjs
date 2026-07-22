import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("public enquiry form keeps a stable form reference across submission", () => {
  const source = readFileSync("app/enquire/public-enquiry-form.tsx", "utf8");
  assert.match(source, /const formElement = event\.currentTarget/);
  assert.match(source, /formElement\.reset\(\)/);
  assert.doesNotMatch(source, /event\.currentTarget\.reset\(\)/);
});

test("owner sign-in uses a protected owner route", () => {
  const ownerPage = readFileSync("app/owner/page.tsx", "utf8");
  const appSource = readFileSync("app/leadpilot-app.tsx", "utf8");
  assert.match(ownerPage, /requireChatGPTUser\("\/owner"\)/);
  assert.match(appSource, /href="\/owner"/);
});
