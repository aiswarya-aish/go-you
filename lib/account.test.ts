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

test("a typed name is sealed per email and opens only with that email; call signs stay plain", async () => {
  const sealed = a.sealName("anna@example.com", "Anna");
  assert.match(sealed, /^v1\./);
  assert.ok(!sealed.includes("Anna"));
  assert.notEqual(sealed, a.sealName("anna@example.com", "Anna")); // fresh IV every time
  assert.equal(a.openName(" ANNA@example.com", sealed), "Anna");
  assert.equal(a.openName("bob@example.com", sealed), null);
  assert.equal(a.sealName("anna@example.com", "GRANITE"), "GRANITE");
  assert.equal(a.openName("anna@example.com", "GRANITE"), "GRANITE");
  assert.equal(a.openName("anna@example.com", null), null);
  const n = await import("./name.ts");
  assert.equal(n.nameProblem(n.cleanName("  Zoë   O'Neil ")), null);
  assert.ok(n.nameProblem("Thirteen chars"));
  assert.ok(n.nameProblem("<script>"));
  assert.notEqual(n.pickCallSign("GRANITE"), "GRANITE");
});
