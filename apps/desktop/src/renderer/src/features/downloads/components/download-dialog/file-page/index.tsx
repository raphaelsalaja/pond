import { IconFile, IconGlobe } from "@pond/icons";
import type { DownloadFileProbe } from "@shared/downloader-contracts";
import { useState } from "react";
import { formatBytes } from "@/shared/lib/format";
import { Columns } from "../columns";
import { DownloadOptions } from "../export-options";
import { type ExportDestination, saveToHint } from "../export-options/settings";
import { Frame } from "../frame";
import { useExportFolder } from "../lib/export-folder";
import { type LinkError, LinkField, LinkStatus } from "../link-page";
import { Summary } from "../summary";
import styles from "./styles.module.css";

function fileTypeOf(probe: DownloadFileProbe): string {
  const extension = /\.([a-z0-9]{1,8})$/i.exec(probe.name)?.[1];
  if (extension) return extension.toUpperCase();
  const subtype = probe.mimeType?.split("/")[1]?.split("+")[0];
  return subtype ? subtype.toUpperCase() : "File";
}

function detailsOf(probe: DownloadFileProbe): string {
  const type = fileTypeOf(probe);
  return probe.size ? `${type}, ${formatBytes(probe.size)}` : type;
}

interface FilePageProps {
  probe: DownloadFileProbe;
  link: string;
  onLinkChange: (value: string) => void;
  busy: boolean;
  error: LinkError | null;
  onDownload: (destination: ExportDestination) => void;
}

/** A link straight to a file: Pond fetches it as it is. */
export function FilePage({
  probe,
  link,
  onLinkChange,
  busy,
  error,
  onDownload,
}: FilePageProps) {
  const folder = useExportFolder();
  const [destination, setDestination] = useState<ExportDestination>("library");
  const image = probe.mimeType?.startsWith("image/") ?? false;
  return (
    <Columns.Root>
      <Columns.Main>
        <LinkField value={link} onValueChange={onLinkChange} error={error} />
        <LinkStatus busy={busy} error={error} />
        {image ? (
          <div className={styles.stage}>
            <Frame className={styles.image} src={probe.url} fit="contain" />
          </div>
        ) : (
          <div className={styles.card}>
            <IconFile size={40} className={styles.icon} />
            <span className={styles.name}>{probe.name}</span>
            <span className={styles.details}>{detailsOf(probe)}</span>
          </div>
        )}
      </Columns.Main>
      <Columns.Side>
        <Summary.Root>
          <Summary.Fields>
            <DownloadOptions.Field label="From" icon={<IconGlobe size={16} />}>
              <Summary.Value>{probe.site}</Summary.Value>
            </DownloadOptions.Field>
            <DownloadOptions.Field
              label="File"
              icon={<IconFile size={16} />}
              hint={detailsOf(probe)}
            >
              <Summary.Value>{probe.name}</Summary.Value>
            </DownloadOptions.Field>
            <DownloadOptions.SaveTo
              value={destination}
              onValueChange={setDestination}
              hint={saveToHint({
                destination,
                folder: folder.name,
                existingSaveId: probe.existingSaveId,
                copies: "the file",
              })}
              onChooseFolder={() =>
                void folder.choose().then((picked) => {
                  if (picked) setDestination("file");
                })
              }
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
