import assert from "node:assert/strict";
import { test } from "node:test";

import { cleanCode, cleanEmail, emailCodeProblem, isWrongCode } from "./emailAuth.ts";

test("emails are trimmed and lower-cased; obvious non-addresses are refused", () => {
  assert.equal(cleanEmail("  Gaurav.Cook@Example.COM "), "gaurav.cook@example.com");
  for (const bad of ["", "gaurav", "gaurav@", "@example.com", "gaurav@example", "two words@example.com", "a@b.c"]) assert.equal(cleanEmail(bad), null, bad);
});

test("codes keep only digits, at most six, from typing, pasting or autofill", () => {
  assert.equal(cleanCode("123 456"), "123456");
  assert.equal(cleanCode("Your code: 987654."), "987654");
  assert.equal(cleanCode("12345678"), "123456");
  assert.equal(cleanCode("ab"), "");
});

test("send failures map to something the cook can act on", () => {
  assert.equal(emailCodeProblem({ code: "email_address_not_authorized", message: "Email address not authorized" }), "not_allowed");
  assert.equal(emailCodeProblem({ status: 429, code: "over_email_send_rate_limit" }), "rate_limited");
  assert.equal(emailCodeProblem({ message: "For security purposes, you can only request this after 42 seconds." }), "rate_limited");
  assert.equal(emailCodeProblem({ code: "email_exists" }), "taken");
  assert.equal(emailCodeProblem({ message: "A user with this email address has already been registered" }), "taken");
  assert.equal(emailCodeProblem({ code: "email_address_invalid" }), "invalid");
  assert.equal(emailCodeProblem(new TypeError("Failed to fetch")), "other");
});

test("a wrong or expired code is told apart from a network failure", () => {
  assert.equal(isWrongCode({ code: "otp_expired", message: "Token has expired or is invalid" }), true);
  assert.equal(isWrongCode({ status: 403 }), true);
  assert.equal(isWrongCode(new TypeError("Failed to fetch")), false);
});
