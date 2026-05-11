import type { Source } from "@pond/schema/db";
import { Button, Field, Input } from "@pond/ui";
import { useCallback, useEffect, useState } from "react";
import { parsePairingLink } from "@/utils/pairing";
import {
  DEFAULT_SETTINGS,
  LIBRARY_INFO_URL,
  type PondMessage,
  type PondSettings,
} from "@/utils/types";
import { urlToSource } from "@/utils/url";
import styles from "./popup.module.css";

interface LibraryInfo {
  name: string;
  counts: { active: number; archived: number };
}

type ProbeResult =
  | { state: "unpaired" }
  | { state: "offline" }
  | { state: "connected"; library: LibraryInfo };

type CaptureResult =
  | { tone: "ok"; label: string }
  | { tone: "error"; label: string }
  | null;

const SAVE_LABELS: Record<Source, string> = {
  twitter: "Save tweet",
  instagram: "Save post",
  pinterest: "Save pin",
  arena: "Save block",
  cosmos: "Save cluster",
  tiktok: "Save TikTok",
  youtube: "Save video",
  reddit: "Save post",
  article: "Save article",
};

async function loadSettings(): Promise<PondSettings> {
  const stored = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(stored.settings ?? {}) };
}

async function saveSettings(next: PondSettings): Promise<void> {
  await chrome.storage.local.set({ settings: next });
}

async function probe(settings: PondSettings): Promise<ProbeResult> {
  if (!settings.apiKey) return { state: "unpaired" };
  try {
    const res = await fetch(LIBRARY_INFO_URL, {
      headers: { authorization: `Bearer ${settings.apiKey}` },
      signal: AbortSignal.timeout(1500),
    });
    if (res.status === 401) return { state: "unpaired" };
    if (!res.ok) return { state: "offline" };
    const body = (await res.json()) as {
      status?: string;
      data?: LibraryInfo;
    };
    if (body.status !== "success" || !body.data) return { state: "offline" };
    return { state: "connected", library: body.data };
  } catch {
    return { state: "offline" };
  }
}

async function getActiveTabUrl(): Promise<string | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url ?? null;
}

export function App() {
  const [probeResult, setProbeResult] = useState<ProbeResult | null>(null);
  const [tabUrl, setTabUrl] = useState<string | null>(null);
  const [pairingInput, setPairingInput] = useState("");
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [pairingBusy, setPairingBusy] = useState(false);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [captureResult, setCaptureResult] = useState<CaptureResult>(null);

  const refresh = useCallback(async () => {
    const [settings, url] = await Promise.all([
      loadSettings(),
      getActiveTabUrl(),
    ]);
    setTabUrl(url);
    setProbeResult(await probe(settings));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const resolved = tabUrl ? urlToSource(tabUrl) : null;

  async function applyPairing(): Promise<void> {
    setPairingError(null);
    const parsed = parsePairingLink(pairingInput);
    if (!parsed) {
      setPairingError("That doesn't look like a pond:// pairing link.");
      return;
    }
    setPairingBusy(true);
    try {
      const current = await loadSettings();
      const next: PondSettings = {
        ...current,
        endpoint: parsed.endpoint,
        apiKey: parsed.token,
      };
      await saveSettings(next);
      setPairingInput("");
      const result = await probe(next);
      setProbeResult(result);
      if (result.state !== "connected") {
        setPairingError(
          result.state === "offline"
            ? "Paired, but Pond isn't responding. Make sure the app is running."
            : "Pond rejected that token. Copy the link again from the menu bar.",
        );
      }
    } finally {
      setPairingBusy(false);
    }
  }

  async function saveCurrent(): Promise<void> {
    if (!tabUrl || !resolved || captureBusy) return;
    setCaptureBusy(true);
    setCaptureResult(null);
    try {
      const message: PondMessage = { kind: "manualCapture", url: tabUrl };
      const res = (await chrome.runtime.sendMessage(message)) as
        | { ok: boolean }
        | undefined;
      if (res?.ok) {
        setCaptureResult({ tone: "ok", label: "Saved" });
        return;
      }
      setCaptureResult({ tone: "error", label: "Save failed — check Pond" });
      // A failed save often means the token rotated under us; re-probe so
      // the UI flips to `unpaired` if that's what happened.
      void refresh();
    } catch {
      setCaptureResult({ tone: "error", label: "Save failed — check Pond" });
    } finally {
      setCaptureBusy(false);
    }
  }

  function openDeepLink(href: string): void {
    // `chrome.tabs.create` lets the OS protocol handler claim `pond://`
    // links. `window.open` from a popup gets sandboxed and silently no-ops
    // on custom schemes.
    void chrome.tabs.create({ url: href, active: true });
    window.close();
  }

  if (!probeResult) {
    return (
      <div className={styles.shell}>
        <Header tone="warn" label="Connecting…" />
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <Header
        tone={
          probeResult.state === "connected"
            ? "ok"
            : probeResult.state === "offline"
              ? "warn"
              : "error"
        }
        label={
          probeResult.state === "connected"
            ? probeResult.library.name
            : probeResult.state === "offline"
              ? "Pond is offline"
              : "Not paired"
        }
        meta={
          probeResult.state === "connected"
            ? formatCount(probeResult.library.counts.active)
            : undefined
        }
      />

      {probeResult.state === "unpaired" ? (
        <UnpairedCard
          value={pairingInput}
          onChange={setPairingInput}
          onApply={applyPairing}
          busy={pairingBusy}
          error={pairingError}
        />
      ) : null}

      {probeResult.state === "offline" ? (
        <OfflineCard
          onRetry={refresh}
          onOpenPond={() => openDeepLink("pond://")}
        />
      ) : null}

      {probeResult.state === "connected" ? (
        <ConnectedCard
          resolved={resolved}
          tabUrl={tabUrl}
          busy={captureBusy}
          result={captureResult}
          onSave={saveCurrent}
        />
      ) : null}

      <footer className={styles.footer}>
        <button
          type="button"
          className={styles["footer-link"]}
          onClick={() => openDeepLink("pond://")}
        >
          Open Pond
        </button>
        <span className={styles["footer-sep"]} aria-hidden>
          ·
        </span>
        <button
          type="button"
          className={styles["footer-link"]}
          onClick={() => openDeepLink("pond://settings/extension")}
        >
          Settings
        </button>
      </footer>
    </div>
  );
}

interface HeaderProps {
  tone: "ok" | "warn" | "error";
  label: string;
  meta?: string;
}

function Header({ tone, label, meta }: HeaderProps) {
  return (
    <header className={styles.header}>
      <span aria-hidden className={styles["status-dot"]} data-tone={tone} />
      <h1 className={styles.wordmark}>Pond</h1>
      <span className={styles["status-label"]}>· {label}</span>
      {meta ? <span className={styles["status-meta"]}>{meta}</span> : null}
    </header>
  );
}

interface UnpairedCardProps {
  value: string;
  onChange: (v: string) => void;
  onApply: () => void | Promise<void>;
  busy: boolean;
  error: string | null;
}

function UnpairedCard({
  value,
  onChange,
  onApply,
  busy,
  error,
}: UnpairedCardProps) {
  return (
    <section className={styles.card}>
      <h2 className={styles["card-title"]}>Pair with Pond</h2>
      <p className={styles["card-description"]}>
        Open the Pond menu bar icon → <strong>Copy Pairing Token</strong>, then
        paste the link below.
      </p>
      <Field.Root>
        <Field.Label htmlFor="pairing">Pairing link</Field.Label>
        <Input.Root
          id="pairing"
          data-variant="code"
          type="text"
          placeholder="pond://pair?port=41610&token=…"
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy) void onApply();
          }}
        />
        {error ? <p className={styles["pairing-error"]}>{error}</p> : null}
      </Field.Root>
      <Button
        variant="primary"
        className={styles["primary-button"]}
        disabled={busy || !value.trim()}
        onClick={() => void onApply()}
      >
        {busy ? "Pairing…" : "Pair"}
      </Button>
    </section>
  );
}

interface OfflineCardProps {
  onRetry: () => void | Promise<void>;
  onOpenPond: () => void;
}

function OfflineCard({ onRetry, onOpenPond }: OfflineCardProps) {
  return (
    <section className={styles.card}>
      <h2 className={styles["card-title"]}>Pond isn't running</h2>
      <p className={styles["card-description"]}>
        Start the Pond app to capture saves. Bookmarks and likes you make in the
        meantime won't sync until it's back.
      </p>
      <Button
        variant="primary"
        className={styles["primary-button"]}
        onClick={() => void onRetry()}
      >
        Try again
      </Button>
      <Button variant="ghost" onClick={onOpenPond}>
        Open Pond
      </Button>
    </section>
  );
}

interface ConnectedCardProps {
  resolved: ReturnType<typeof urlToSource>;
  tabUrl: string | null;
  busy: boolean;
  result: CaptureResult;
  onSave: () => void | Promise<void>;
}

function ConnectedCard({
  resolved,
  tabUrl,
  busy,
  result,
  onSave,
}: ConnectedCardProps) {
  const canSave = !!resolved && !busy;
  const label = busy
    ? "Saving…"
    : resolved
      ? SAVE_LABELS[resolved.source]
      : tabUrl
        ? "Page not supported"
        : "No active tab";
  return (
    <section className={styles.card}>
      <Button
        variant="primary"
        className={styles["primary-button"]}
        disabled={!canSave}
        onClick={() => void onSave()}
      >
        {label}
      </Button>
      {resolved ? (
        <p className={styles["capture-meta"]}>
          {resolved.source} · {resolved.sourceId}
        </p>
      ) : null}
      {result ? (
        <p className={styles["capture-result"]} data-tone={result.tone}>
          {result.label}
        </p>
      ) : null}
    </section>
  );
}

function formatCount(n: number): string {
  if (n < 1000) return `${n} saves`;
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k saves`;
  return `${Math.round(n / 1000)}k saves`;
}
