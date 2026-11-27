import { LINKS } from "../../content/home";
import { AppIcon } from "../app-icon";
import styles from "./styles.module.css";

const ROWS = [
  [
    { label: "Download", href: LINKS.releases },
    { label: "Changelog", href: LINKS.changelog },
    { label: "Wiki", href: LINKS.wiki },
  ],
  [
    { label: "Developers", href: LINKS.developers },
    { label: "MCP", href: LINKS.mcp },
    { label: "CLI", href: LINKS.cli },
    { label: "Raycast", href: LINKS.raycast },
  ],
  [
    { label: "GitHub", href: LINKS.repo },
    { label: "Twitter", href: LINKS.twitter },
    { label: "Buy Me a Coffee", href: LINKS.coffee },
  ],
  [
    { label: "Privacy", href: "/privacy" },
    { label: "Responsible Use", href: "/responsible-use" },
  ],
];

/** The icon and every link, centered, in short rows. */
export function Footer() {
  return (
    <footer className={styles.footer}>
      <AppIcon size={24} />
      <nav className={styles.rows} aria-label="Pond links">
        {ROWS.map((row) => (
          <div key={row[0]?.label} className={styles.row}>
            {row.map((link) => (
              <a key={link.label} className={styles.link} href={link.href}>
                {link.label}
              </a>
            ))}
          </div>
        ))}
      </nav>
      <p className={styles.license}>Free and open source. MIT licensed.</p>
    </footer>
  );
}
