import { IconChevronRight } from "@pond/icons";
import Image from "next/image";
import type { Release } from "@/lib/release";
import { HERO } from "../../content/home";
import { SCENE_IMAGES } from "../../content/scenes";
import { Downloads } from "../downloads";
import styles from "./styles.module.css";

/** The title, line and downloads in a left column on an off-white surface, the Library running off the right. */
export function Hero({ release }: { release: Release | null }) {
  return (
    <header className={styles.hero}>
      <div className={styles.intro}>
        <h1 className={styles.title}>
          {HERO.title[0]}
          <br />
          {HERO.title[1]}
        </h1>
        <p className={styles.line}>{HERO.line}</p>
        <div className={styles.downloads}>
          <Downloads release={release} />
        </div>
      </div>
      <div className={styles.window}>
        {release && (
          <a className={styles.update} href={release.url}>
            <span className={styles.version}>New in {release.tag}</span>
            {release.headline && (
              <span className={styles.headline}>{release.headline}</span>
            )}
            <IconChevronRight size={14} aria-hidden />
          </a>
        )}
        <Image
          className={styles.capture}
          src={SCENE_IMAGES.hero}
          alt="Pond's Library: a grid of Saves from X, Instagram, Pinterest, and more, with one open in the inspector."
          sizes="(max-width: 960px) 112vw, 1424px"
          quality={90}
          priority
          draggable={false}
        />
      </div>
    </header>
  );
}
