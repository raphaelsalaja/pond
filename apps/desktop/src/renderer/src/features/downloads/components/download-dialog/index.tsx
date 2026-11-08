import { Button, Dialog } from "@pond/ui";
import {
  type DownloadProbeResult,
  type DownloadRequest,
  type DownloadSingleProbe,
  extractLinks,
} from "@shared/downloader-contracts";
import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  downloadDialog,
  useDownloadDialog,
} from "@/features/downloads/state/download-dialog";
import { getSourceDef, startConnect } from "@/features/sources";
import { getAppRouter } from "@/shared/lib/app-router";
import { formatBytes } from "@/shared/lib/format";
import { notify } from "@/shared/lib/toast";
import { estimateByDuration } from "./lib/estimate";
import { type LinkError, LinkPage } from "./link-page";
import { ListPage, type ListRow } from "./list-page";
import { SinglePage } from "./single-page";
import styles from "./styles.module.css";

const PROBE_CONCURRENCY = 3;
const READ_FAILED = "Pond couldn't read this link. Check it and try again.";

type Page = "link" | "single" | "list";

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

function singleRequest(probe: DownloadSingleProbe): DownloadRequest {
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
  if (result.ok) return { message: READ_FAILED };
  if (result.reason !== "sign-in" || !result.source)
    return { message: result.message };
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

function DownloadFlow({ links }: { links: string[] }) {
  const [page, setPage] = useState<Page>("link");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<LinkError | null>(null);
  const [single, setSingle] = useState<DownloadSingleProbe | null>(null);
  const [listTitle, setListTitle] = useState<string | null>(null);
  const [rows, setRows] = useState<ListRow[]>([]);
  const [request, setRequest] = useState<DownloadRequest>(LIST_REQUEST);
  const attempt = useRef(0);

  const patchRequest = (patch: Partial<DownloadRequest>) =>
    setRequest((current) => ({ ...current, ...patch }));

  const openList = (urls: string[], title: string | null = null) => {
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
        const result = await probe(url);
        if (attempt.current !== id) return;
        setRows((current) =>
          current.flatMap((row): ListRow[] => {
            if (row.url !== url) return [row];
            if (!result.ok)
              return [{ ...row, state: "failed", message: result.message }];
            const found = result.probe;
            if (found.kind === "playlist")
              return found.entries
                .filter((entry) => !current.some((it) => it.url === entry.url))
                .map((entry) => ({
                  ...entry,
                  state: "ready",
                  selected: true,
                }));
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
    for (let i = 0; i < Math.min(PROBE_CONCURRENCY, urls.length); i++)
      void work();
  };

  const read = async (urls: string[]) => {
    if (urls.length === 0) {
      setError({ message: "Paste a link that starts with https://." });
      return;
    }
    if (urls.length > 1) {
      openList(urls);
      return;
    }
    attempt.current += 1;
    const id = attempt.current;
    setBusy(true);
    setError(null);
    const result = await probe(urls[0] ?? "");
    if (attempt.current !== id) return;
    setBusy(false);
    if (!result.ok) {
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
          state: "ready",
          selected: true,
        })),
      );
      setRequest(LIST_REQUEST);
      setPage("list");
      return;
    }
    setSingle(found);
    setRequest(singleRequest(found));
    setPage("single");
  };

  const pasteFromClipboard = async () => {
    const { urls } = await window.pond.query("downloader.clipboardLinks", {});
    if (urls.length === 0) {
      setError({
        message:
          "Your clipboard doesn't have a link. Copy one, then try again.",
      });
      return;
    }
    setInput(urls.join("\n"));
    void read(urls);
  };

  const opened = useRef<string[] | null>(null);
  useEffect(() => {
    if (opened.current === links) return;
    opened.current = links;
    if (links.length > 0) {
      setInput(links.join("\n"));
      void read(links);
      return;
    }
    void window.pond
      .query("downloader.clipboardLinks", {})
      .then(({ urls }) => {
        if (urls.length === 1 && urls[0])
          setInput((current) => current || (urls[0] ?? ""));
      })
      .catch(() => {});
  });

  const start = () => {
    const urls = rows
      .filter((row) => row.selected && row.state === "ready")
      .map((row) => row.url);
    if (urls.length === 0) return;
    const label = listTitle;
    downloadDialog.close();
    void window.pond
      .query("downloader.start", { urls, request })
      .then(({ ids, failed }) => {
        if (ids.length === 0) {
          notify({
            id: "download-start",
            title: "Download didn't start",
            description: "Pond couldn't add this link. Try again.",
          });
          return;
        }
        notify({
          id: "download-start",
          title:
            ids.length === 1
              ? "Downloading"
              : `Downloading ${ids.length} links`,
          ...(failed.length
            ? {
                description: `${failed.length} ${failed.length === 1 ? "link" : "links"} couldn't start.`,
              }
            : label
              ? { description: label }
              : {}),
          action: {
            label: "Show Downloads",
            onClick: () => getAppRouter()?.history.push("/downloads"),
          },
        });
      })
      .catch(() =>
        notify({
          id: "download-start",
          title: "Download didn't start",
          description: "Pond couldn't add this link. Try again.",
        }),
      );
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (page === "link") {
      if (!busy) void read(extractLinks(input));
      return;
    }
    if (page === "list") start();
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
    page === "single"
      ? (single?.title ?? "Download")
      : page === "list"
        ? (listTitle ?? `${rows.length} Links`)
        : "Download";

  return (
    <Dialog.Popup
      className={styles.popup}
      pageId={page}
      depth={page === "link" ? 0 : 1}
      data-page={page}
    >
      <form onSubmit={submit}>
        <Dialog.Header className={styles.header}>
          {page !== "link" ? <Dialog.Back onClick={back} /> : null}
          <Dialog.Title className={styles.title}>{title}</Dialog.Title>
          <Dialog.Close />
        </Dialog.Header>
        <Dialog.Viewport>
          {page === "single" && single ? (
            <SinglePage
              probe={single}
              request={request}
              onRequestChange={patchRequest}
            />
          ) : page === "list" ? (
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
          ) : (
            <LinkPage
              value={input}
              onValueChange={(value) => {
                setInput(value);
                setError(null);
              }}
              onPaste={() => void pasteFromClipboard()}
              busy={busy}
              error={error}
            />
          )}
        </Dialog.Viewport>
        {page === "single" ? null : (
          <Dialog.Footer
            leading={
              page === "list" &&
              listTotal > 0 &&
              request.mode !== "transcript" ? (
                <span className={styles.total}>
                  About {formatBytes(listTotal)}
                </span>
              ) : null
            }
          >
            {page === "link" ? (
              <>
                <Dialog.Cancel />
                <Button
                  type="submit"
                  variant="primary"
                  disabled={busy || input.trim() === ""}
                >
                  Continue
                </Button>
              </>
            ) : (
              <Button
                type="submit"
                variant="primary"
                disabled={picked.length === 0}
              >
                {`Download ${picked.length}`}
              </Button>
            )}
          </Dialog.Footer>
        )}
      </form>
    </Dialog.Popup>
  );
}
