import { Button, Dialog } from "@pond/ui";
import { extractLinks } from "@shared/downloader-contracts";
import type {
  DownloadFileProbe,
  DownloadPostProbe,
  DownloadProbeResult,
  DownloadRequest,
  DownloadSingleProbe,
} from "@shared/downloader-contracts";
import log from "electron-log/renderer";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  downloadDialog,
  useDownloadDialog,
} from "@/features/downloads/state/download-dialog";
import { getSourceDef, startConnect } from "@/features/sources";
import { formatBytes } from "@/shared/lib/format";
import type {
  ExportDestination,
  ExportSettings,
} from "./export-options/settings";
import { FilePage } from "./file-page";
import { estimateByDuration } from "./lib/estimate";
import { exportFiles, startLinks } from "./lib/start";
import { LinkPage } from "./link-page";
import type { LinkError } from "./link-page";
import { ListPage } from "./list-page";
import type { ListRow } from "./list-page";
import { PostPage } from "./post-page";
import { VideoPage } from "./video-page";
import styles from "./styles.module.css";

const PROBE_CONCURRENCY = 3;
const READ_FAILED = "Pond couldn't read this link. Check it and try again.";
const TYPING_PAUSE_MS = 400;

export type DownloadPage = "link" | "video" | "post" | "file" | "list";

const LIST_REQUEST: DownloadRequest = {
  mode: "video",
  maxHeight: 1080,
  audioFormat: "mp3",
  range: null,
  subtitleLang: null,
  container: null,
  fps: null,
  compression: "original",
  transcriptFormat: "txt",
};

export function singleRequest(probe: DownloadSingleProbe): DownloadRequest {
  const heights = probe.videoOptions.map((option) => option.height);
  return {
    mode: heights.length ? "video" : "audio",
    maxHeight:
      heights.find((height) => height <= 1080) ?? heights.at(-1) ?? null,
    audioFormat: "mp3",
    range: null,
    subtitleLang: probe.captions[0]?.lang ?? null,
    container: null,
    fps: null,
    compression: "original",
    transcriptFormat: "txt",
  };
}

function rowOf(url: string): ListRow {
  return {
    url,
    title: null,
    duration: null,
    thumbnail: null,
    kind: "media",
    state: "loading",
    selected: true,
  };
}

async function probe(url: string): Promise<DownloadProbeResult> {
  try {
    return await window.pond.query("downloader.probe", { url });
  } catch {
    return { ok: false, reason: "failed", message: READ_FAILED };
  }
}

function failureOf(result: DownloadProbeResult, retry: () => void): LinkError {
  if (result.ok) {
    return { message: READ_FAILED };
  }
  if (result.reason !== "sign-in" || !result.source) {
    return { message: result.message };
  }
  const source = result.source;
  const label = getSourceDef(source).label;
  return {
    message: `${label} needs you to sign in before Pond can read this link.`,
    action: {
      label: `Connect ${label}`,
      onClick: () => void startConnect(source, retry),
    },
  };
}

function downloadFile(
  found: DownloadFileProbe,
  destination: ExportDestination,
) {
  downloadDialog.close();
  void exportFiles({
    url: found.url,
    title: null,
    files: [found.url],
    destination,
    label: found.name,
  });
}

export function DownloadDialogHost() {
  const { open, session, links } = useDownloadDialog();
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) downloadDialog.close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <DownloadFlow key={session} links={links} />
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export interface DownloadFlowState {
  page: DownloadPage;
  input: string;
  busy: boolean;
  error: LinkError | null;
  single: DownloadSingleProbe | null;
  post: DownloadPostProbe | null;
  file: DownloadFileProbe | null;
  listTitle: string | null;
  rows: Array<ListRow>;
  request: DownloadRequest;
}

interface DownloadFlowProps {
  links: Array<string>;
  initial?: Partial<DownloadFlowState>;
  initialSettings?: Partial<ExportSettings>;
}

export function DownloadFlow({
  links,
  initial,
  initialSettings,
}: DownloadFlowProps) {
  const [page, setPage] = useState<DownloadPage>(initial?.page ?? "link");
  const [input, setInput] = useState(initial?.input ?? "");
  const [busy, setBusy] = useState(initial?.busy ?? false);
  const [error, setError] = useState<LinkError | null>(initial?.error ?? null);
  const [single, setSingle] = useState<DownloadSingleProbe | null>(
    initial?.single ?? null,
  );
  const [post, setPost] = useState<DownloadPostProbe | null>(
    initial?.post ?? null,
  );
  const [file, setFile] = useState<DownloadFileProbe | null>(
    initial?.file ?? null,
  );
  const [listTitle, setListTitle] = useState<string | null>(
    initial?.listTitle ?? null,
  );
  const [rows, setRows] = useState<Array<ListRow>>(initial?.rows ?? []);
  const [request, setRequest] = useState<DownloadRequest>(
    initial?.request ??
      (initial?.single ? singleRequest(initial.single) : LIST_REQUEST),
  );
  const attempt = useRef(0);
  const reads = useRef(new Map<string, Promise<DownloadProbeResult>>());
  const readKey = useRef("");
  const typing = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(typing.current), []);

  /** One read per link, so retyping a link or going back to it reuses the result. */
  const probeOnce = (url: string) => {
    const known = reads.current.get(url);
    if (known) return known;
    const next = probe(url).then((result) => {
      if (!result.ok) reads.current.delete(url);
      return result;
    });
    reads.current.set(url, next);
    return next;
  };

  const patchRequest = (patch: Partial<DownloadRequest>) =>
    setRequest((current) => ({ ...current, ...patch }));

  const openList = (urls: Array<string>, title: string | null = null) => {
    attempt.current += 1;
    const id = attempt.current;
    setListTitle(title);
    setRows(urls.map(rowOf));
    setRequest(LIST_REQUEST);
    setError(null);
    setPage("list");

    const queue = [...urls];
    const work = async () => {
      for (let url = queue.shift(); url; url = queue.shift()) {
        const result = await probeOnce(url);
        if (attempt.current !== id) return;
        setRows((current) =>
          current.flatMap((row): Array<ListRow> => {
            if (row.url !== url) {
              return [row];
            }
            if (!result.ok) {
              return [{ ...row, state: "failed", message: result.message }];
            }
            const found = result.probe;
            if (found.kind === "playlist") {
              return found.entries
                .filter((entry) => !current.some((it) => it.url === entry.url))
                .map((entry) => ({
                  ...entry,
                  kind: "media",
                  state: "ready",
                  selected: true,
                }));
            }
            if (found.kind === "post") {
              return [
                {
                  ...row,
                  title: found.title,
                  thumbnail: found.images[0] ?? null,
                  kind: "post",
                  state: "ready",
                },
              ];
            }
            if (found.kind === "file") {
              return [
                {
                  ...row,
                  title: found.name,
                  thumbnail: found.mimeType?.startsWith("image/")
                    ? found.url
                    : null,
                  kind: "file",
                  state: "ready",
                },
              ];
            }
            return [
              {
                ...row,
                title: found.title,
                duration: found.duration,
                thumbnail: found.thumbnail,
                state: "ready",
              },
            ];
          }),
        );
      }
    };
    for (let i = 0; i < Math.min(PROBE_CONCURRENCY, urls.length); i++) {
      void work();
    }
  };

  const read = async (urls: Array<string>) => {
    if (urls.length === 0) {
      setError({
        message:
          "That's not a link. Paste a web address to a video, post, page or file.",
      });
      return;
    }
    readKey.current = urls.join(" ");
    if (urls.length > 1) {
      openList(urls);
      return;
    }
    attempt.current += 1;
    const id = attempt.current;
    setBusy(true);
    setError(null);
    const result = await probeOnce(urls[0] ?? "");
    if (attempt.current !== id) return;
    setBusy(false);
    if (!result.ok) {
      readKey.current = "";
      setError(failureOf(result, () => void read(urls)));
      return;
    }
    const found = result.probe;
    if (found.kind === "playlist") {
      attempt.current += 1;
      setListTitle(found.title);
      setRows(
        found.entries.map((entry) => ({
          ...entry,
          kind: "media",
          state: "ready",
          selected: true,
        })),
      );
      setRequest(LIST_REQUEST);
      setPage("list");
      return;
    }
    if (found.kind === "post") {
      setPost(found);
      setPage("post");
      return;
    }
    if (found.kind === "file") {
      setFile(found);
      setPage("file");
      return;
    }
    setSingle(found);
    setRequest(singleRequest(found));
    setPage("video");
  };

  /** A paste into an empty field reads at once; typing waits for a pause. */
  const changeLink = (value: string) => {
    const pasted = input.trim() === "";
    setInput(value);
    setError(null);
    clearTimeout(typing.current);
    const urls = extractLinks(value);
    if (urls.join(" ") === readKey.current) return;
    if (urls.length === 0) {
      if (value.trim() !== "") return;
      attempt.current += 1;
      readKey.current = "";
      setBusy(false);
      setPage("link");
      return;
    }
    typing.current = setTimeout(
      () => void read(urls),
      pasted ? 0 : TYPING_PAUSE_MS,
    );
  };

  const [shownLinks, setShownLinks] = useState<Array<string> | null>(null);
  if (shownLinks !== links) {
    setShownLinks(links);
    if (links.length > 0) {
      setInput(links.join(" "));
    }
  }

  const opened = useRef<Array<string> | null>(null);
  const openLinks = useEffectEvent((next: Array<string>) => {
    if (opened.current === next) {
      return;
    }
    opened.current = next;
    if (next.length > 0) {
      void read(next);
      return;
    }
    if (initial) {
      return;
    }
    void window.pond
      .query("downloader.clipboardLinks", {})
      .then(({ urls }) => {
        const [url] = urls;
        if (urls.length !== 1 || !url || readKey.current !== "") return;
        setInput(url);
        void read([url]);
      })
      .catch((cause: unknown) => {
        log.warn("[pond downloads] clipboard link read failed", cause);
      });
  });
  useEffect(() => {
    openLinks(links);
  }, [links]);

  const start = () => {
    const picked = rows.filter((row) => row.selected && row.state === "ready");
    if (picked.length === 0) return;
    downloadDialog.close();
    void startLinks({
      media: picked.filter((row) => row.kind === "media").map((row) => row.url),
      posts: picked.filter((row) => row.kind === "post").map((row) => row.url),
      files: picked.filter((row) => row.kind === "file").map((row) => row.url),
      request,
      label: listTitle,
    });
  };

  const downloadPost = (
    found: DownloadPostProbe,
    destination: ExportDestination,
  ) => {
    downloadDialog.close();
    if (destination === "library") {
      void startLinks({
        media: [],
        posts: [found.url],
        files: [],
        request,
        label: null,
      });
      return;
    }
    void exportFiles({
      url: found.url,
      title: found.title,
      files: found.images,
      destination,
      label: found.title,
    });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (page === "list") {
      start();
      return;
    }
    clearTimeout(typing.current);
    const urls = extractLinks(input);
    if (urls.length === 0 || urls.join(" ") !== readKey.current) {
      void read(urls);
    }
  };

  const back = () => {
    attempt.current += 1;
    setBusy(false);
    setPage("link");
  };

  const picked = rows.filter((row) => row.selected && row.state === "ready");
  const listTotal = picked.reduce(
    (sum, row) => sum + (estimateByDuration(row.duration, request) ?? 0),
    0,
  );
  const title =
    page === "list"
      ? (listTitle ?? `${rows.length} Links`)
      : page === "video"
        ? (single?.title ?? "Download")
        : page === "post"
          ? (post?.title ?? "Download")
          : page === "file"
            ? (file?.name ?? "Download")
            : "Download";

  return (
    <Dialog.Popup
      className={styles.popup}
      pageId={page}
      depth={page === "link" ? 0 : 1}
      data-page={page}
    >
      <form onSubmit={submit}>
        <Dialog.Header
          className={styles.header}
          data-back={page === "list" || undefined}
        >
          {page === "list" ? <Dialog.Back onClick={back} /> : null}
          <Dialog.Title className={styles.title}>{title}</Dialog.Title>
          <Dialog.Close />
        </Dialog.Header>
        <Dialog.Viewport>
          {page === "list" ? (
            <ListPage
              rows={rows}
              request={request}
              onRequestChange={patchRequest}
              onToggle={(url, selected) =>
                setRows((current) =>
                  current.map((row) =>
                    row.url === url ? { ...row, selected } : row,
                  ),
                )
              }
              onToggleAll={(selected) =>
                setRows((current) =>
                  current.map((row) => ({ ...row, selected })),
                )
              }
            />
          ) : page === "video" && single ? (
            <VideoPage
              key={single.url}
              probe={single}
              request={request}
              onRequestChange={patchRequest}
              link={input}
              onLinkChange={changeLink}
              busy={busy}
              error={error}
              initialSettings={initialSettings}
            />
          ) : page === "post" && post ? (
            <PostPage
              key={post.url}
              probe={post}
              link={input}
              onLinkChange={changeLink}
              busy={busy}
              error={error}
              onDownload={(destination) => downloadPost(post, destination)}
            />
          ) : page === "file" && file ? (
            <FilePage
              key={file.url}
              probe={file}
              link={input}
              onLinkChange={changeLink}
              busy={busy}
              error={error}
              onDownload={(destination) => downloadFile(file, destination)}
            />
          ) : (
            <LinkPage
              value={input}
              onValueChange={changeLink}
              busy={busy}
              error={error}
            />
          )}
        </Dialog.Viewport>
        {page === "list" ? (
          <Dialog.Footer
            leading={
              listTotal > 0 && request.mode !== "transcript" ? (
                <span className={styles.total}>
                  About {formatBytes(listTotal)}
                </span>
              ) : null
            }
          >
            <Button
              type="submit"
              variant="primary"
              disabled={picked.length === 0}
            >
              {`Download ${picked.length}`}
            </Button>
          </Dialog.Footer>
        ) : null}
      </form>
    </Dialog.Popup>
  );
}
