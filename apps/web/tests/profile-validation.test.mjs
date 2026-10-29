import assert from "node:assert/strict";
import { test } from "node:test";
import { avatarExtension, isProfileComplete, validateNames } from "../lib/profile-validation.ts";

test("onboarding requires both nonblank names", () => {
  assert.equal(isProfileComplete({ first_name: null, last_name: "Wu" }), false);
  assert.equal(isProfileComplete({ first_name: " ", last_name: "Wu" }), false);
  assert.equal(isProfileComplete({ first_name: "Yihan", last_name: "Wu" }), true);
});

test("name validation trims values and rejects missing or oversized values", () => {
  assert.deepEqual(validateNames(" Yihan ", " Wu "), { first_name: "Yihan", last_name: "Wu" });
  assert.equal(validateNames("", "Wu"), null);
  assert.equal(validateNames(new File([], "name"), "Wu"), null);
  assert.equal(validateNames("x".repeat(81), "Wu"), null);
  assert.deepEqual(validateNames("李", "吴"), { first_name: "李", last_name: "吴" });
});

test("uploads must have an allowed MIME type AND matching file signature", () => {
  assert.equal(avatarExtension("image/jpeg", new Uint8Array([255, 216, 255, 224])), "jpg");
  assert.equal(avatarExtension("image/png", new Uint8Array([137,80,78,71,13,10,26,10])), "png");
  assert.equal(avatarExtension("image/webp", new TextEncoder().encode("RIFF1234WEBP")), "webp");
  assert.equal(avatarExtension("image/jpeg", new TextEncoder().encode("<script>")), null);
  assert.equal(avatarExtension("image/svg+xml", new TextEncoder().encode("<svg>")), null);
  assert.equal(avatarExtension("image/png", new Uint8Array([])), null);
});
