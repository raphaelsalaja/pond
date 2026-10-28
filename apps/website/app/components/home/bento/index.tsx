import { IconCircleCheckFill, IconMagnifier } from "@pond/icons";
import {
  IconInstagram,
  IconReddit,
  IconTikTok,
  IconXTwitter,
  IconYoutube,
} from "@pond/icons/social-media";
import Image from "next/image";
import type { ReactNode } from "react";
import { findSave, saveImage } from "@/lib/library";
import { Frame } from "../../frame";
import { Heading } from "../../heading";
import { Replica, type ReplicaScene } from "../../replica";
import styles from "./styles.module.css";

interface Card {
  id: string;
  title: string;
  body: string;
  visual: ReactNode;
}

const ARCHIVES = [
  { label: "X archive", Icon: IconXTwitter },
  { label: "Instagram export", Icon: IconInstagram },
  { label: "TikTok export", Icon: IconTikTok },
  { label: "YouTube Takeout", Icon: IconYoutube },
  { label: "Reddit export", Icon: IconReddit },
];

const WAVE = [6, 10, 4, 12, 8, 5, 11, 7, 9, 3];

function Scene({
  scene,
  anchor,
}: {
  scene: ReplicaScene;
  anchor: "start" | "end";
}) {
  return (
    <div className={styles.scene} data-anchor={anchor}>
      <Replica className={styles.replica} scene={scene} />
    </div>
  );
}

function Photo({ id, children }: { id: string; children?: ReactNode }) {
  const save = findSave(id);
  return (
    <figure className={styles.photo}>
      <Image
        src={saveImage(save)}
        alt={save.title}
        width={save.width}
        height={save.height}
        sizes="320px"
      />
      {children}
    </figure>
  );
}

function Swatches({ id }: { id: string }) {
  return (
    <div className={styles.chip} data-place="bottom">
      {findSave(id).colors.map((color) => (
        <span
          key={color}
          className={styles.swatch}
          style={{ background: color }}
        />
      ))}
    </div>
  );
}

const CARDS: Card[] = [
  {
    id: "sources",
    title: "Connect once. Pond keeps up.",
    body: "Link X, Instagram, Pinterest, and 15 more sources. Pond syncs through your own browser session.",
    visual: <Scene scene="sources" anchor="start" />,
  },
  {
    id: "colors",
    title: "Search by color.",
    body: "Pond pulls a palette from every image, so you can ask for the blue one.",
    visual: (
      <Photo id="flower-painting">
        <Swatches id="flower-painting" />
      </Photo>
    ),
  },
  {
    id: "text",
    title: "Find the words in a screenshot.",
    body: "Pond reads the text in your images, so searching a word finds the screenshot it's in.",
    visual: (
      <Photo id="motion-code">
        <div className={styles.chip} data-place="top">
          <IconMagnifier size={12} aria-hidden />
          stagger
        </div>
      </Photo>
    ),
  },
  {
    id: "transcription",
    title: "Search what a video says.",
    body: "Pond transcribes video on your computer, so spoken words show up in search.",
    visual: (
      <Photo id="breakfast-potatoes">
        <div className={styles.chip} data-place="bottom">
          <span className={styles.wave} aria-hidden>
            {WAVE.map((height) => (
              <span key={height} style={{ height }} />
            ))}
          </span>
          Transcript
        </div>
      </Photo>
    ),
  },
  {
    id: "fish",
    title: "Ask your fish about your library.",
    body: "Fish answer from your saves with Apple Intelligence, your own key, or a local host you run.",
    visual: <Scene scene="fish" anchor="end" />,
  },
  {
    id: "imports",
    title: "Bring your history with you.",
    body: "Pond adds every like and save from a platform archive you downloaded, or from an Eagle library.",
    visual: (
      <ul className={styles.archives}>
        {ARCHIVES.map(({ label, Icon }) => (
          <li key={label}>
            <Icon width={20} height={20} aria-hidden />
            <span className={styles.label}>{label}</span>
            <IconCircleCheckFill size={14} aria-hidden />
          </li>
        ))}
      </ul>
    ),
  },
  {
    id: "anywhere",
    title: "Save from anywhere.",
    body: "Use the browser extension, the Share menu, Shortcuts, Raycast, or the local API.",
    visual: (
      <div className={styles.toast}>
        <Image
          src={saveImage(findSave("chrome-chair"))}
          alt=""
          width={36}
          height={54}
        />
        <span className={styles.message}>
          <strong>Saved to Pond</strong>
          <span>Flowing chair</span>
        </span>
      </div>
    ),
  },
];

export function Bento() {
  return (
    <Frame.Section spacing="xl" className={styles.root}>
      <Heading.Root layout="center">
        <Heading.Title>Everything you save, in one library.</Heading.Title>
        <Heading.Lede>
          Pond collects your likes and bookmarks, then reads every one on your
          computer so you can find it again.
        </Heading.Lede>
      </Heading.Root>
      <div className={styles.grid}>
        {CARDS.map((card) => (
          <article key={card.id} className={styles.card} data-card={card.id}>
            <div className={styles.visual}>{card.visual}</div>
            <h3 className={styles.title}>{card.title}</h3>
            <p className={styles.body}>{card.body}</p>
          </article>
        ))}
      </div>
    </Frame.Section>
  );
}
