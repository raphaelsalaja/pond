import { NavBar } from "@pond/ui/nav-bar";
import type { Release } from "@/lib/release";
import { LINKS } from "../../content/home";
import { AppIcon } from "../app-icon";
import { DownloadButton } from "../downloads";
import styles from "./styles.module.css";

const PAGES = [
  { label: "Developers", href: LINKS.developers },
  { label: "Changelog", href: LINKS.changelog },
  { label: "GitHub", href: LINKS.repo },
];

/** The site's main links in one bar across the top of the page. */
export function SiteNav({ release }: { release: Release | null }) {
  return (
    <div className={styles.dock}>
      <NavBar.Root aria-label="Main">
        <NavBar.Brand href="/">
          <AppIcon size={20} />
          Pond
        </NavBar.Brand>
        <NavBar.List className={styles.list}>
          {PAGES.map((page) => (
            <NavBar.Link key={page.href} href={page.href}>
              {page.label}
            </NavBar.Link>
          ))}
        </NavBar.List>
        <NavBar.Actions>
          <DownloadButton release={release} size="sm">
            Download
          </DownloadButton>
        </NavBar.Actions>
      </NavBar.Root>
    </div>
  );
}
