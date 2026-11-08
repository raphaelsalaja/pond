import { Checkbox } from "@pond/ui";
import type { DownloadRequest } from "@shared/downloader-contracts";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useId } from "react";
import { EnumSelect } from "@/shared/components/enum-select";
import { formatBytes } from "@/shared/lib/format";
import { Frame } from "../frame";
import {
  estimateByDuration,
  LIST_HEIGHTS,
  qualityLabel,
} from "../lib/estimate";
import { formatClock } from "../lib/range";
import { ModeToggle, OptionRow } from "../options";
import styles from "./styles.module.css";

export interface ListRow {
  url: string;
  title: string | null;
  duration: number | null;
  thumbnail: string | null;
  state: "loading" | "ready" | "failed";
  message?: string | undefined;
  selected: boolean;
}

interface ListPageProps {
  rows: readonly ListRow[];
  onToggle: (url: string, selected: boolean) => void;
  onToggleAll: (selected: boolean) => void;
  request: DownloadRequest;
  onRequestChange: (patch: Partial<DownloadRequest>) => void;
}

export function ListPage({
  rows,
  onToggle,
  onToggleAll,
  request,
  onRequestChange,
}: ListPageProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const id = useId();
  const selectable = rows.filter((row) => row.state !== "failed");
  const selected = selectable.filter((row) => row.selected).length;

  return (
    <div className={styles.page}>
      <ModeToggle
        value={request.mode}
        onValueChange={(mode) => onRequestChange({ mode })}
      />
      {request.mode === "video" ? (
        <OptionRow label="Quality" hint="Each download uses the closest match">
          <EnumSelect
            aria-label="Quality"
            value={request.maxHeight ?? 1080}
            onValueChange={(maxHeight) => onRequestChange({ maxHeight })}
            options={LIST_HEIGHTS.map((height) => ({
              value: height,
              label: qualityLabel(height),
            }))}
            align="end"
          />
        </OptionRow>
      ) : request.mode === "audio" ? (
        <OptionRow label="Format">
          <EnumSelect
            aria-label="Format"
            value={request.audioFormat}
            onValueChange={(audioFormat) => onRequestChange({ audioFormat })}
            options={[
              { value: "mp3" as const, label: "MP3" },
              { value: "m4a" as const, label: "M4A" },
            ]}
            align="end"
          />
        </OptionRow>
      ) : (
        <OptionRow label="Language" hint="Links without captions are skipped">
          <span className={styles.language}>English</span>
        </OptionRow>
      )}
      <div className={styles.list}>
        <label className={styles.all} htmlFor={`${id}-all`}>
          <Checkbox.Root
            id={`${id}-all`}
            size="sm"
            checked={selected > 0 && selected === selectable.length}
            indeterminate={selected > 0 && selected < selectable.length}
            onCheckedChange={(checked) => onToggleAll(checked)}
          >
            <Checkbox.Indicator />
          </Checkbox.Root>
          <span>
            {selected} of {selectable.length} selected
          </span>
        </label>
        <ul className={styles.rows}>
          <AnimatePresence initial={false}>
            {rows.map((row, index) => {
              const checkboxId = `${id}-${index}`;
              const size =
                row.state === "ready"
                  ? estimateByDuration(row.duration, request)
                  : null;
              return (
                <motion.li
                  key={row.url}
                  className={styles.row}
                  data-failed={row.state === "failed" || undefined}
                  layout={reduceMotion ? false : "position"}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.18 }}
                >
                  <label className={styles.pick} htmlFor={checkboxId}>
                    <Checkbox.Root
                      id={checkboxId}
                      size="sm"
                      checked={row.selected && row.state !== "failed"}
                      disabled={row.state === "failed"}
                      onCheckedChange={(checked) => onToggle(row.url, checked)}
                    >
                      <Checkbox.Indicator />
                    </Checkbox.Root>
                    <Frame className={styles.thumb} src={row.thumbnail} />
                    <span className={styles.text}>
                      <span
                        className={styles.title}
                        title={row.title ?? row.url}
                      >
                        {row.state === "loading" && !row.title ? (
                          <span className={styles.placeholder} />
                        ) : (
                          (row.title ?? row.url)
                        )}
                      </span>
                      <span className={styles.meta}>
                        {row.state === "failed"
                          ? row.message
                          : [
                              row.duration ? formatClock(row.duration) : null,
                              size ? `About ${formatBytes(size)}` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                      </span>
                    </span>
                  </label>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      </div>
    </div>
  );
}
