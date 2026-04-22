import { DEFAULT_SETTINGS, type PondMessage, type PondSettings } from "../shared/types";
import { urlToSource } from "../shared/url";

const SITES = ["twitter", "instagram", "pinterest", "arena", "cosmos"] as const;

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

  document.getElementById("save")!.addEventListener("click", async () => {
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

init();
