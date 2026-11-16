import { test } from "node:test";
import assert from "node:assert/strict";
process.env.EMAIL_HASH_SECRET = "test-secret";
const a = await import("./account.ts");

test("emails hash the same however they are typed, and never contain the email", () => {
  assert.equal(a.hashEmail(" Anna@Example.com "), a.hashEmail("anna@example.com"));
  assert.notEqual(a.hashEmail("anna@example.com"), a.hashEmail("ana@example.com"));
  assert.ok(!a.hashEmail("anna@example.com").includes("anna"));
  assert.ok(a.isEmail("anna@example.com") && !a.isEmail("anna@") && !a.isEmail("anna example.com"));
});

test("codes are 6 digits and bound to the email", () => {
  for (let i = 0; i < 50; i++) assert.match(a.newCode(), /^\d{6}$/);
  const e = a.hashEmail("anna@example.com");
  assert.equal(a.hashCode(e, "123456"), a.hashCode(e, "123456"));
  assert.notEqual(a.hashCode(e, "123456"), a.hashCode(a.hashEmail("bob@example.com"), "123456"));
});

test("password rule: length and common passwords only", () => {
  assert.match(a.passwordProblem("short") ?? "", /at least 8/);
  assert.match(a.passwordProblem("x".repeat(65)) ?? "", /at most 64/);
  assert.match(a.passwordProblem("Password123") ?? "", /too common/);
  assert.equal(a.passwordProblem("squat day forever"), null);
  assert.equal(a.passwordProblem("abcdefgh"), null); // no forced symbols or digits
});

test("client ip: Vercel header first, then the first forwarded hop", () => {
  const h = (o: Record<string, string>) => (n: string) => o[n];
  assert.equal(a.clientIp(h({ "x-real-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" })), "1.1.1.1");
  assert.equal(a.clientIp(h({ "x-forwarded-for": "2.2.2.2, 3.3.3.3" })), "2.2.2.2");
  assert.equal(a.clientIp(h({})), "local");
});
