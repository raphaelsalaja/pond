import { Dialog } from "@pond/ui";
import type {
  DownloadFileProbe,
  DownloadPostProbe,
  DownloadRequest,
  DownloadSingleProbe,
} from "@shared/downloader-contracts";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect } from "react";
import {
  DownloadFlow,
  type DownloadFlowState,
  singleRequest,
} from "@/features/downloads/components/download-dialog";
import type { ExportSettings } from "@/features/downloads/components/download-dialog/export-options/settings";
import type { LinkError } from "@/features/downloads/components/download-dialog/link-page";
import type { ListRow } from "@/features/downloads/components/download-dialog/list-page";
import styles from "./styles.module.css";

const ROOT = "/Users/raphaelsalaja/Developer/pond";
const DIR =
  "apps/desktop/src/renderer/src/features/downloads/components/download-dialog";
const LINK = "https://www.youtube.com/watch?v=VvINNQeF3jk";
const FALLBACK_LINK = "https://archive.org/details/BigBuckBunny_124";
const NO_LINKS: string[] = [];
const READ_FAILED = "Pond couldn't read this link. Check it and try again.";
const NOT_A_LINK =
  "That's not a link. Paste a web address to a video, post, page or file.";

type RoomSize = "link" | "list" | "single";

interface EntryProps {
  component: string;
  state: string;
  source: string;
  children: ReactNode;
}

/** React 19 assigns props as properties on defined elements, and these are getter-only, so set them as attributes. */
function Entry({ component, state, source, children }: EntryProps) {
  return (
    <lab-entry
      className={styles.entry}
      ref={(node) => {
        node?.setAttribute("component", component);
        node?.setAttribute("state", state);
        node?.setAttribute("source", `${DIR}/${source}`);
      }}
    >
      {children}
    </lab-entry>
  );
}

/** A contained, non-modal dialog root so every state can stay open on one page. */
function Room({ size, children }: { size: RoomSize; children: ReactNode }) {
  return (
    <Dialog.PortalProvider>
      <Dialog.PortalTarget className={styles.room} data-size={size}>
        {children}
      </Dialog.PortalTarget>
    </Dialog.PortalProvider>
  );
}

interface FlowEntryProps {
  state: string;
  source: string;
  size: RoomSize;
  initial: Partial<DownloadFlowState>;
  settings?: Partial<ExportSettings>;
}

function FlowEntry({ state, source, size, initial, settings }: FlowEntryProps) {
  return (
    <Entry
      component={componentOf(initial.page ?? "link")}
      state={state}
      source={source}
    >
      <Room size={size}>
        <Dialog.Root open modal={false}>
          <Dialog.Portal>
            <Dialog.Backdrop />
            <DownloadFlow
              links={NO_LINKS}
              initial={initial}
              initialSettings={settings}
            />
          </Dialog.Portal>
        </Dialog.Root>
      </Room>
    </Entry>
  );
}

function componentOf(page: DownloadFlowState["page"]): string {
  if (page === "video") return "Editor";
  if (page === "post") return "Post";
  if (page === "file") return "File";
  if (page === "list") return "Link List";
  return "Link Entry";
}

const IMAGES = [
  "https://i.ytimg.com/vi/VvINNQeF3jk/hqdefault.jpg",
  "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  "https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg",
  "https://i.ytimg.com/vi/9bZkp7q19f0/hqdefault.jpg",
  "https://i.ytimg.com/vi/kJQP7kiw5Fk/hqdefault.jpg",
];

const POST: DownloadPostProbe = {
  kind: "post",
  url: "https://x.com/FearedBuck/status/2119545962674655679",
  source: "twitter",
  site: "Twitter",
  title: "Deadlock clips from this week",
  author: "FearedBuck",
  text: "Deadlock clips from this week\nThe last one still makes me laugh.",
  images: IMAGES.slice(0, 1),
  existingSaveId: null,
};

function listRows(probe: DownloadSingleProbe): ListRow[] {
  return [
    {
      url: probe.url,
      title: probe.title,
      duration: probe.duration,
      thumbnail: probe.thumbnail,
      kind: "media",
      state: "ready",
      selected: true,
    },
    {
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      title:
        "Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)",
      duration: 213,
      thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
      kind: "media",
      state: "ready",
      selected: true,
    },
    {
      url: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
      title: "Me at the zoo",
      duration: 19,
      thumbnail: "https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg",
      kind: "media",
      state: "ready",
      selected: true,
    },
  ];
}

function LinkEntries() {
  const error = (message: string, action?: string): LinkError =>
    action
      ? { message, action: { label: action, onClick: () => {} } }
      : { message };
  return (
    <>
      <FlowEntry
        state="Opened"
        source="link-page/index.tsx:101"
        size="link"
        initial={{}}
      />
      <FlowEntry
        state="Reading Link"
        source="link-page/index.tsx:101"
        size="link"
        initial={{ input: LINK, busy: true }}
      />
      <FlowEntry
        state="Not a Link"
        source="link-page/index.tsx:63"
        size="link"
        initial={{
          input: "deadlock video",
          error: error(NOT_A_LINK),
        }}
      />
      <FlowEntry
        state="Couldn't Read"
        source="link-page/index.tsx:63"
        size="link"
        initial={{ input: LINK, error: error(READ_FAILED) }}
      />
      <FlowEntry
        state="Sign-In Needed"
        source="link-page/index.tsx:63"
        size="link"
        initial={{
          input: LINK,
          error: error(
            "YouTube needs you to sign in before Pond can read this link.",
            "Connect YouTube",
          ),
        }}
      />
    </>
  );
}

function EditorEntries({ probe }: { probe: DownloadSingleProbe }) {
  const duration = probe.duration ?? 0;
  const single = (state: string, source: string, next: DownloadSingleProbe) => (
    <FlowEntry
      state={state}
      source={source}
      size="single"
      initial={{ page: "video", single: next }}
    />
  );
  return (
    <>
      {single(
        probe.preview ? "Preview Stream" : "No Preview Stream",
        "editor/index.tsx:103",
        probe,
      )}
      {single("Storyboard Only", "editor/index.tsx:117", {
        ...probe,
        preview: null,
      })}
      {single("Extracted Frames", "editor/index.tsx:117", {
        ...probe,
        preview: null,
        storyboard: null,
      })}
      <FlowEntry
        state="Trimmed"
        source="video-page/index.tsx:69"
        size="single"
        initial={{
          page: "video",
          single: probe,
          request: {
            ...singleRequest(probe),
            range: {
              start: Math.round(duration * 0.2),
              end: Math.round(duration * 0.45),
            },
          },
        }}
      />
      {single("Audio Only", "editor/index.tsx:123", {
        ...probe,
        videoOptions: [],
      })}
      {single("Live", "video-page/index.tsx:37", { ...probe, isLive: true })}
      {single("No Duration", "video-page/index.tsx:37", {
        ...probe,
        duration: null,
      })}
      {single("No Picture", "editor/index.tsx:119", {
        ...probe,
        preview: null,
        storyboard: null,
        thumbnail: null,
        videoOptions: [],
      })}
    </>
  );
}

function PostEntries() {
  const post = (state: string, source: string, next: DownloadPostProbe) => (
    <FlowEntry
      state={state}
      source={source}
      size="single"
      initial={{ page: "post", post: next, input: next.url }}
    />
  );
  return (
    <>
      {post("One Image", "post-page/index.tsx:32", POST)}
      {post("Two Images", "post-page/index.tsx:32", {
        ...POST,
        images: IMAGES.slice(0, 2),
      })}
      {post("Three Images", "post-page/index.tsx:32", {
        ...POST,
        images: IMAGES.slice(0, 3),
      })}
      {post("More Than Four", "post-page/index.tsx:32", {
        ...POST,
        images: IMAGES,
      })}
      {post("Text Only", "post-page/index.tsx:53", {
        ...POST,
        title: "Deadlock clips from this week",
        images: [],
      })}
      {post("Web Page", "post-page/index.tsx:53", {
        ...POST,
        url: "https://www.example.com/essay",
        source: "web",
        site: "example.com",
        title: "An essay about ponds",
        author: null,
        text: "Why still water matters, and what it keeps.",
        images: [],
      })}
      {post("Already Saved", "post-page/index.tsx:115", {
        ...POST,
        existingSaveId: "lab",
      })}
    </>
  );
}

const FILE: DownloadFileProbe = {
  kind: "file",
  url: "https://www.example.com/reports/pond-field-guide.pdf",
  site: "example.com",
  name: "pond-field-guide.pdf",
  mimeType: "application/pdf",
  size: 2_457_600,
  existingSaveId: null,
};

function FileEntries() {
  const file = (state: string, source: string, next: DownloadFileProbe) => (
    <FlowEntry
      state={state}
      source={source}
      size="single"
      initial={{ page: "file", file: next, input: next.url }}
    />
  );
  return (
    <>
      {file("Document", "file-page/index.tsx:57", FILE)}
      {file("Image", "file-page/index.tsx:53", {
        ...FILE,
        url: IMAGES[0] ?? "",
        site: "i.ytimg.com",
        name: "hqdefault.jpg",
        mimeType: "image/jpeg",
        size: 31_400,
      })}
      {file("Unknown Size", "file-page/index.tsx:57", {
        ...FILE,
        url: "https://downloads.example.com/get?id=4",
        site: "downloads.example.com",
        name: "pond-assets.zip",
        mimeType: "application/zip",
        size: null,
      })}
    </>
  );
}

function ListEntries({ probe }: { probe: DownloadSingleProbe }) {
  const rows = listRows(probe);
  const list = (
    state: string,
    source: string,
    initial: Partial<DownloadFlowState>,
  ) => (
    <FlowEntry
      state={state}
      source={source}
      size="list"
      initial={{ page: "list", ...initial }}
    />
  );
  const request = (mode: DownloadRequest["mode"]): DownloadRequest => ({
    ...singleRequest(probe),
    mode,
    range: null,
    maxHeight: 1080,
    subtitleLang: null,
  });
  return (
    <>
      {list("Reading Links", "list-page/index.tsx:135", {
        rows: rows.map((row) => ({
          ...row,
          title: null,
          duration: null,
          thumbnail: null,
          state: "loading",
        })),
      })}
      {list("Ready", "list-page/index.tsx:108", { rows })}
      {list("Playlist Title", "index.tsx:363", {
        rows,
        listTitle: "Deadlock Highlights",
      })}
      {list("Some Selected", "list-page/index.tsx:85", {
        rows: rows.map((row, index) => ({ ...row, selected: index === 0 })),
      })}
      {list("None Selected", "index.tsx:323", {
        rows: rows.map((row) => ({ ...row, selected: false })),
      })}
      {list("Failed Link", "list-page/index.tsx:142", {
        rows: [
          ...rows,
          {
            url: "https://example.com/watch",
            title: null,
            duration: null,
            thumbnail: null,
            kind: "media",
            state: "failed",
            message: READ_FAILED,
            selected: true,
          },
        ],
      })}
      {list("Media and Posts", "lib/start.ts:40", {
        rows: [
          ...rows,
          {
            url: POST.url,
            title: POST.title,
            duration: null,
            thumbnail: POST.images[0] ?? null,
            kind: "post",
            state: "ready",
            selected: true,
          },
        ],
      })}
      {list("Audio", "list-page/index.tsx:66", {
        rows,
        request: request("audio"),
      })}
      {list("Transcript", "list-page/index.tsx:79", {
        rows,
        request: request("transcript"),
      })}
    </>
  );
}

function OptionEntries({ probe }: { probe: DownloadSingleProbe }) {
  const duration = probe.duration ?? 0;
  const short = {
    start: Math.round(duration * 0.2),
    end: Math.round(duration * 0.2) + 12,
  };
  const entry = (
    state: string,
    next: DownloadSingleProbe,
    request: Partial<DownloadRequest>,
    settings?: Partial<ExportSettings>,
  ) => (
    <FlowEntry
      state={state}
      source="panel/index.tsx:62"
      size="single"
      initial={{
        page: "video",
        single: next,
        request: { ...singleRequest(next), ...request },
      }}
      settings={settings}
    />
  );
  return (
    <>
      {entry("Already Saved", { ...probe, existingSaveId: "lab" }, {})}
      {entry("GIF", probe, { range: short }, { container: "gif", fps: 15 })}
      {entry("Folder", probe, {}, { destination: "file" })}
      {entry("Clipboard", probe, {}, { destination: "clipboard" })}
      {entry("Audio", probe, { mode: "audio" })}
      {entry("Transcript", probe, { mode: "transcript" })}
    </>
  );
}

export function DownloadLab() {
  useEffect(() => {
    void import("./lab.js");
  }, []);
  const probe = useQuery({
    queryKey: ["lab.downloadProbe", LINK],
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: () => window.pond.query("downloader.probe", { url: LINK }),
  });
  const fallback = useQuery({
    queryKey: ["lab.downloadProbe", FALLBACK_LINK],
    enabled: probe.data != null && !probe.data.ok,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: () =>
      window.pond.query("downloader.probe", { url: FALLBACK_LINK }),
  });
  const result = probe.data?.ok ? probe.data : fallback.data;
  const single =
    result?.ok && result.probe.kind === "single" ? result.probe : null;

  return (
    <div className={styles.page}>
      <lab-page title="Download Dialog" root={ROOT}>
        <LinkEntries />
        <PostEntries />
        <FileEntries />
        {single ? (
          <>
            <EditorEntries probe={single} />
            <ListEntries probe={single} />
            <OptionEntries probe={single} />
          </>
        ) : null}
      </lab-page>
      <p className={styles.status}>
        {probe.isPending
          ? "Reading the lab link"
          : probe.data?.ok
            ? `Lab link: ${LINK}`
            : `YouTube probe failed (${probe.data?.reason}: ${probe.data?.message}). ${single ? `Using ${FALLBACK_LINK}.` : "Reading the fallback link"}`}
      </p>
    </div>
  );
}
