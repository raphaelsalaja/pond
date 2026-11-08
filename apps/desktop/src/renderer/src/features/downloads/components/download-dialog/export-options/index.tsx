import {
  IconAperture,
  IconClipboard,
  IconDownload,
  IconFile,
  IconFileExport,
  IconFileZip,
  IconFolder,
  IconGauge,
  IconGlobe,
  IconMediaLibrary,
  IconMusic,
  IconText,
  IconVideo,
} from "@pond/icons";
import { Button, Toggle, ToggleGroup } from "@pond/ui";
import type { DownloadMode } from "@shared/downloader-contracts";
import type { ReactNode } from "react";
import { EnumSelect } from "@/shared/components/enum-select";
import type { Clip } from "../lib/clip";
import { qualityLabel } from "../lib/estimate";
import {
  type CompressionLevel,
  type Container,
  type ExportDestination,
  GIF_FPS,
  GIF_MAX_SECONDS,
  gifAllowed,
  type Settings,
  type TranscriptFormat,
} from "./settings";
import styles from "./styles.module.css";

const MODES: readonly {
  value: DownloadMode;
  label: string;
  icon: ReactNode;
}[] = [
  { value: "video", label: "Video", icon: <IconVideo size={16} /> },
  { value: "audio", label: "Audio", icon: <IconMusic size={16} /> },
  { value: "transcript", label: "Transcript", icon: <IconText size={16} /> },
];

const AUDIO_FORMATS = ["mp3", "m4a"] as const;

interface FieldProps {
  label: string;
  icon: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}

function Field({ label, icon, hint, children }: FieldProps) {
  return (
    <div className={styles.field}>
      <span className={styles.label}>
        {icon}
        {label}
      </span>
      {children}
      {hint ? <span className={styles.hint}>{hint}</span> : null}
    </div>
  );
}

/** Video, Audio or Transcript as tiles. */
function Mode({ clip }: { clip: Clip }) {
  return (
    <Field label="Download As" icon={<IconDownload size={16} />}>
      <ToggleGroup
        aria-label="Download As"
        variant="tiles"
        className={styles.tiles}
        value={[clip.request.mode]}
        onValueChange={(next) => {
          const mode = MODES.find((item) => item.value === next[0]);
          if (mode) clip.patch({ mode: mode.value });
        }}
      >
        {MODES.map((mode) => (
          <Toggle
            key={mode.value}
            type="button"
            value={mode.value}
            disabled={
              mode.value === "video"
                ? clip.probe.videoOptions.length === 0
                : mode.value === "transcript" &&
                  clip.probe.captions.length === 0
            }
          >
            {mode.icon}
            {mode.label}
          </Toggle>
        ))}
      </ToggleGroup>
    </Field>
  );
}

interface TileOption<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

interface TilesProps<T extends string> {
  label: string;
  options: readonly TileOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
}

function Tiles<T extends string>({
  label,
  options,
  value,
  onValueChange,
}: TilesProps<T>) {
  return (
    <ToggleGroup
      aria-label={label}
      variant="tiles"
      className={styles.tiles}
      value={[value]}
      onValueChange={(next) => {
        const option = options.find((item) => item.value === next[0]);
        if (option) onValueChange(option.value);
      }}
    >
      {options.map((option) => (
        <Toggle
          key={option.value}
          type="button"
          value={option.value}
          disabled={option.disabled}
        >
          {option.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}

interface SettingsProps {
  clip: Clip;
  settings: Settings;
}

const TRANSCRIPT_FORMATS: readonly TileOption<TranscriptFormat>[] = [
  { value: "txt", label: "Text" },
  { value: "srt", label: "SRT" },
  { value: "vtt", label: "VTT" },
];

/** Container for video, codec for audio, file type for a transcript. */
function Format({ clip, settings }: SettingsProps) {
  const { request, patch } = clip;
  const icon = <IconFile size={16} />;

  if (request.mode === "audio") {
    return (
      <Field label="Format" icon={icon}>
        <Tiles
          label="Format"
          options={AUDIO_FORMATS.map((format) => ({
            value: format,
            label: format.toUpperCase(),
          }))}
          value={request.audioFormat}
          onValueChange={(audioFormat) => patch({ audioFormat })}
        />
      </Field>
    );
  }

  if (request.mode === "transcript") {
    return (
      <Field label="Format" icon={icon}>
        <Tiles
          label="Format"
          options={TRANSCRIPT_FORMATS}
          value={settings.value.transcript}
          onValueChange={(transcript) => settings.patch({ transcript })}
        />
      </Field>
    );
  }

  const long = !gifAllowed(clip);
  const containers: readonly TileOption<Container>[] = [
    { value: "mp4", label: "MP4" },
    { value: "webm", label: "WebM" },
    { value: "gif", label: "GIF", disabled: long },
  ];
  return (
    <Field
      label="Format"
      icon={icon}
      hint={
        long && clip.duration > 0
          ? `Trim to ${GIF_MAX_SECONDS} seconds for GIF`
          : null
      }
    >
      <Tiles
        label="Format"
        options={containers}
        value={
          long && settings.value.container === "gif"
            ? "mp4"
            : settings.value.container
        }
        onValueChange={(container) => settings.patch({ container })}
      />
    </Field>
  );
}

/** Resolution tiles from the heights the site offers. */
function Quality({ clip }: { clip: Clip }) {
  const { probe, request, patch } = clip;
  const height = request.maxHeight ?? probe.videoOptions[0]?.height ?? 1080;
  return (
    <Field label="Quality" icon={<IconGauge size={16} />}>
      <Tiles
        label="Quality"
        options={probe.videoOptions.map((item) => ({
          value: String(item.height),
          label: qualityLabel(item.height),
        }))}
        value={String(height)}
        onValueChange={(next) => patch({ maxHeight: Number(next) })}
      />
    </Field>
  );
}

const FPS_STEPS = [60, 30, 24, 15, 12];

/** The source rate first, then common lower rates. */
function FrameRate({ clip, settings }: SettingsProps) {
  const { probe, request } = clip;
  const height = request.maxHeight ?? probe.videoOptions[0]?.height;
  const source =
    probe.videoOptions.find((item) => item.height === height)?.fps ?? 30;
  const base =
    settings.value.container === "gif" && gifAllowed(clip) ? GIF_FPS : source;
  const steps = FPS_STEPS.filter((fps) => fps < source && fps !== base);
  return (
    <Field label="Frame Rate" icon={<IconAperture size={16} />}>
      <EnumSelect
        aria-label="Frame Rate"
        className={styles.rate}
        value={settings.value.fps ? String(settings.value.fps) : "source"}
        onValueChange={(next) =>
          settings.patch({ fps: next === "source" ? null : Number(next) })
        }
        options={[
          { value: "source", label: `${base} fps` },
          ...steps.map((fps) => ({ value: String(fps), label: `${fps} fps` })),
        ]}
      />
    </Field>
  );
}

const COMPRESSIONS: readonly (TileOption<CompressionLevel> & {
  hint: string;
})[] = [
  {
    value: "original",
    label: "Original",
    hint: "Keeps the file the site serves. No re-encode, so it finishes first.",
  },
  {
    value: "high",
    label: "High",
    hint: "Re-encodes with little visible loss. Good for editing later.",
  },
  {
    value: "balanced",
    label: "Balanced",
    hint: "About half the size. Good for sharing in chats and posts.",
  },
  {
    value: "small",
    label: "Small",
    hint: "Smallest file. Expect softer detail in fast motion.",
  },
];

/** How hard to re-encode after the download. */
function Compression({ settings }: { settings: Settings }) {
  const current = COMPRESSIONS.find(
    (item) => item.value === settings.value.compression,
  );
  return (
    <Field
      label="Compression"
      icon={<IconFileZip size={16} />}
      hint={current?.hint}
    >
      <Tiles
        label="Compression"
        options={COMPRESSIONS}
        value={settings.value.compression}
        onValueChange={(compression) => settings.patch({ compression })}
      />
    </Field>
  );
}

/** Caption track for a transcript. */
function Language({ clip }: { clip: Clip }) {
  const { probe, request, patch } = clip;
  const caption = probe.captions.find(
    (item) => item.lang === request.subtitleLang,
  );
  return (
    <Field
      label="Language"
      icon={<IconGlobe size={16} />}
      hint={caption?.automatic ? "Generated by the site" : null}
    >
      <EnumSelect
        aria-label="Language"
        className={styles.select}
        value={request.subtitleLang ?? ""}
        onValueChange={(subtitleLang) => patch({ subtitleLang })}
        options={probe.captions.map((item) => ({
          value: item.lang,
          label: item.name,
        }))}
      />
    </Field>
  );
}

const DESTINATIONS: readonly TileOption<ExportDestination>[] = [
  {
    value: "library",
    label: (
      <>
        <IconMediaLibrary size={16} />
        Library
      </>
    ),
  },
  {
    value: "file",
    label: (
      <>
        <IconFile size={16} />
        File
      </>
    ),
  },
  {
    value: "clipboard",
    label: (
      <>
        <IconClipboard size={16} />
        Clipboard
      </>
    ),
  },
];

interface DestinationProps {
  clip: Clip;
  settings: Settings;
  folder: string | null;
  onChooseFolder: () => void;
}

function destinationHint(
  clip: Clip,
  destination: ExportDestination,
  folder: string | null,
): string | null {
  if (destination === "library")
    return clip.probe.existingSaveId
      ? "Already in your library. This adds to the same save."
      : "Adds a save to your library.";
  if (destination === "clipboard")
    return clip.request.mode === "transcript"
      ? "Copies the text, ready to paste."
      : "Copies the file, ready to paste.";
  return folder ? `Saves to ${folder}.` : null;
}

/** Where the finished file goes. */
function Destination({
  clip,
  settings,
  folder,
  onChooseFolder,
}: DestinationProps) {
  const { destination } = settings.value;
  return (
    <Field
      label="Export To"
      icon={<IconFileExport size={16} />}
      hint={destinationHint(clip, destination, folder)}
    >
      <div className={styles.destination}>
        <Tiles
          label="Export To"
          options={DESTINATIONS}
          value={destination}
          onValueChange={(next) => settings.patch({ destination: next })}
        />
        <Button
          icon
          size="md"
          variant="tertiary"
          aria-label="Choose Folder"
          disabled={destination !== "file"}
          onClick={onChooseFolder}
        >
          <IconFolder size={16} />
        </Button>
      </div>
    </Field>
  );
}

export const DownloadOptions = {
  Mode,
  Format,
  Quality,
  FrameRate,
  Compression,
  Language,
  Destination,
};
