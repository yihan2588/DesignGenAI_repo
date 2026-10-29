import assert from "node:assert/strict";
import { test } from "node:test";
import { requestOrigin } from "../lib/request-origin.ts";

test("callback uses the public deployment host behind a hosting proxy", () => {
  const headers = new Headers({ host: "localhost:3000", "x-forwarded-host": "food-gallery-commit.vercel.app" });
  assert.equal(requestOrigin(headers), "https://food-gallery-commit.vercel.app");
});

test("local development stays on the same browser host and port", () => {
  assert.equal(requestOrigin(new Headers({ host: "127.0.0.1:3000" })), "http://127.0.0.1:3000");
  assert.equal(requestOrigin(new Headers({ host: "localhost:3000" })), "http://localhost:3000");
  assert.throws(() => requestOrigin(new Headers()), /host is missing/);
});
