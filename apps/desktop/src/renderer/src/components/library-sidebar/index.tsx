import {
  IconConnectedDotsFillDuo18,
  IconSliderFillDuo18,
} from "@pond/icons/fill-duo";
import {
  IconArchiveContent2Outline18,
  IconArrowUpRightOutline18,
  IconHourglassClockOutline18,
  IconPlusOutline18,
  IconRefreshClockwiseOutline18,
  IconShuffleSparkleOutline18,
  IconTagSlashOutline18,
  IconTrash2ContentOutline18,
  IconTrash2Outline18,
} from "@pond/icons/outline/18";
import { IconGithub, IconXTwitter } from "@pond/icons/social-media";
import { AlertDialog, Button, ContextMenu, Menu, useToast } from "@pond/ui";
import type { SVGProps } from "react";
import { useCallback, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Sidebar } from "@/components/sidebar";
import { SidebarTools } from "@/components/sidebar-tools";
import { usePrefs } from "@/pool/prefs";
import styles from "./styles.module.css";

const REPO_URL = "https://github.com/raphaelsalaja/pond";
const _DOCS_URL = `${REPO_URL}#readme`;
const _ISSUES_URL = `${REPO_URL}/issues`;
const _CHANGELOG_URL = `${REPO_URL}/blob/main/CHANGELOG.md`;
const DISCUSSIONS_URL = `${REPO_URL}/discussions`;

const routes = [
  {
    path: "/",
    label: "Library",
    icon: IconArchiveContent2Outline18,
  },
  {
    path: "/untagged",
    label: "Untagged",
    icon: IconTagSlashOutline18,
  },
  {
    path: "/recents",
    label: "Recents",
    icon: IconHourglassClockOutline18,
  },
  {
    path: "/random",
    label: "Random",
    icon: IconShuffleSparkleOutline18,
  },
  {
    path: "/trash",
    label: "Trash",
    icon: IconTrash2ContentOutline18,
  },
];

function Root() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const openQuickCapture = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.set("capture", "1");
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  function openUrl(url: string) {
    void window.pond.openExternal(url);
  }

  return (
    <Sidebar.Root aria-label="Library navigation">
      <Sidebar.Scroll>
        <Sidebar.Toolbar>
          <SidebarTools />
        </Sidebar.Toolbar>

        <Sidebar.Header>
          <div className={styles["account-trigger"]}>
            <span aria-hidden className={styles["account-logo"]}>
              <PondLogo />
            </span>
            <span className={styles["account-name"]}>Pond</span>
          </div>
          <Sidebar.HeaderActions>
            <Sidebar.ToolbarButton
              aria-label="Quick capture"
              onClick={openQuickCapture}
            >
              <IconPlusOutline18 width={14} height={14} />
            </Sidebar.ToolbarButton>
          </Sidebar.HeaderActions>
        </Sidebar.Header>

        <Sidebar.Group>
          {routes.map((route) => {
            if (route.path === "/trash") {
              return <TrashLink key={route.path} route={route} />;
            }
            return (
              <Sidebar.Link key={route.path} to={route.path}>
                <Sidebar.LinkIcon>
                  <route.icon />
                </Sidebar.LinkIcon>
                <Sidebar.LinkLabel>{route.label}</Sidebar.LinkLabel>
              </Sidebar.Link>
            );
          })}
        </Sidebar.Group>
      </Sidebar.Scroll>
      <HelpButton openUrl={openUrl} navigate={navigate} />
    </Sidebar.Root>
  );
}

interface TrashLinkProps {
  route: { path: string; label: string; icon: (typeof routes)[number]["icon"] };
}

function TrashLink({ route }: TrashLinkProps) {
  const toast = useToast();
  const [trashPrefs] = usePrefs("trash");
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [busy, setBusy] = useState(false);

  const restoreAll = useCallback(async () => {
    setBusy(true);
    try {
      await window.pond.query("saves.restoreAll");
      toast.add({ title: "Restored everything", type: "success" });
    } finally {
      setBusy(false);
    }
  }, [toast]);

  const emptyTrash = useCallback(async () => {
    setBusy(true);
    try {
      await window.pond.query("saves.emptyTrash");
      toast.add({ title: "Trash emptied", type: "success" });
    } finally {
      setBusy(false);
      setConfirmEmpty(false);
    }
  }, [toast]);

  const onEmptyTrashClick = useCallback(() => {
    if (trashPrefs.confirmBeforeEmpty) {
      setConfirmEmpty(true);
    } else {
      void emptyTrash();
    }
  }, [emptyTrash, trashPrefs.confirmBeforeEmpty]);

  return (
    <>
      <ContextMenu.Root>
        <ContextMenu.Trigger
          render={
            <Sidebar.Link to={route.path}>
              <Sidebar.LinkIcon>
                <route.icon />
              </Sidebar.LinkIcon>
              <Sidebar.LinkLabel>{route.label}</Sidebar.LinkLabel>
            </Sidebar.Link>
          }
        />
        <ContextMenu.Portal>
          <ContextMenu.Backdrop />
          <ContextMenu.Positioner>
            <ContextMenu.Popup>
              <ContextMenu.Item onClick={onEmptyTrashClick}>
                <ContextMenu.ItemIcon>
                  <IconTrash2Outline18 />
                </ContextMenu.ItemIcon>
                <ContextMenu.ItemLabel>Empty Trash</ContextMenu.ItemLabel>
              </ContextMenu.Item>
              <ContextMenu.Item onClick={() => void restoreAll()}>
                <ContextMenu.ItemIcon>
                  <IconRefreshClockwiseOutline18 />
                </ContextMenu.ItemIcon>
                <ContextMenu.ItemLabel>Restore All Items</ContextMenu.ItemLabel>
              </ContextMenu.Item>
            </ContextMenu.Popup>
          </ContextMenu.Positioner>
        </ContextMenu.Portal>
      </ContextMenu.Root>

      <AlertDialog.Root open={confirmEmpty} onOpenChange={setConfirmEmpty}>
        <AlertDialog.Content>
          <AlertDialog.Title>Empty trash?</AlertDialog.Title>
          <AlertDialog.Description>
            Permanently delete every trashed save. This cannot be undone.
          </AlertDialog.Description>
          <AlertDialog.Actions>
            <AlertDialog.Close
              render={<Button variant="ghost">Cancel</Button>}
            />
            <AlertDialog.Close
              render={
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={(e) => {
                    e.preventDefault();
                    void emptyTrash();
                  }}
                >
                  Delete forever
                </Button>
              }
            />
          </AlertDialog.Actions>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </>
  );
}

export const LibrarySidebar = {
  Root,
};

interface HelpButtonProps {
  openUrl: (url: string) => void;
  navigate: ReturnType<typeof useNavigate>;
}

function HelpButton({ openUrl, navigate }: HelpButtonProps) {
  return (
    <div className={styles["help-footer"]}>
      <Menu.Root>
        <Menu.Trigger
          render={
            <button
              type="button"
              aria-label="Help and resources"
              className={styles["help-trigger"]}
            >
              <QuestionMarkIcon />
            </button>
          }
        />
        <Menu.Portal>
          <Menu.Positioner side="top" align="start" sideOffset={6}>
            <Menu.Popup>
              <Menu.Item>
                <Menu.ItemIcon>
                  <KeyboardIcon />
                </Menu.ItemIcon>
                <Menu.ItemLabel>Keyboard Shortcuts</Menu.ItemLabel>
                <Menu.ItemKbd>⌘ /</Menu.ItemKbd>
              </Menu.Item>

              <Menu.Item
                onClick={() => navigate("/settings", { viewTransition: true })}
              >
                <Menu.ItemIcon>
                  <IconSliderFillDuo18 />
                </Menu.ItemIcon>
                <Menu.ItemLabel>Settings</Menu.ItemLabel>
                <Menu.ItemKbd>G then S</Menu.ItemKbd>
              </Menu.Item>

              <Menu.Separator />

              <Menu.Item onClick={() => openUrl(DISCUSSIONS_URL)}>
                <Menu.ItemIcon>
                  <IconConnectedDotsFillDuo18 />
                </Menu.ItemIcon>
                <Menu.ItemLabel>Community</Menu.ItemLabel>
                <Menu.ItemKbd>
                  <IconArrowUpRightOutline18 width={12} height={12} />
                </Menu.ItemKbd>
              </Menu.Item>

              <Menu.Item onClick={() => openUrl("https://x.com/raphaelsalaja")}>
                <Menu.ItemIcon>
                  <IconXTwitter />
                </Menu.ItemIcon>
                <Menu.ItemLabel>Twitter</Menu.ItemLabel>
                <Menu.ItemKbd>
                  <IconArrowUpRightOutline18 width={12} height={12} />
                </Menu.ItemKbd>
              </Menu.Item>

              <Menu.Item
                onClick={() => openUrl("https://github.com/raphaelsalaja/pond")}
              >
                <Menu.ItemIcon>
                  <IconGithub />
                </Menu.ItemIcon>
                <Menu.ItemLabel>GitHub</Menu.ItemLabel>
                <Menu.ItemKbd>
                  <IconArrowUpRightOutline18 width={12} height={12} />
                </Menu.ItemKbd>
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}

function PondLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      role="img"
      {...props}
    >
      <title>Pond</title>
      <path
        d="M9 1.75a7.25 7.25 0 1 0 0 14.5A7.25 7.25 0 0 0 9 1.75Zm0 4a3.25 3.25 0 1 1 0 6.5 3.25 3.25 0 0 1 0-6.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function QuestionMarkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      fill="none"
      {...props}
    >
      <title>Help</title>
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth={1.3} />
      <path
        d="M6.25 6.5a1.75 1.75 0 1 1 2.37 1.64c-.39.15-.62.52-.62.93V9.5"
        stroke="currentColor"
        strokeWidth={1.3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="11.25" r="0.75" fill="currentColor" />
    </svg>
  );
}

function KeyboardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      {...props}
    >
      <title>Keyboard</title>
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1}
      >
        <rect x="2.25" y="4.75" width="13.5" height="8.5" rx="1.6" />
        <circle cx="5" cy="7.75" r="0.4" fill="currentColor" stroke="none" />
        <circle cx="7.5" cy="7.75" r="0.4" fill="currentColor" stroke="none" />
        <circle cx="10" cy="7.75" r="0.4" fill="currentColor" stroke="none" />
        <circle cx="12.5" cy="7.75" r="0.4" fill="currentColor" stroke="none" />
        <circle cx="5" cy="10" r="0.4" fill="currentColor" stroke="none" />
        <circle cx="7.5" cy="10" r="0.4" fill="currentColor" stroke="none" />
        <circle cx="10" cy="10" r="0.4" fill="currentColor" stroke="none" />
        <circle cx="12.5" cy="10" r="0.4" fill="currentColor" stroke="none" />
        <line x1="5.75" y1="11.5" x2="12.25" y2="11.5" />
      </g>
    </svg>
  );
}
