// Accounts (P3-01, DD-053): the email is only ever stored as a keyed hash; codes and IPs are hashed the same way.
// Pure apart from node:crypto, so node's test runner can run it.
import { createHmac, randomInt } from "node:crypto";

export const CODE_TTL_MS = 10 * 60_000;
export const CODE_TRIES = 5; // wrong codes before a new one must be sent
export const RESEND_MS = 30_000;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 64; // bcrypt reads at most 72 bytes

function secret() {
  const s = process.env.EMAIL_HASH_SECRET;
  if (!s) throw new Error("EMAIL_HASH_SECRET is not set");
  return s;
}

const hmac = (text: string) => createHmac("sha256", secret()).update(text).digest("hex");

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const isEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
export const hashEmail = (email: string) => hmac(`email:${normalizeEmail(email)}`);
export const hashCode = (emailHash: string, code: string) => hmac(`code:${emailHash}:${code}`);
export const hashIp = (ip: string) => hmac(`ip:${ip}`);
export const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

// The most common leaked passwords that pass the length rule (short list on purpose: it stops the obvious ones).
const COMMON = new Set(
  "12345678 123456789 1234567890 password password1 password123 qwertyui qwerty123 qwertyuiop 11111111 00000000 12341234 87654321 iloveyou iloveyou1 sunshine princess football baseball welcome1 abc12345 abcd1234 1q2w3e4r 1qaz2wsx zaq12wsx trustno1 superman letmein1 passw0rd monkey123 dragon123 starwars whatever computer michael1 jennifer charlie1 66666666 88888888 12121212 asdfghjk asdfasdf aaaaaaaa changeme internet samsung1 liverpool chelsea1 arsenal1 football1 gymlife1 workout1 fitness1".split(" "),
);

// Why a password is refused, or null. Length and the common list only (NIST 800-63B): no forced symbols, no forced changes.
export function passwordProblem(pw: string): string | null {
  if (pw.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (pw.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  if (COMMON.has(pw.toLowerCase())) return "That password is too common. Pick another.";
  return null;
}

// The caller's IP as Vercel reports it; one bucket for everything local.
export const clientIp = (get: (name: string) => string | null | undefined) =>
  get("x-real-ip") || get("x-forwarded-for")?.split(",")[0].trim() || "local";
