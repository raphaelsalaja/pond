import Link from "next/link";

export default function SettingsPage() {
  const hasKey = Boolean(process.env.POND_INGEST_KEY);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Link
        href="/"
        className="text-sm text-[rgb(var(--muted))] hover:text-[rgb(var(--foreground))]"
      >
        ← back
      </Link>

      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Settings</h1>

      <section className="mt-8 space-y-3 rounded-2xl border border-[rgb(var(--border))] p-5">
        <h2 className="text-sm font-semibold">Ingest key</h2>
        <p className="text-sm text-[rgb(var(--muted))]">
          Set <code>POND_INGEST_KEY</code> in your environment. The Chrome
          extension authenticates with it as a Bearer token.
        </p>
        <p className="text-sm">
          Status:{" "}
          <span
            className={
              hasKey ? "text-emerald-600" : "text-amber-600"
            }
          >
            {hasKey ? "configured" : "not configured"}
          </span>
        </p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-neutral-900 p-3 text-xs text-neutral-100">
{`# generate one
openssl rand -hex 32

# set in .env or vercel env
POND_INGEST_KEY="..."`}
        </pre>
      </section>

      <section className="mt-6 space-y-3 rounded-2xl border border-[rgb(var(--border))] p-5">
        <h2 className="text-sm font-semibold">Extension setup</h2>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-[rgb(var(--muted))]">
          <li>
            Build the extension: <code>pnpm --filter @pond/extension build</code>
          </li>
          <li>
            Open <code>chrome://extensions</code>, enable Developer mode.
          </li>
          <li>
            Click <strong>Load unpacked</strong> and select{" "}
            <code>apps/extension/dist</code>.
          </li>
          <li>
            Open the extension popup, paste the ingest URL (
            <code>{`<this app>/api/ingest`}</code>) and your{" "}
            <code>POND_INGEST_KEY</code>.
          </li>
        </ol>
      </section>
    </main>
  );
}
