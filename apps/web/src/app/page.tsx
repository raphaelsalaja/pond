import Link from "next/link";
import { Suspense } from "react";
import { SOURCES, type Source } from "@pond/schema/db";
import { countBySource, searchSaves } from "@/lib/db/queries";
import { MasonryGrid } from "@/components/masonry";
import { SaveCard } from "@/components/save-card";
import { SearchBox } from "@/components/search-box";
import { SourceTabs } from "@/components/source-tabs";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const source = SOURCES.includes(sp.source as Source)
    ? (sp.source as Source)
    : null;
  const q = sp.q ?? null;

  const [items, counts] = await Promise.all([
    searchSaves({ source, q }),
    countBySource(),
  ]);

  const countMap = Object.fromEntries(counts.map((c) => [c.source, c.count]));

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
      <header className="sticky top-0 z-10 -mx-4 mb-6 flex flex-wrap items-center gap-3 border-b border-[rgb(var(--border))] bg-[rgb(var(--background))]/80 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <Link href="/" className="text-base font-semibold tracking-tight">
          pond
        </Link>
        <Suspense fallback={null}>
          <SearchBox />
        </Suspense>
        <div className="ml-auto">
          <Link
            href="/settings"
            className="text-sm text-[rgb(var(--muted))] hover:text-[rgb(var(--foreground))]"
          >
            Settings
          </Link>
        </div>
      </header>

      <div className="mb-6">
        <SourceTabs active={source} counts={countMap} />
      </div>

      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <MasonryGrid>
          {items.map((s) => (
            <SaveCard key={s.id} save={s} />
          ))}
        </MasonryGrid>
      )}
    </main>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-[rgb(var(--border))] p-12 text-center">
      <p className="text-base font-medium">Nothing here yet.</p>
      <p className="mt-1 text-sm text-[rgb(var(--muted))]">
        Install the extension and click save on Twitter, Pinterest, Are.na,
        Instagram, or Cosmos.
      </p>
      <Link
        href="/settings"
        className="mt-4 inline-block text-sm underline underline-offset-4"
      >
        Configure ingest key
      </Link>
    </div>
  );
}
