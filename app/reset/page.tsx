import type { Metadata } from "next";
import AccountFlow from "@/components/AccountFlow";

export const metadata: Metadata = { title: "Reset password" };

export default function ResetPage() {
  return <AccountFlow mode="reset" />;
}
