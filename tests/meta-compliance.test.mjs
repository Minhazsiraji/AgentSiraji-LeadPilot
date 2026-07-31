import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Meta review support exposes public privacy and data deletion guidance", () => {
  const privacy = readFileSync("app/privacy/page.tsx", "utf8");
  const deletion = readFileSync("app/data-deletion/page.tsx", "utf8");
  const reviewPackage = readFileSync("docs/meta-app-review.md", "utf8");

  assert.match(privacy, /Privacy notice/i);
  assert.match(privacy, /delete my data/i);
  assert.match(deletion, /Data deletion instructions/i);
  assert.match(deletion, /delete my data/i);
  assert.match(deletion, /seven\s+business\s+days/i);
  assert.match(deletion, /\/privacy/);
  assert.match(reviewPackage, /pages_messaging/);
  assert.match(reviewPackage, /human-in-the-loop/i);
  assert.match(reviewPackage, /reviewer-access/i);
});
