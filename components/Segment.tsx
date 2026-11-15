import Link from "next/link";

// Segmented control made of links (Stats range/unit, lift page range): each choice is a server render from cache,
// kept in the URL so it survives a reload and the back button.
export default function Segment({ items, active }: { items: { key: string; label: string; href: string }[]; active: string }) {
  return (
    <div className="grid auto-cols-fr grid-flow-col gap-px border border-[var(--control)] bg-[var(--control)]">
      {items.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          replace
          scroll={false}
          aria-current={i.key === active ? "true" : undefined}
          className={`press flex h-11 items-center justify-center px-2 text-xs font-bold tracking-[0.12em] ${
            i.key === active ? "bg-[var(--fg)] text-[var(--bg)]" : "bg-[var(--bg)]"
          }`}
        >
          {i.label}
        </Link>
      ))}
    </div>
  );
}
