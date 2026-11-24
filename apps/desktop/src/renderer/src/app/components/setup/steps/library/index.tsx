import { IconFolder } from "@pond/icons";
import { Button, Field, Input, Toggle, ToggleGroup } from "@pond/ui";
import { formatPlural } from "@/shared/lib/format";
import { prettyPath } from "@/shared/lib/pretty-path";
import type { StepProps } from "../../model";
import styles from "./styles.module.css";

const LINKS = [
  {
    label: "Star on GitHub",
    url: "https://github.com/raphaelsalaja/pond",
  },
  {
    label: "Follow on X",
    url: "https://x.com/raphaelsalaja",
  },
  {
    label: "Buy Me a Coffee",
    url: "https://buymeacoffee.com/raphaelsalaja",
  },
] as const;

function Location({ profile, library, choices, update }: StepProps) {
  const unchosen =
    profile === "existing" && choices.libraryLocation === library.parent;
  const location = unchosen
    ? "Choose Folder"
    : prettyPath(choices.libraryLocation);
  return (
    <Button
      size="md"
      variant="secondary"
      className={styles.location}
      aria-label={
        unchosen ? "Choose a folder" : `Library location: ${location}`
      }
      onClick={async () => {
        const result = await window.pond.query("library.pickFolder", {});
        if (result.ok) {
          update({ libraryLocation: result.path });
        }
      }}
    >
      <IconFolder size={16} aria-hidden />
      <span className={styles.path}>{location}</span>
    </Button>
  );
}

function savesLabel(count: number): string {
  return formatPlural(count, { one: "Save", other: "Saves" });
}

export function Library(props: StepProps) {
  const { profile, library, choices, update } = props;

  if (profile === "existing") {
    return (
      <div className={styles.form}>
        <div className={styles.card}>
          <span className={styles.name}>{library.name}</span>
          <span className={styles.stats}>{savesLabel(library.saves)}</span>
          <span className={styles.path}>{prettyPath(library.path)}</span>
        </div>
        <ToggleGroup
          aria-label="Library location"
          className={styles.choice}
          value={[choices.moveLibrary ? "move" : "keep"]}
          onValueChange={(value) => {
            const next = value[0];
            if (next) {
              update({
                moveLibrary: next === "move",
                libraryLocation: library.parent,
              });
            }
          }}
        >
          <Toggle type="button" size="sm" value="keep">
            Keep Here
          </Toggle>
          <Toggle type="button" size="sm" value="move">
            Move Library
          </Toggle>
        </ToggleGroup>
        {choices.moveLibrary ? <Location {...props} /> : null}
      </div>
    );
  }

  return (
    <div className={styles.row}>
      <Field.Root className={styles.field}>
        <Field.Label className={styles["sr-only"]}>Library Name</Field.Label>
        <Input.Root size="md" className={styles.input}>
          <Field.Control
            render={<Input.Field />}
            value={choices.libraryName}
            onChange={(event) =>
              update({ libraryName: event.currentTarget.value })
            }
            placeholder={library.name}
            autoComplete="off"
            spellCheck={false}
          />
        </Input.Root>
      </Field.Root>
      <Location {...props} />
    </div>
  );
}

export function Links() {
  return LINKS.map(({ label, url }) => (
    <Button
      key={url}
      size="sm"
      variant="ghost"
      onClick={() => void window.pond.openExternal(url)}
    >
      {label}
    </Button>
  ));
}
