import type { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import { clientIp, hashEmail, hashIp, isEmail, normalizeEmail } from "@/lib/account";
import { atLimit, hit } from "@/lib/rate-limit";

const NO_ACCOUNT_HASH = "$2b$10$LLKoCAKY7e8P4M9yhfWbu.5sovi89VO5s4QqrUQ1o3ckcL0utOjt2"; // bcrypt of a throwaway string, cost 10 like real ones
export const SESSION_DAYS = 90; // P3-04: renewed while the app is used (AppShell), so the installed app stays signed in

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },

      // Sign in only (P3-01, DD-053): accounts are made by the email-code flow (/signup), never here.
      async authorize(credentials, req) {
        const email = normalizeEmail(credentials?.email ?? "");
        const password = credentials?.password ?? "";
        if (!isEmail(email) || !password) return null;

        const emailHash = hashEmail(email);
        const header = (n: string) => {
          const v = req?.headers?.[n];
          return Array.isArray(v) ? v[0] : v;
        };
        // Wrong passwords count: 10 per email and 30 per IP in 15 minutes, then every try is refused until the window ends
        // (a right password too, or guessing could go on). The message reaches the page as ?error=TooMany.
        const limits = { [`signin:email:${emailHash}`]: 10, [`signin:ip:${hashIp(clientIp(header))}`]: 30 };
        // Both reads at once: the limit check costs no extra round trip on the way in.
        const [locked, user] = await Promise.all([atLimit(limits), prisma.user.findUnique({ where: { emailHash } })]);
        if (locked) throw new Error("TooMany");
        // An unknown email still pays for one bcrypt compare (against a dummy hash), so timing never tells who has an account (DD-053).
        if (!(await bcrypt.compare(password, user?.passwordHash ?? NO_ACCOUNT_HASH)) || !user) {
          const over = await Promise.all(Object.entries(limits).map(([key, limit]) => hit(key, limit, 15 * 60_000)));
          if (over.some(Boolean)) throw new Error("TooMany");
          return null;
        }
        // The email rides in the encrypted session cookie only (shown under Account); the database never has it.
        return { id: user.id, email };
      },
    }),
  ],

  session: { strategy: "jwt", maxAge: SESSION_DAYS * 24 * 60 * 60 },

  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) session.user.id = token.id as string;
      return session;
    },
  },
};
