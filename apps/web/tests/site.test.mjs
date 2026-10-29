import assert from "node:assert/strict";
import { test } from "node:test";
import { legacyPageRedirect, siteOrigin } from "../lib/site.ts";
import { requestOrigin } from "../lib/request-origin.ts";
const legacy = "https://design-gen-ai-repo.vercel.app";

test("old bookmarks preserve paths and query strings on the canonical host", () => {
  const origin = requestOrigin(new Headers({host: "localhost:3000", "x-forwarded-host": "design-gen-ai-repo.vercel.app"}));
  assert.equal(legacyPageRedirect(origin, "/lab", "?from=saved&next=%2Flab", "GET").href, siteOrigin + "/lab?from=saved&next=%2Flab");
  assert.equal(legacyPageRedirect(legacy, "/", "", "HEAD").href, siteOrigin + "/");
  assert.equal(legacyPageRedirect(legacy, "//evil.test/path", "", "GET").origin, siteOrigin);
});

test("callbacks, APIs and writes keep host-bound authentication intact", () => {
  for (const path of ["/auth/callback", "/auth/callback/", "/api", "/api/gallery", "/api/cowriter/session"])
    assert.equal(legacyPageRedirect(legacy, path, "?code=example", "GET"), null);
  for (const method of ["POST", "PATCH", "DELETE"])
    assert.equal(legacyPageRedirect(legacy, "/login", "", method), null);
});

test("canonical, preview and local URLs do not redirect or loop", () => {
  for (const origin of [siteOrigin, "http://localhost:3000", "https://preview.vercel.app", legacy + ".evil.test"])
    assert.equal(legacyPageRedirect(origin, "/", "", "GET"), null);
});
