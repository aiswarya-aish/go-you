// Client: the one credentials request next-auth's signIn() makes, without its extra session fetch and page reload.
// Used by the sign-in page and by the end of the create/reset flow.
export const RENEWED_KEY = "go-you.session-renewed"; // P3-04, read by AppShell
export const EMAIL_KEY = "go-you.email"; // what was typed on the sign-in page, carried to Create account / Forgot password (never in the URL)

export const getCsrf = () =>
  fetch("/api/auth/csrf")
    .then((r) => r.json())
    .then((d: { csrfToken: string }) => d.csrfToken);

export async function signInRequest(email: string, password: string, csrfToken: string): Promise<"ok" | "wrong" | "tooMany"> {
  const res = await fetch("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email, password, csrfToken, json: "true" }),
  });
  const { url } = (await res.json()) as { url?: string };
  const error = url ? new URL(url, location.href).searchParams.get("error") : "missing";
  if (error === "TooMany") return "tooMany";
  if (error) return "wrong";
  try {
    localStorage.setItem(RENEWED_KEY, String(Date.now())); // a fresh cookie: no renewal needed today
  } catch {}
  return "ok";
}
