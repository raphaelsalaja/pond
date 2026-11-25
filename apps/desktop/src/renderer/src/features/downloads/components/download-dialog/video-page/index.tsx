import type {
  DownloadRequest,
  DownloadSingleProbe,
} from "@shared/downloader-contracts";
import { useQuery } from "@tanstack/react-query";
import { Columns } from "../columns";
import { Editor, useEditor } from "../editor";
import type { ExportSettings } from "../export-options/settings";
import { clipOf } from "../lib/clip";
import { LinkField, LinkStatus } from "../link-page";
import type { LinkError } from "../link-page";
import { Panel } from "../panel";

const FRAME_COUNT = 12;

interface VideoPageProps {
  probe: DownloadSingleProbe;
  request: DownloadRequest;
  onRequestChange: (patch: Partial<DownloadRequest>) => void;
  link: string;
  onLinkChange: (value: string) => void;
  busy: boolean;
  error: LinkError | null;
  initialSettings?: Partial<ExportSettings>;
}

export function VideoPage({
  probe,
  request,
  onRequestChange,
  link,
  onLinkChange,
  busy,
  error,
  initialSettings,
}: VideoPageProps) {
  const duration = probe.duration;
  const trimmable = duration !== null && duration >= 2 && !probe.isLive;

  const frames = useQuery({
    queryKey: ["downloader.frames", probe.url],
    enabled: trimmable && !probe.storyboard && probe.videoOptions.length > 0,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async () =>
      (
        await window.pond.query("downloader.frames", {
          url: probe.url,
          count: FRAME_COUNT,
        })
      ).frames,
  });

  const clip = clipOf(
    probe,
    (frames.data ?? []).filter((frame): frame is string => !!frame),
    request,
    onRequestChange,
  );
  const editor = useEditor(clip);

  return (
    <Columns.Root>
      <Columns.Main>
        <LinkField value={link} onValueChange={onLinkChange} error={error} />
        <LinkStatus busy={busy} error={error} />
        <Editor.Root editor={editor}>
          <Editor.Screen editor={editor} />
          <Editor.Panel>
            <Editor.Controls editor={editor} />
            {trimmable ? <Editor.Dock editor={editor} /> : null}
          </Editor.Panel>
        </Editor.Root>
      </Columns.Main>
      <Columns.Side>
        <Panel clip={clip} initialSettings={initialSettings} />
      </Columns.Side>
    </Columns.Root>
  );
}
