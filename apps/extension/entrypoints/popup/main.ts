import {
  APP_INFO_URL,
  DEFAULT_SETTINGS,
  type PondMessage,
  type PondSettings,
} from "@/utils/types";
import { urlToSource } from "@/utils/url";

const SITES = [
  "twitter",
  "instagram",
  "pinterest",
  "arena",
  "cosmos",
  "tiktok",
  "youtube",
  "article",
] as const;

async function load(): Promise<PondSettings> {
  const stored = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(stored.settings ?? {}) };
}

function $(id: string): HTMLInputElement {
  return document.getElementById(id) as HTMLInputElement;
}

function setStatus(text: string) {
  const status = document.getElementById("status");
  if (!status) return;
  status.textContent = text;
  if (text) setTimeout(() => (status.textContent = ""), 1800);
}

async function probeApp(): Promise<string | null> {
  try {
    const res = await fetch(APP_INFO_URL, {
      method: "GET",
      signal: AbortSignal.timeout(1000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      status?: string;
      data?: { name?: string; version?: string };
    };
    if (json.status !== "success") return null;
    return `pond ${json.data?.version ?? ""} detected`.trim();
  } catch {
    return null;
  }
}

async function init() {
  const settings = await load();
  $("endpoint").value = settings.endpoint;
  $("apiKey").value = settings.apiKey;
  for (const site of SITES) {
    const cb = document.querySelector<HTMLInputElement>(
      `input[data-site="${site}"]`,
    );
    if (cb) cb.checked = settings.enabled[site];
  }

  const probe = document.getElementById("appProbe");
  if (probe) {
    probe.textContent = "detecting desktop app…";
    const status = await probeApp();
    probe.textContent = status ?? "desktop app not running on 127.0.0.1:41610";
    probe.dataset.ok = status ? "1" : "0";
  }

  const saveCurrent = document.getElementById(
    "saveCurrent",
  ) as HTMLButtonElement | null;
  const hint = document.getElementById("quickHint");

  if (saveCurrent && hint) {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    const url = tab?.url ?? "";
    const resolved = url ? urlToSource(url) : null;
    if (!resolved) {
      saveCurrent.disabled = true;
      saveCurrent.textContent = "Not a supported page";
      hint.textContent = url ? "URL not on a supported platform" : "";
    } else {
      hint.textContent = `${resolved.source} · ${resolved.sourceId}`;
    }

    saveCurrent.addEventListener("click", async () => {
      if (!url) return;
      saveCurrent.disabled = true;
      const message: PondMessage = { kind: "manualCapture", url };
      try {
        const res = (await chrome.runtime.sendMessage(message)) as
          | { ok: boolean }
          | undefined;
        setStatus(res?.ok ? "saved" : "failed");
      } catch (e) {
        console.error("[pond popup] sendMessage failed", e);
        setStatus("failed");
      } finally {
        saveCurrent.disabled = false;
      }
    });
  }

  document.getElementById("applyPairing")?.addEventListener("click", () => {
    const raw = $("pairing").value.trim();
    const parsed = parsePairingLink(raw);
    if (!parsed) {
      setStatus("invalid pairing link");
      return;
    }
    $("endpoint").value = parsed.endpoint;
    $("apiKey").value = parsed.token;
    setStatus("pairing parsed — click Save");
  });

  document.getElementById("save")?.addEventListener("click", async () => {
    const next: PondSettings = {
      endpoint: $("endpoint").value.trim(),
      apiKey: $("apiKey").value.trim(),
      enabled: { ...settings.enabled },
    };
    for (const site of SITES) {
      const cb = document.querySelector<HTMLInputElement>(
        `input[data-site="${site}"]`,
      );
      if (cb) next.enabled[site] = cb.checked;
    }
    await chrome.storage.local.set({ settings: next });
    setStatus("saved");
  });
}

/**
 * Parse `pond://pair?port=41610&token=…` from the tray menu. Kept lenient
 * to survive mobile-keyboard quirks (extra whitespace, accidental angle
 * brackets from Mail.app).
 */
function parsePairingLink(
  raw: string,
): { endpoint: string; token: string } | null {
  try {
    const cleaned = raw.trim().replace(/^[<"']|[>"']$/g, "");
    if (!cleaned.startsWith("pond://pair")) return null;
    // Node-safe URL parsing via WHATWG URL with a fake scheme swap,
    // because `pond://` isn't universally accepted by `new URL`.
    const url = new URL(cleaned.replace(/^pond:\/\//, "http://"));
    const port = url.searchParams.get("port") ?? "41610";
    const token = url.searchParams.get("token") ?? "";
    if (!token) return null;
    return {
      endpoint: `http://127.0.0.1:${port}/api/v2/item/add`,
      token,
    };
  } catch {
    return null;
  }
}

init();
