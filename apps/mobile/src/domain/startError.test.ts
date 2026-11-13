import assert from "node:assert/strict";
import { test } from "node:test";

import { startErrorKind } from "./startError.ts";

test("only a real network failure blames the internet", () => {
  assert.equal(startErrorKind({ code: "anonymous_provider_disabled", status: 422, message: "Anonymous sign-ins are disabled" }), "closed");
  assert.equal(startErrorKind({ message: "Signups not allowed for this instance" }), "closed");
  assert.equal(startErrorKind({ status: 429, message: "Request rate limit reached" }), "busy");
  assert.equal(startErrorKind(new TypeError("Network request failed")), "offline");
  assert.equal(startErrorKind({ name: "AuthRetryableFetchError", message: "" }), "offline");
  assert.equal(startErrorKind(new Error("Supabase is not configured")), "other");
  assert.equal(startErrorKind(undefined), "other");
});
