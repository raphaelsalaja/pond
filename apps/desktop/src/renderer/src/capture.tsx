import { POND_PROTOCOL, RENDER_CARD_PAYLOAD_HOST } from "@shared/constants";
import { SearchCardDataSchema } from "@shared/search-card";
import type { SearchCardData } from "@shared/search-card";
import { TextCardDataSchema } from "@shared/text-card";
import type { TextCardData } from "@shared/text-card";
import { TweetCardDataSchema } from "@shared/tweet-card";
import type { TweetCardData } from "@shared/tweet-card";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { SearchCard } from "./features/captures/components/search-card";
import { TextCard } from "./features/captures/components/text-card";
import { ThreadsCard } from "./features/captures/components/threads/card";
import { TweetCard } from "./features/captures/components/tweet/card";
import "@pond/theme/colors.css";
import "@pond/theme/radius.css";
import "@pond/theme/space.css";
import "@pond/theme/typography.css";

const DEFAULT_WIDTH = 550;
const IMAGE_WAIT_MS = 6000;

const params = new URLSearchParams(location.search);
const CARD_TOKEN = params.get("card") ?? "";
document.documentElement.dataset.card = CARD_TOKEN;
delete document.documentElement.dataset.ready;
const kindParam = params.get("kind");
const KIND =
  kindParam === "text" || kindParam === "search" || kindParam === "threads"
    ? kindParam
    : "tweet";
const SCHEME: "light" | "dark" =
  params.get("scheme") === "dark" ? "dark" : "light";
const WIDTH = Number(params.get("w") ?? DEFAULT_WIDTH) || DEFAULT_WIDTH;
const PAYLOAD_URL = `${POND_PROTOCOL}://${RENDER_CARD_PAYLOAD_HOST}/${encodeURIComponent(CARD_TOKEN)}`;

document.documentElement.style.background = SCHEME === "dark" ? "#000" : "#fff";

type CapturePayload =
  | { kind: "post"; data: TweetCardData }
  | { kind: "text"; data: TextCardData }
  | { kind: "search"; data: SearchCardData };

async function fetchPayload(): Promise<CapturePayload> {
  if (!CARD_TOKEN) throw new Error("capture payload token missing");
  const response = await fetch(PAYLOAD_URL, { cache: "no-store" });
  if (!response.ok) throw new Error("capture payload missing");
  const json: unknown = await response.json();

  if (KIND === "text") {
    const parsed = TextCardDataSchema.safeParse(json);
    if (parsed.success) return { kind: "text", data: parsed.data };
  } else if (KIND === "search") {
    const parsed = SearchCardDataSchema.safeParse(json);
    if (parsed.success) return { kind: "search", data: parsed.data };
  } else {
    const parsed = TweetCardDataSchema.safeParse(json);
    if (parsed.success) return { kind: "post", data: parsed.data };
  }
  throw new Error("capture payload invalid");
}

function waitForImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img")).filter((img) =>
    Boolean(img.currentSrc || img.src),
  );
  if (imgs.length === 0) return Promise.resolve();
  return Promise.race([
    Promise.all(imgs.map((img) => img.decode().catch(() => undefined))).then(
      () => undefined,
    ),
    new Promise<void>((resolve) => {
      setTimeout(resolve, IMAGE_WAIT_MS);
    }),
  ]);
}

function CaptureCard() {
  const ref = useRef<HTMLDivElement>(null);
  const [payload, setPayload] = useState<CapturePayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchPayload()
      .then((next) => {
        if (!cancelled) setPayload(next);
      })
      .catch(() => {
        if (!cancelled) document.documentElement.dataset.captureError = "1";
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!payload) return undefined;
    let cancelled = false;
    const run = async () => {
      try {
        const fontsReady = document.fonts?.ready;
        if (fontsReady !== undefined) {
          await fontsReady;
        }
      } catch {
        /** A font that fails to load falls back to the system face; the capture still proceeds. */
      }
      if (ref.current) {
        await waitForImages(ref.current);
      }
      /** A hidden window can stop delivering frames, so rAF alone may never fire and the capture waits to time out. */
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 250);
        requestAnimationFrame(() => {
          clearTimeout(timer);
          resolve(null);
        });
      });
      if (!cancelled) document.documentElement.dataset.ready = "1";
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [payload]);

  return (
    <div ref={ref} data-capture-card style={{ width: WIDTH }}>
      {payload?.kind === "text" ? (
        <TextCard data={payload.data} scheme={SCHEME} />
      ) : payload?.kind === "search" ? (
        <SearchCard data={payload.data} scheme={SCHEME} />
      ) : payload?.kind === "post" && KIND === "threads" ? (
        <ThreadsCard data={payload.data} scheme={SCHEME} />
      ) : payload?.kind === "post" ? (
        <TweetCard data={payload.data} scheme={SCHEME} />
      ) : null}
    </div>
  );
}

const root = document.getElementById("capture-root");

if (root) createRoot(root).render(<CaptureCard />);
