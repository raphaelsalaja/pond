import type { ChangelogCategory } from "@pond/schema/changelog";
import {
  IconArrowRight,
  IconChevronDown,
  IconCircleArrowUp,
  IconCircleCheck,
  IconSparkle,
  IconTriangleWarning,
} from "@pond/icons";
import {
  Accordion,
  Button,
  Changelog,
  Dialog,
  Logo,
  Progress,
  Shimmer,
} from "@pond/ui";
import { useEffect, useState } from "react";
import { itemsOf, LAST_SEEN, LATEST, RELEASES } from "../fixture";
import { Frame } from "../frame";
import styles from "./styles.module.css";

type Phase = "available" | "downloading" | "ready" | "restarting";

const GROUPS = [
  { category: "important", label: "Important", Icon: IconTriangleWarning },
  { category: "new", label: "New", Icon: IconSparkle },
  { category: "improved", label: "Improved", Icon: IconCircleArrowUp },
  { category: "fixed", label: "Fixed", Icon: IconCircleCheck },
] satisfies {
  category: ChangelogCategory;
  label: string;
  Icon: typeof IconSparkle;
}[];

const DOWNLOAD_MS = 3200;

function merged(category: ChangelogCategory) {
  return RELEASES.flatMap((entry) =>
    itemsOf(entry, category).map((text) => ({ version: entry.version, text })),
  );
}

function useDownload(phase: Phase, setPhase: (phase: Phase) => void) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (phase !== "downloading") return;
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / DOWNLOAD_MS);
      setValue(Math.round(100 * (1 - (1 - t) ** 2)));
      if (t < 1) frame = requestAnimationFrame(tick);
      else setPhase("ready");
    });
    return () => cancelAnimationFrame(frame);
  }, [phase, setPhase]);

  return value;
}

export function UpdateWindow() {
  const [phase, setPhase] = useState<Phase>("available");
  const value = useDownload(phase, setPhase);

  return (
    <Frame.Stage>
      <Frame.Popup width={440} className={styles.popup}>
        <div className={styles.hero}>
          <Logo size={66} />
          <p className={styles.pill}>
            <span>{LAST_SEEN}</span>
            <IconArrowRight size={12} aria-hidden />
            <span className={styles.to}>{LATEST.version}</span>
          </p>
        </div>
        <Dialog.Content className={styles.content}>
          <Accordion.Root className={styles.groups}>
            {GROUPS.map(({ category, label, Icon }) => {
              const items = merged(category);
              if (items.length === 0) return null;
              return (
                <Accordion.Item
                  key={category}
                  value={category}
                  className={styles.group}
                >
                  <Accordion.Header>
                    <Accordion.Trigger className={styles.trigger}>
                      <span className={styles.icon} data-category={category}>
                        <Icon size={12} aria-hidden />
                      </span>
                      <span className={styles.label}>{label}</span>
                      <span className={styles.count}>{items.length}</span>
                      <IconChevronDown size={12} />
                    </Accordion.Trigger>
                  </Accordion.Header>
                  <Accordion.Panel className={styles.panel}>
                    <Changelog.List className={styles.list}>
                      {items.map((item) => (
                        <Changelog.Item key={item.text} className={styles.item}>
                          <span>{item.text}</span>
                          <span className={styles.version}>{item.version}</span>
                        </Changelog.Item>
                      ))}
                    </Changelog.List>
                  </Accordion.Panel>
                </Accordion.Item>
              );
            })}
          </Accordion.Root>
        </Dialog.Content>
        <Dialog.Footer layout="fill">
          <Button variant="secondary" disabled={phase !== "available"}>
            Remind Later
          </Button>
          <div className={styles.slot}>
            {phase === "available" ? (
              <Button key={phase} onClick={() => setPhase("downloading")}>
                Install
              </Button>
            ) : null}
            {phase === "downloading" ? (
              <Progress.Root
                key={phase}
                value={value}
                size="md"
                className={styles.meter}
                aria-label={`Downloading Pond ${LATEST.version}`}
              >
                <Progress.Track>
                  <Progress.Indicator />
                </Progress.Track>
              </Progress.Root>
            ) : null}
            {phase === "ready" ? (
              <Button key={phase} onClick={() => setPhase("restarting")}>
                Restart to Update
              </Button>
            ) : null}
            {phase === "restarting" ? (
              <Button key={phase} variant="secondary" disabled>
                <Shimmer.Root tone="neutral">Restarting</Shimmer.Root>
              </Button>
            ) : null}
          </div>
        </Dialog.Footer>
      </Frame.Popup>
    </Frame.Stage>
  );
}
