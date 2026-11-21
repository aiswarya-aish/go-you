import nodemailer from "nodemailer";

// The code email (P3-06: Gmail SMTP with an app password, set by the user in Vercel env). Plain text: it reads anywhere, nothing to render.
// No SMTP set: the code goes to the server log, which is how local runs work. On Vercel that would silently break sign-up, so it throws.
export async function sendCode(to: string, code: string) {
  const user = process.env.SMTP_USER;
  if (!user) {
    if (process.env.VERCEL) throw new Error("SMTP_USER is not set");
    console.log(`[mail] code for ${to}: ${code}`);
    return;
  }
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass: process.env.SMTP_PASS },
  });
  await transport.sendMail({
    from: `GO—YOU <${user}>`,
    to,
    subject: `${code} is your GO—YOU code`,
    text: `Your GO—YOU code is ${code}\n\nIt works for 10 minutes. If you did not ask for it, ignore this email: nothing changes without the code.`,
  });
}
