import { IconGlobe, IconImage, IconText } from "@pond/icons";
import type { DownloadPostProbe } from "@shared/downloader-contracts";
import { useState } from "react";
import { Columns } from "../columns";
import { DownloadOptions } from "../export-options";
import { saveToHint } from "../export-options/settings";
import type { ExportDestination } from "../export-options/settings";
import { Frame } from "../frame";
import { useExportFolder } from "../lib/export-folder";
import { LinkField, LinkStatus } from "../link-page";
import type { LinkError } from "../link-page";
import { Summary } from "../summary";
import styles from "./styles.module.css";

const MOSAIC_LIMIT = 4;
const LIBRARY_ONLY: ReadonlyArray<ExportDestination> = ["file", "clipboard"];

function includesOf(probe: DownloadPostProbe): string {
  if (probe.source === "web") {
    return probe.images.length > 0
      ? "The page and its cover image"
      : "The page";
  }
  const count = probe.images.length;
  const parts = [
    count === 1 ? "1 image" : count > 1 ? `${count} images` : null,
    probe.text ? "text" : null,
  ].filter((part) => part !== null);
  if (parts.length === 0) return "The page link";
  const joined = parts.join(" and ");
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

/** Up to four images in the post's own grid, with the rest counted on the last. */
function Mosaic({ images }: { images: Array<string> }) {
  const shown = images.slice(0, MOSAIC_LIMIT);
  const more = images.length - shown.length;
  return (
    <div className={styles.stage} data-count={shown.length}>
      {shown.map((src, index) => (
        <span key={src} className={styles.cell}>
          <Frame
            className={styles.image}
            src={src}
            fit={shown.length === 1 ? "contain" : "cover"}
          />
          {more > 0 && index === shown.length - 1 ? (
            <span className={styles.more}>+{more}</span>
          ) : null}
        </span>
      ))}
    </div>
  );
}

function Card({ probe }: { probe: DownloadPostProbe }) {
  const cover = probe.images[0];
  return (
    <div className={styles.card}>
      {cover ? <Frame className={styles.cover} src={cover} /> : null}
      <span className={styles.site}>{probe.site}</span>
      <span className={styles.heading}>{probe.title}</span>
      {probe.text && probe.text !== probe.title ? (
        <p className={styles.text}>{probe.text}</p>
      ) : null}
    </div>
  );
}

interface PostPageProps {
  probe: DownloadPostProbe;
  link: string;
  onLinkChange: (value: string) => void;
  busy: boolean;
  error: LinkError | null;
  onDownload: (destination: ExportDestination) => void;
}

/** A post, page or article with no media for yt-dlp; Pond's importer saves it as it is. */
export function PostPage({
  probe,
  link,
  onLinkChange,
  busy,
  error,
  onDownload,
}: PostPageProps) {
  /** A web page saves as the page itself; its image is only a cover. */
  const images = probe.source !== "web" && probe.images.length > 0;
  const folder = useExportFolder();
  const [destination, setDestination] = useState<ExportDestination>("library");
  return (
    <Columns.Root>
      <Columns.Main>
        <LinkField value={link} onValueChange={onLinkChange} error={error} />
        <LinkStatus busy={busy} error={error} />
        {images ? <Mosaic images={probe.images} /> : <Card probe={probe} />}
      </Columns.Main>
      <Columns.Side>
        <Summary.Root>
          <Summary.Fields>
            <DownloadOptions.Field label="From" icon={<IconGlobe size={16} />}>
              <Summary.Value>
                {probe.author ? `${probe.author} on ${probe.site}` : probe.site}
              </Summary.Value>
            </DownloadOptions.Field>
            <DownloadOptions.Field
              label="Includes"
              icon={<IconImage size={16} />}
            >
              <Summary.Value>{includesOf(probe)}</Summary.Value>
            </DownloadOptions.Field>
            {images && probe.text ? (
              <DownloadOptions.Field label="Text" icon={<IconText size={16} />}>
                <p className={styles.excerpt}>{probe.text}</p>
              </DownloadOptions.Field>
            ) : null}
            <DownloadOptions.SaveTo
              value={destination}
              onValueChange={setDestination}
              hint={saveToHint({
                destination,
                folder: folder.name,
                existingSaveId: probe.existingSaveId,
                copies: probe.images.length === 1 ? "the image" : "the images",
              })}
              onChooseFolder={() =>
                void folder.choose().then((picked) => {
                  if (picked) setDestination("file");
                })
              }
              unavailable={images ? [] : LIBRARY_ONLY}
            />
          </Summary.Fields>
          <Summary.Foot>
            <Summary.Download onClick={() => onDownload(destination)} />
          </Summary.Foot>
        </Summary.Root>
      </Columns.Side>
    </Columns.Root>
  );
}
