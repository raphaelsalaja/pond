import { SearchCardDataSchema } from "@shared/search-card";
import { TextCardDataSchema } from "@shared/text-card";
import { TweetCardDataSchema } from "@shared/tweet-card";
import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import type { z } from "zod";
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
document.documentElement.dataset.card = params.get("card") ?? "";
delete document.documentElement.dataset.ready;
const kindParam = params.get("kind");
const KIND =
  kindParam === "text" || kindParam === "search" || kindParam === "threads"
    ? kindParam
    : "tweet";
const SCHEME: "light" | "dark" =
  params.get("scheme") === "dark" ? "dark" : "light";
const WIDTH = Number(params.get("w") ?? DEFAULT_WIDTH) || DEFAULT_WIDTH;

document.documentElement.style.background = SCHEME === "dark" ? "#000" : "#fff";

function decodePayload<T>(schema: z.ZodType<T>, fallback: T): T {
  try {
    const raw = location.hash.replace(/^#/, "") || params.get("data") || "";
    const parsed = schema.safeParse(
      JSON.parse(decodeURIComponent(escape(atob(raw)))),
    );
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

const TWEET_PAYLOAD = decodePayload(TweetCardDataSchema, {
  author: { name: "", handle: "" },
});
const TEXT_PAYLOAD = decodePayload(TextCardDataSchema, { text: "" });
const SEARCH_PAYLOAD = decodePayload(SearchCardDataSchema, {
  engine: "",
  query: "",
});

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

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        if (document.fonts?.ready) await document.fonts.ready;
      } catch {}
      if (ref.current) await waitForImages(ref.current);
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
  }, []);

  return (
    <div ref={ref} data-capture-card style={{ width: WIDTH }}>
      {KIND === "text" ? (
        <TextCard data={TEXT_PAYLOAD} scheme={SCHEME} />
      ) : KIND === "search" ? (
        <SearchCard data={SEARCH_PAYLOAD} scheme={SCHEME} />
      ) : KIND === "threads" ? (
        <ThreadsCard data={TWEET_PAYLOAD} scheme={SCHEME} />
      ) : (
        <TweetCard data={TWEET_PAYLOAD} scheme={SCHEME} />
      )}
    </div>
  );
}

const root = document.getElementById("capture-root");

if (root) createRoot(root).render(<CaptureCard />);
