import type { Metadata } from "next";
import AccountFlow from "@/components/AccountFlow";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return <AccountFlow mode="signup" />;
}
