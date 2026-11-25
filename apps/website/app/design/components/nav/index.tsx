"use client";

import { Button, cn, Logo, Toggle, ToggleGroup } from "@pond/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { INTRODUCTION, pageGroups, reveal } from "../pages";
import { Search } from "../search";
import { useTheme } from "../theme";
import styles from "./styles.module.css";

interface NavLinkProps extends React.ComponentPropsWithoutRef<typeof Link> {
  href: string;
}

function NavLink({ href, className, onClick, ...props }: NavLinkProps) {
  const active = usePathname() === href;
  return (
    <Link
      href={href}
      scroll={false}
      className={cn(styles.link, className)}
      aria-current={active ? "page" : undefined}
      data-active={active || undefined}
      onClick={(event) => {
        onClick?.(event);
        reveal(href);
      }}
      {...props}
    />
  );
}

type NavProps = React.ComponentPropsWithoutRef<"nav">;

export function Nav({ className, ...props }: NavProps) {
  const { preference, setPreference } = useTheme();
  const groups = pageGroups();

  return (
    <nav
      aria-label="Design System"
      className={cn(styles.nav, className)}
      {...props}
    >
      <div className={styles.top}>
        <Link
          href="/design"
          scroll={false}
          className={styles.logo}
          aria-label="Pond Design System"
        >
          <Logo size={20} />
        </Link>
        <Search />
      </div>

      <div className={styles.groups}>
        <NavLink href={INTRODUCTION.href}>{INTRODUCTION.name}</NavLink>
        {groups.map((group) => (
          <section key={group.label} className={styles.group}>
            <h2 className={styles.label}>{group.label}</h2>
            <ul className={styles.list}>
              {group.pages.map((page) => (
                <li key={page.href}>
                  <NavLink href={page.href}>{page.name}</NavLink>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className={styles.footer}>
        <ToggleGroup
          aria-label="Theme"
          className={styles.theme}
          value={[preference]}
          onValueChange={(value) => {
            const next = value[0];
            if (next === "system" || next === "light" || next === "dark") {
              setPreference(next);
            }
          }}
        >
          <Toggle type="button" size="sm" value="system">
            System
          </Toggle>
          <Toggle type="button" size="sm" value="light">
            Light
          </Toggle>
          <Toggle type="button" size="sm" value="dark">
            Dark
          </Toggle>
        </ToggleGroup>
        <Button
          variant="secondary"
          size="sm"
          width="full"
          nativeButton={false}
          render={<Link href="/" />}
        >
          Open Pond
        </Button>
      </div>
    </nav>
  );
}
