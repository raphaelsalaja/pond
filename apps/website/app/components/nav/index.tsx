"use client";

import { IconChevronDown } from "@pond/icons";
import { Menu } from "@pond/ui";
import { Wordmark } from "@pond/ui/wordmark";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GITHUB_URL, NAV_LINKS } from "@/lib/links";
import {
  CHROME_WEB_STORE_URL,
  dmgUrl,
  FIREFOX_ADDONS_URL,
  windowsInstallerUrl,
} from "@/lib/release";
import styles from "./styles.module.css";

const DOWNLOADS = [
  { label: "Mac with Apple Silicon", href: dmgUrl("arm64") },
  { label: "Mac with Intel", href: dmgUrl("x64") },
  { label: "Windows", href: windowsInstallerUrl() },
];

const EXTENSIONS = [
  { label: "Chrome Extension", href: CHROME_WEB_STORE_URL },
  { label: "Firefox Add-on", href: FIREFOX_ADDONS_URL },
];

function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Nav() {
  const pathname = usePathname();

  return (
    <header className={styles.nav}>
      <div className={styles.bar}>
        <Link href="/" className={styles.home} aria-label="Pond home">
          <Wordmark size={20} />
        </Link>
        <nav className={styles.links} aria-label="Main">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={styles.link}
              aria-current={isCurrent(pathname, link.href) ? "page" : undefined}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className={styles.actions}>
          <Menu.Root>
            <Menu.Trigger variant="secondary" className={styles.get}>
              Get Pond
              <span className={styles.divider} aria-hidden />
              <IconChevronDown size={12} aria-hidden />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner align="end" side="bottom" sideOffset={8}>
                <Menu.Popup>
                  <Menu.Group>
                    <Menu.GroupLabel>Desktop</Menu.GroupLabel>
                    {DOWNLOADS.map((item) => (
                      <Menu.LinkItem key={item.href} href={item.href}>
                        <Menu.ItemLabel>{item.label}</Menu.ItemLabel>
                      </Menu.LinkItem>
                    ))}
                  </Menu.Group>
                  <Menu.Separator />
                  <Menu.Group>
                    <Menu.GroupLabel>Browser</Menu.GroupLabel>
                    {EXTENSIONS.map((item) => (
                      <Menu.LinkItem
                        key={item.href}
                        href={item.href}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Menu.ItemLabel>{item.label}</Menu.ItemLabel>
                      </Menu.LinkItem>
                    ))}
                  </Menu.Group>
                  <Menu.Separator />
                  <Menu.LinkItem render={<Link href="/download" />}>
                    <Menu.ItemLabel>All Downloads</Menu.ItemLabel>
                  </Menu.LinkItem>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
          <Menu.Root>
            <Menu.Trigger
              variant="secondary"
              className={styles.menu}
              aria-label="Open Menu"
            >
              Menu
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner align="end" side="bottom" sideOffset={8}>
                <Menu.Popup>
                  {NAV_LINKS.map((link) => (
                    <Menu.LinkItem
                      key={link.href}
                      render={<Link href={link.href} />}
                    >
                      <Menu.ItemLabel>{link.label}</Menu.ItemLabel>
                    </Menu.LinkItem>
                  ))}
                  <Menu.Separator />
                  <Menu.LinkItem href={GITHUB_URL}>
                    <Menu.ItemLabel>GitHub</Menu.ItemLabel>
                  </Menu.LinkItem>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </div>
      </div>
    </header>
  );
}
