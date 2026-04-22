import Link from "next/link";
import { SOURCES, type Source } from "@pond/schema/db";

const LABEL: Record<Source, string> = {
  twitter: "Twitter",
  instagram: "Instagram",
  pinterest: "Pinterest",
  arena: "Are.na",
  cosmos: "Cosmos",
};

export function SourceTabs({
  active,
  counts,
}: {
  active: Source | null;
  counts: Record<string, number>;
}) {
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm">
      <Tab href="/" active={active === null}>
        All <Badge n={total} />
      </Tab>
      {SOURCES.map((s) => (
        <Tab key={s} href={`/?source=${s}`} active={active === s}>
          {LABEL[s]} <Badge n={counts[s] ?? 0} />
        </Tab>
      ))}
    </nav>
  );
}

function Tab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={[
        "rounded-full px-3 py-1.5 transition",
        active
          ? "bg-[rgb(var(--foreground))] text-[rgb(var(--background))]"
          : "text-[rgb(var(--muted))] hover:text-[rgb(var(--foreground))]",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}

function Badge({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="ml-1 text-xs opacity-60 tabular-nums">{n}</span>
  );
}
