import { IconChatBubble, IconCircleInfo, IconSliders } from "@pond/icons";
import { PaneHeader } from "../pane-header";
import styles from "./styles.module.css";

export type InspectorField =
  | { label: string; value: string; from?: string }
  | { label: string; chips: ReadonlyArray<string> };

const DEFAULT_FIELDS: ReadonlyArray<InspectorField> = [
  { label: "Title", value: "Sunset over the bay", from: "IMG_4821.jpg" },
  { label: "Tags", chips: ["Sunset", "Beach", "Golden Hour"] },
];

export function Inspector({
  fields = DEFAULT_FIELDS,
}: {
  fields?: ReadonlyArray<InspectorField>;
}) {
  return (
    <div className={styles.inspector}>
      <PaneHeader>
        <span className={styles.tabs}>
          <span data-active>
            <IconSliders />
          </span>
          <span>
            <IconCircleInfo />
          </span>
          <span>
            <IconChatBubble />
          </span>
        </span>
      </PaneHeader>
      <div className={styles.fields}>
        {fields.map((field) => (
          <span key={field.label} className={styles.field}>
            {field.label}
            {"chips" in field ? (
              <span className={styles.chips}>
                {field.chips.map((chip) => (
                  <span key={chip}>{chip}</span>
                ))}
              </span>
            ) : (
              <span className={styles.input}>
                {field.from ? (
                  <span className={styles.from}>{field.from}</span>
                ) : null}
                <span
                  className={styles.value}
                  data-generated={field.from ? true : undefined}
                >
                  {field.value}
                </span>
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
