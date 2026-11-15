"use client";

import { useRouter } from "next/navigation";

// "← Back" that returns to wherever the lifter came from (Stats, Log detail); a fresh tab falls back to `href`.
export default function BackLink({ href }: { href: string }) {
  const router = useRouter();
  return (
    <a
      href={href}
      onClick={(e) => {
        if (window.history.length > 1) {
          e.preventDefault();
          router.back();
        }
      }}
      className="press label inline-flex min-h-[var(--tap)] items-center text-[var(--fg)]"
    >
      ← Back
    </a>
  );
}
