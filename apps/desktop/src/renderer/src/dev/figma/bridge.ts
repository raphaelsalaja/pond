import { getAppRouter } from "@/shared/lib/app-router";
import { paintTheme } from "@/shared/lib/paint-theme";

interface Job {
  id: string;
  name?: string;
  jobs?: Job[];
  path?: string;
  theme?: "light" | "dark";
  run?: string;
  delay?: number;
  captureId?: string;
  endpoint?: string;
  selector?: string;
  reload?: boolean;
}

const THEMES = {
  light: {
    accent: "#008FFF",
    background: "#ffffff",
    foreground: "#1B1B1B",
    contrast: 50,
  },
  dark: {
    accent: "#008FFF",
    background: "#0A0A0A",
    foreground: "#EEEEEE",
    contrast: 50,
  },
};

const DONE_KEY = "figma-bridge-done";
const CAPTURE_URL = "https://mcp.figma.com/mcp/html-to-design/capture.js";

declare global {
  interface Window {
    figma?: {
      captureForDesign: (opts: {
        captureId: string;
        endpoint: string;
        selector: string;
      }) => Promise<void>;
    };
    __figmaBridge?: number;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let busy = false;
let chain: { id: string; endpoint: string } | null = null;

async function loadCapture() {
  if (window.figma?.captureForDesign) return;
  const source = await (await fetch(CAPTURE_URL)).blob();
  const url = URL.createObjectURL(source);
  try {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("capture script failed"));
      document.head.append(script);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function runJob(job: Job) {
  if (job.jobs) {
    for (const step of job.jobs) await runJob(step);
    return;
  }
  if (job.reload) {
    location.reload();
    return;
  }
  if (job.path) await getAppRouter()?.navigate({ to: job.path });
  if (job.theme) paintTheme(THEMES[job.theme], "srgb");
  if (job.run) await new Function(`return (async () => { ${job.run} })()`)();
  await sleep(job.delay ?? 1500);
  if (job.theme) paintTheme(THEMES[job.theme], "srgb");
  if (job.captureId === "next") {
    if (!chain) throw new Error("no chained capture id");
    job.captureId = chain.id;
    job.endpoint = chain.endpoint;
  }
  if (job.captureId && job.endpoint) {
    console.warn(
      "[figma-bridge] capture start",
      job.path,
      job.theme,
      document.visibilityState,
    );
    await loadCapture();
    const raf = window.requestAnimationFrame;
    const caf = window.cancelAnimationFrame;
    if (document.hidden) {
      window.requestAnimationFrame = (cb) =>
        window.setTimeout(() => cb(performance.now()), 16);
      window.cancelAnimationFrame = (id) => window.clearTimeout(id);
    }
    const nativeFetch = window.fetch;
    const submitted = new Promise<void>((resolve) => {
      window.fetch = async (input, init) => {
        const res = await nativeFetch(input, init);
        if (String(input).includes(`/capture/${job.captureId}/submit`)) {
          /** SAFETY: Figma's submit endpoint answers with this JSON, and a failed read falls back to `{}`. */
          const body = (await res
            .clone()
            .json()
            .catch(() => ({}))) as { nextCaptureId?: string };
          const endpoint = job.endpoint ?? "";
          chain = body.nextCaptureId
            ? {
                id: body.nextCaptureId,
                endpoint: endpoint.replace(
                  /\/capture\/[^/]+\/submit/,
                  `/capture/${body.nextCaptureId}/submit`,
                ),
              }
            : null;
          console.warn(
            "[figma-bridge] submitted",
            job.captureId,
            job.name ?? job.path,
            job.theme,
            res.status,
          );
          resolve();
        }
        return res;
      };
    });
    try {
      void window.figma?.captureForDesign({
        captureId: job.captureId,
        endpoint: job.endpoint,
        selector: job.selector ?? "body",
      });
      await submitted;
      await sleep(3500);
    } finally {
      window.fetch = nativeFetch;
      window.requestAnimationFrame = raf;
      window.cancelAnimationFrame = caf;
      document.getElementById("__figma_capture_toolbar_host__")?.remove();
    }
    console.warn("[figma-bridge] capture done", job.path, job.theme);
  }
}

async function tick() {
  if (busy) return;
  const res = await fetch("/src/dev/figma/job.txt", { cache: "no-store" });
  const text = (await res.text()).trim();
  if (!text.startsWith("{")) return;
  /** SAFETY: job.txt is a local capture request written in the `Job` format. */
  const job = JSON.parse(text) as Job;
  if (localStorage.getItem(DONE_KEY) === job.id) return;
  localStorage.setItem(DONE_KEY, job.id);
  busy = true;
  console.warn("[figma-bridge] job", job.id);
  /** Hidden windows never advance CSS animations, so entrance keyframes would capture at opacity 0. */
  const still = document.createElement("style");
  still.textContent =
    "*,*::before,*::after{animation:none!important;transition:none!important}";
  document.head.append(still);
  try {
    await runJob(job);
  } catch (error) {
    console.error("[figma-bridge]", error);
  } finally {
    still.remove();
    busy = false;
  }
}

clearInterval(window.__figmaBridge);
window.__figmaBridge = window.setInterval(
  () =>
    void tick().catch((error) => console.warn("[figma-bridge] tick", error)),
  1000,
);
