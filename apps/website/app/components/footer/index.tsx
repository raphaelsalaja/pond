import { Wordmark } from "@pond/ui/wordmark";
import Link from "next/link";
import {
  FOOTER_GROUPS,
  isExternal,
  LICENSE_URL,
  TWITTER_URL,
} from "@/lib/links";
import { POND_VERSION } from "@/lib/release";
import { Frame } from "../frame";
import styles from "./styles.module.css";

export function Footer() {
  return (
    <footer className={styles.footer}>
      <Frame.Section spacing="none" className={styles.grid}>
        <div className={styles.brand}>
          <Link href="/" className={styles.home} aria-label="Pond home">
            <Wordmark size={20} />
          </Link>
          <p className={styles.meta}>
            <Link className={styles.quiet} href="/changelog">
              Pond {POND_VERSION}
            </Link>
            <span aria-hidden>·</span>
            <a
              className={styles.quiet}
              href={LICENSE_URL}
              target="_blank"
              rel="noreferrer"
            >
              MIT License
            </a>
            <span aria-hidden>·</span>
            <a
              className={styles.quiet}
              href={TWITTER_URL}
              target="_blank"
              rel="noreferrer"
            >
              Made by Raphael Salaja
            </a>
          </p>
        </div>
        {FOOTER_GROUPS.map((group) => (
          <nav
            key={group.label}
            className={styles.group}
            aria-label={group.label}
          >
            <p className={styles.heading}>{group.label}</p>
            <ul className={styles.list}>
              {group.links.map((link) => (
                <li key={link.href}>
                  {isExternal(link.href) ? (
                    <a
                      className={styles.link}
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {link.label}
                    </a>
                  ) : (
                    <Link className={styles.link} href={link.href}>
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </Frame.Section>
    </footer>
  );
}
