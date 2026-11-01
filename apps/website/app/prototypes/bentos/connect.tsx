"use client";

import { IconFolderFill } from "@pond/icons";
import {
  IconBrandArena,
  IconBrandCosmos,
  IconPinterest,
  IconSourceLocal,
  IconXTwitter,
  IconYoutube,
} from "@pond/icons/social-media";
import { Button } from "@pond/ui";
import type { ReactNode } from "react";
import { findSave, type LibrarySource } from "@/lib/library";
import { FishMark } from "../../components/replica/fish-mark";
import {
  AccountRow,
  Panel,
  type Play,
  Stage,
  Thumb,
  useStage,
  visit,
} from "./pieces";
import styles from "./styles.module.css";

const LINKS: {
  id: string;
  name: string;
  detail: string;
  side: "start" | "end";
  icon: ReactNode;
  save: string;
}[] = [
  {
    id: "arena",
    name: "Are.na",
    detail: "Channels · 42",
    side: "start",
    icon: <IconBrandArena />,
    save: "field-notes",
  },
  {
    id: "pinterest",
    name: "Pinterest",
    detail: "Car Design · 642",
    side: "start",
    icon: <IconPinterest />,
    save: "chrome-chair",
  },
  {
    id: "x",
    name: "X bookmarks",
    detail: "Bookmarks · 3,412",
    side: "start",
    icon: <IconXTwitter />,
    save: "motion-code",
  },
  {
    id: "youtube",
    name: "YouTube",
    detail: "Watch later · 221",
    side: "end",
    icon: <IconYoutube />,
    save: "breakfast-potatoes",
  },
  {
    id: "cosmos",
    name: "Cosmos",
    detail: "Clusters · 86",
    side: "end",
    icon: <IconBrandCosmos />,
    save: "moss-forest",
  },
  {
    id: "local",
    name: "Local folders",
    detail: "This Mac · 1,104",
    side: "end",
    icon: <IconSourceLocal />,
    save: "garden-gate",
  },
];

const INFLOW = [
  "chrome-chair",
  "breakfast-potatoes",
  "flower-painting",
  "motion-code",
  "stuffed-monkey",
  "pink-roses",
  "moss-forest",
  "espresso-timer",
  "garden-gate",
  "sculpted-watch",
] as const;

const SOURCE_LABEL: Record<LibrarySource, string> = {
  arena: "Are.na",
  cosmos: "Cosmos",
  instagram: "Instagram",
  pinterest: "Pinterest",
  threads: "Threads",
  tiktok: "TikTok",
  twitter: "X",
  youtube: "YouTube",
};

function sourceLabel(source: LibrarySource): string {
  return SOURCE_LABEL[source];
}

const playHub = visit([1, 2, 3, 4, 5, 0], 860);
const playSettings = visit([1, 2, 3, 4, 5, 0], 720);

const playInflow: Play<number> = async (set, wait) => {
  await wait(600);
  set(3);
  await wait(180);
  for (let count = 4; count <= INFLOW.length; count += 1) {
    set(count);
    await wait(150);
  }
  await wait(1100);
};

const playOauth: Play<number> = async (set, wait) => {
  await wait(700);
  for (let done = 0; done <= LINKS.length; done += 1) {
    set(done);
    await wait(done === LINKS.length ? 1100 : 420);
  }
};

function Spoke({
  name,
  icon,
  side,
  on,
}: {
  name: string;
  icon: ReactNode;
  side: "start" | "end";
  on: boolean;
}) {
  const tile = <span className={styles.tile}>{icon}</span>;
  const cord = <span className={styles.cord} />;
  return (
    <span className={styles.spoke} data-on={on || undefined} data-side={side}>
      {side === "start" ? tile : cord}
      <span className={styles.spokeName}>{name}</span>
      {side === "start" ? cord : tile}
    </span>
  );
}

export function ConnectHub() {
  const { ref, state } = useStage(0, playHub);
  const left = LINKS.filter((item) => item.side === "start");
  const right = LINKS.filter((item) => item.side === "end");
  return (
    <Stage nodeRef={ref} size="wide">
      <div className={styles.hub}>
        <div className={styles.spokes}>
          {left.map((item) => (
            <Spoke
              key={item.id}
              name={item.name}
              icon={item.icon}
              side="start"
              on={LINKS[state]?.id === item.id}
            />
          ))}
        </div>
        <div className={styles.pond}>
          <FishMark color="orange" species="koi" size={52} mood="pleased" />
          <span>Pond</span>
        </div>
        <div className={styles.spokes}>
          {right.map((item) => (
            <Spoke
              key={item.id}
              name={item.name}
              icon={item.icon}
              side="end"
              on={LINKS[state]?.id === item.id}
            />
          ))}
        </div>
      </div>
    </Stage>
  );
}

export function ConnectSettings() {
  const { ref, state } = useStage(0, playSettings);
  return (
    <Stage nodeRef={ref} size="tall" mask="right">
      <Panel place="start" fill>
        <ul className={styles.rows}>
          {LINKS.map((item, index) => (
            <AccountRow
              key={item.id}
              icon={item.icon}
              title={item.name}
              detail={`${item.detail} · Connected`}
              on={index === state}
              done
            />
          ))}
        </ul>
      </Panel>
    </Stage>
  );
}

export function ConnectInflow() {
  const { ref, state } = useStage(INFLOW.length, playInflow);
  return (
    <Stage nodeRef={ref} size="wide" mask="bottom">
      <div className={styles.mosaic}>
        {INFLOW.map((id, index) => (
          <span
            key={id}
            className={styles.cell}
            data-on={index < state || undefined}
          >
            <Thumb id={id} />
            <span className={styles.cellLabel}>
              {sourceLabel(findSave(id).source)}
            </span>
          </span>
        ))}
      </div>
    </Stage>
  );
}

export function ConnectOauth() {
  const { ref, state } = useStage(LINKS.length, playOauth);
  const focus = Math.min(state, LINKS.length - 1);
  return (
    <Stage nodeRef={ref} size="tall">
      <Panel place="end" fill>
        <ul className={styles.rows}>
          {LINKS.map((item, index) => {
            const connected = index < state;
            const busy = index === state && state < LINKS.length;
            const label = connected
              ? "Connected"
              : busy
                ? "Connecting"
                : "Connect";
            return (
              <AccountRow
                key={item.id}
                icon={item.icon}
                title={item.name}
                detail={item.detail}
                on={index === focus}
                done={connected}
                trailing={
                  <Button
                    size="sm"
                    rounding="full"
                    variant={connected ? "secondary" : "primary"}
                    loading={busy}
                  >
                    {label}
                  </Button>
                }
              />
            );
          })}
        </ul>
      </Panel>
    </Stage>
  );
}

export function ConnectFolders() {
  const { ref, state } = useStage(0, visit([1, 2, 0], 900));
  const folders = [
    {
      id: "cars",
      name: "Car Design",
      detail: "Pinterest · 642",
      save: "mercedes-snow",
    },
    {
      id: "notes",
      name: "Field notes",
      detail: "Are.na · 42",
      save: "field-notes",
    },
    {
      id: "film",
      name: "Watch later",
      detail: "YouTube · 221",
      save: "breakfast-potatoes",
    },
  ];
  return (
    <Stage nodeRef={ref} size="small" mask="bottom">
      <Panel place="bottom-start">
        <ul className={styles.rows}>
          {folders.map((folder, index) => (
            <AccountRow
              key={folder.id}
              icon={<IconFolderFill />}
              title={folder.name}
              detail={folder.detail}
              on={index === state}
              done
            />
          ))}
        </ul>
      </Panel>
    </Stage>
  );
}
