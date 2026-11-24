import { Badge, Button, Changelog, Dialog } from "@pond/ui";
import { useState } from "react";
import { Clip } from "../clip";
import { formatDate, itemsOf, RELEASES } from "../fixture";
import { Frame } from "../frame";
import styles from "./styles.module.css";

export function SplitStepper() {
  const [step, setStep] = useState(0);
  const entry = RELEASES[step] ?? RELEASES[0];
  if (!entry) return null;
  const last = step === RELEASES.length - 1;

  return (
    <Frame.Stage>
      <Frame.Popup width={800} className={styles.popup}>
        <div className={styles.split}>
          <div key={entry.version} className={styles.copy}>
            <div className={styles.eyebrow}>
              {step === 0 ? <Badge tone="accent">New</Badge> : null}
              <span>
                Pond {entry.version} · {formatDate(entry.date)}
              </span>
            </div>
            <Dialog.Title className={styles.title}>{entry.title}</Dialog.Title>
            <Dialog.Description>{entry.summary}</Dialog.Description>
            <Changelog.List className={styles.list}>
              {itemsOf(entry, "new")
                .slice(0, 3)
                .map((item) => (
                  <Changelog.Item key={item}>{item}</Changelog.Item>
                ))}
            </Changelog.List>
          </div>
          <div className={styles.media}>
            <Clip />
          </div>
        </div>
        <Dialog.Footer
          leading={
            <div className={styles.dots}>
              {RELEASES.map((release, index) => (
                <button
                  key={release.version}
                  type="button"
                  className={styles.dot}
                  data-active={index === step || undefined}
                  aria-label={`Pond ${release.version}`}
                  onClick={() => setStep(index)}
                />
              ))}
            </div>
          }
        >
          {step > 0 ? (
            <Button variant="secondary" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          ) : null}
          <Dialog.Confirm
            onClick={() => setStep(last ? 0 : step + 1)}
          >
            {last ? "Done" : "Next"}
          </Dialog.Confirm>
        </Dialog.Footer>
        <Frame.Close />
      </Frame.Popup>
    </Frame.Stage>
  );
}
