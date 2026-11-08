import { IconMusic, IconText, IconVideo } from "@pond/icons";
import { Toggle, ToggleGroup } from "@pond/ui";
import type { DownloadMode } from "@shared/downloader-contracts";
import type { ReactNode } from "react";
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

interface ModeToggleProps {
  value: DownloadMode;
  onValueChange: (mode: DownloadMode) => void;
  unavailable?: Partial<Record<DownloadMode, boolean>>;
}

export function ModeToggle({
  value,
  onValueChange,
  unavailable = {},
}: ModeToggleProps) {
  return (
    <ToggleGroup
      aria-label="Download As"
      className={styles.modes}
      value={[value]}
      onValueChange={(next) => {
        const mode = MODES.find((item) => item.value === next[0]);
        if (mode) onValueChange(mode.value);
      }}
    >
      {MODES.map((mode) => (
        <Toggle
          key={mode.value}
          type="button"
          size="md"
          value={mode.value}
          disabled={unavailable[mode.value] ?? false}
          className={styles.mode}
        >
          {mode.icon}
          {mode.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}

interface OptionRowProps extends React.ComponentPropsWithoutRef<"div"> {
  label: string;
  hint?: string | undefined;
}

export function OptionRow({ label, hint, children, ...props }: OptionRowProps) {
  return (
    <div className={styles.row} {...props}>
      <span className={styles.text}>
        <span className={styles.label}>{label}</span>
        {hint ? <span className={styles.hint}>{hint}</span> : null}
      </span>
      {children}
    </div>
  );
}
