"use client";

import { Wordmark } from "@pond/ui/wordmark";
import { useBrowser, usePlatform } from "@/lib/platform";
import { extensionUrl, otherDownloads, primaryDownload } from "@/lib/release";
import { Cta } from "../cta";
import styles from "./styles.module.css";

const GITHUB = "https://github.com/raphaelsalaja/pond";
const TWITTER = "https://x.com/raphaelsalaja";
const BUY_ME_A_COFFEE = "https://buymeacoffee.com/raphaelsalaja";
const RESPONSIBLE_USE = `${GITHUB}/blob/main/RESPONSIBLE-USE.md`;

export function Intro() {
  const platform = usePlatform();
  const browser = useBrowser();
  const primary = primaryDownload(platform);
  return (
    <header className={styles.intro}>
      <h1 className={styles.title}>
        <Wordmark size={24} />
      </h1>
      <p className={styles.text}>
        Keep what you save on X, Instagram, Pinterest, and more in a folder on
        your Mac, Windows PC, or Linux desktop. Free and open source.
      </p>
      <nav className={styles.actions} aria-label="Downloads and links">
        <div className={styles.buttons}>
          <Cta href={primary.href}>{primary.label}</Cta>
          <Cta href={extensionUrl(browser)} variant="soft">
            Browser Extension
          </Cta>
        </div>
        <div className={styles.links}>
          {otherDownloads(platform).map((download) => (
            <a
              key={download.label}
              className={styles.link}
              href={download.href}
            >
              {download.label}
            </a>
          ))}
          <a
            className={styles.link}
            href={GITHUB}
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          <a
            className={styles.link}
            href={TWITTER}
            target="_blank"
            rel="noreferrer"
          >
            Twitter
          </a>
          <a
            className={styles.link}
            href={BUY_ME_A_COFFEE}
            target="_blank"
            rel="noreferrer"
          >
            Buy Me a Coffee
          </a>
          <a
            className={styles.link}
            href={RESPONSIBLE_USE}
            target="_blank"
            rel="noreferrer"
          >
            Responsible Use
          </a>
          <a className={styles.link} href="/developers">
            Developers
          </a>
          <a className={styles.link} href="/privacy">
            Privacy
          </a>
        </div>
      </nav>
    </header>
  );
}
