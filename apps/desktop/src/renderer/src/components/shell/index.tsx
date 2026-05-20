import type React from "react";
import type { ReactNode } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { BulkActionBar } from "@/components/bulk-action-bar";
import { CommandPalette } from "@/components/command-palette";
import { FilterBar } from "@/components/filter-bar";
import { HeaderToolbar } from "@/components/header-toolbar";
import { LibrarySidebar } from "@/components/library-sidebar";
import { ProcessingButton } from "@/components/processing-button";
import { QuickCapture } from "@/components/quick-capture";
import { Sidebar } from "@/components/sidebar";
import { SidebarTools } from "@/components/sidebar-tools";
import { DeepLinkBridge } from "@/effects/deep-link-bridge";
import { HistoryHotkey } from "@/effects/history-hotkey";
import { OnboardedGuard } from "@/effects/onboarded-guard";
import { PreferencesHotkey } from "@/effects/preferences-hotkey";
import { usePlatform } from "@/lib/platform";
import { useSidebar } from "@/lib/use-sidebar";
import {
  GROUP_LABELS,
  GROUP_ORDER,
  sectionsByGroup,
} from "@/pages/settings/registry";
import styles from "./styles.module.css";

type Platform = "mac" | "other";

interface RootProps extends React.ComponentPropsWithoutRef<"div"> {
  platform?: Platform;
}

function Root({
  platform = "other",
  className,
  children,
  ...props
}: RootProps) {
  return (
    <div
      data-platform={platform}
      className={[styles.layout, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}

interface ContentProps extends React.ComponentPropsWithoutRef<"div"> {}

function Content({ className, ...props }: ContentProps) {
  return (
    <div
      className={[styles.content, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

interface SplitProps extends React.ComponentPropsWithoutRef<"div"> {}

function Split({ className, ...props }: SplitProps) {
  return (
    <div
      className={[styles.split, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

interface MainProps extends React.ComponentProps<"main"> {}

function Main({ className, ...props }: MainProps) {
  return (
    <main
      className={[styles.main, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

interface HeaderProps extends React.ComponentPropsWithoutRef<"div"> {}

function Header({ className, ...props }: HeaderProps) {
  return (
    <div
      className={[styles.header, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

interface EmptyProps extends React.ComponentPropsWithoutRef<"p"> {
  children?: ReactNode;
}

function Empty({ className, ...props }: EmptyProps) {
  return (
    <p
      className={[styles.empty, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

export const Shell = { Root, Content, Split, Main, Header, Empty };

export function AppRoot() {
  return (
    <div className={styles.root}>
      <DeepLinkBridge />
      <OnboardedGuard />
      <PreferencesHotkey />
      <HistoryHotkey />
      <Outlet />
      <BulkActionBar.Root />
      <QuickCapture.Root />
      <CommandPalette.Root />
    </div>
  );
}

export function LibraryLayout() {
  const platform = usePlatform();
  const { open: sidebarOpen } = useSidebar();

  return (
    <Shell.Root platform={platform}>
      {sidebarOpen ? <LibrarySidebar.Root /> : null}
      <Shell.Content>
        <div aria-hidden className={styles["drag-strip"]} />
        <Shell.Split>
          <Outlet />
        </Shell.Split>
      </Shell.Content>
    </Shell.Root>
  );
}

export function LibraryChrome() {
  return (
    <Shell.Header>
      <HeaderToolbar.Root />
      <FilterBar.Root />
      <ProcessingButton.Root />
    </Shell.Header>
  );
}

export function SettingsLayout() {
  const platform = usePlatform();
  const navigate = useNavigate();

  return (
    <Shell.Root platform={platform}>
      <Sidebar.Root aria-label="Settings">
        <Sidebar.Scroll>
          <Sidebar.Toolbar>
            <SidebarTools />
          </Sidebar.Toolbar>

          <Sidebar.Back onClick={() => navigate("/", { viewTransition: true })}>
            Back to App
          </Sidebar.Back>

          {GROUP_ORDER.flatMap((group) => {
            const items = sectionsByGroup(group);
            if (items.length === 0) return [];
            const label = GROUP_LABELS[group];
            return [
              <Sidebar.Group key={group}>
                {label ? (
                  <Sidebar.GroupLabel>{label}</Sidebar.GroupLabel>
                ) : null}
                {items.map((section) => (
                  <Sidebar.Link
                    key={section.id}
                    to={`/settings/${section.path}`}
                  >
                    <Sidebar.LinkIcon>
                      <section.icon width={14} height={14} />
                    </Sidebar.LinkIcon>
                    <Sidebar.LinkLabel>{section.label}</Sidebar.LinkLabel>
                  </Sidebar.Link>
                ))}
              </Sidebar.Group>,
            ];
          })}
        </Sidebar.Scroll>
      </Sidebar.Root>
      <Shell.Content>
        <div aria-hidden className={styles["drag-strip"]} />
        <Shell.Main>
          <div className={styles.body}>
            <Outlet />
          </div>
        </Shell.Main>
      </Shell.Content>
    </Shell.Root>
  );
}

export function StandaloneLayout() {
  const platform = usePlatform();

  return (
    <Shell.Root platform={platform}>
      <Shell.Content>
        <div aria-hidden className={styles["drag-strip"]} />
        <Shell.Main>
          <Outlet />
        </Shell.Main>
      </Shell.Content>
    </Shell.Root>
  );
}
