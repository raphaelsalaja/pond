import {
  IconArrowLeftOutline18,
  IconArrowRightOutline18,
  IconVersionsOutline18,
} from "@pond/icons/outline/18";
import { Button, Menu } from "@pond/ui";
import { useSelector } from "@tanstack/react-store";
import { useEffect, useMemo, useState } from "react";
import { pickAuthorColor } from "@/components/save/preview/lib/helpers";
import { pickAuthorAvatarUrl } from "@/lib/media/url";
import type { Save } from "@/lib/types";
import { getAppRouter } from "@/lib/ui/app-router";
import { openSave } from "@/lib/ui/save-nav";
import { initials } from "@/lib/util/initials";
import { pool, savesStore } from "@/stores/pool";
import { useRecents } from "@/stores/recents";
import { useActiveTabId } from "@/stores/tabs";
import styles from "./styles.module.css";

function titleFor(save: Save): string {
  const trimmed = save.title?.trim();
  if (trimmed) return trimmed;
  return save.url || "Untitled";
}

function HistoryAvatar({ save, title }: { save: Save; title: string }) {
  const avatarUrl = pickAuthorAvatarUrl(save);
  const author = save.author?.trim() || title;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(avatarUrl && failedUrl !== avatarUrl);

  return (
    <span
      aria-hidden
      className={styles["history-avatar"]}
      style={showImage ? undefined : { background: pickAuthorColor(author) }}
    >
      {showImage && avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailedUrl(avatarUrl)}
        />
      ) : (
        initials(author)
      )}
    </span>
  );
}

export function ChromeHistoryNav() {
  const activeId = useActiveTabId();
  const [canBack, setCanBack] = useState(false);
  const [canForward, setCanForward] = useState(false);
  const recents = useRecents();
  const revision = useSelector(savesStore, (s) => s.revision);

  const historySaves = useMemo(() => {
    void revision;
    const items: Save[] = [];
    for (const entry of recents) {
      const save = pool.get(entry.saveId);
      if (save) items.push(save);
    }
    return items;
  }, [recents, revision]);

  useEffect(() => {
    void activeId;

    const router = getAppRouter();
    if (!router) {
      setCanBack(false);
      setCanForward(false);
      return;
    }

    const sync = () => {
      const r = getAppRouter();
      if (!r) return;
      setCanBack(r.history.canGoBack());
      const index =
        (r.state.location.state as { __TSR_index?: number } | undefined)
          ?.__TSR_index ?? 0;
      setCanForward(index < r.history.length - 1);
    };

    sync();

    return router.history.subscribe(sync);
  }, [activeId]);

  return (
    <div className={styles.nav}>
      <Button
        icon
        size="sm"
        variant="ghost"
        aria-label="Back"
        disabled={!canBack}
        onClick={() => getAppRouter()?.history.back()}
      >
        <IconArrowLeftOutline18 />
      </Button>
      <Button
        icon
        size="sm"
        variant="ghost"
        aria-label="Forward"
        disabled={!canForward}
        onClick={() => getAppRouter()?.history.forward()}
      >
        <IconArrowRightOutline18 />
      </Button>
      <Menu.Root>
        <Menu.Trigger
          icon
          size="sm"
          variant="ghost"
          aria-label="History"
          disabled={historySaves.length === 0}
        >
          <IconVersionsOutline18 />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner align="start" side="bottom">
            <Menu.Popup className={styles.popup}>
              <Menu.Group>
                <Menu.GroupLabel>History</Menu.GroupLabel>
                {historySaves.map((save) => (
                  <Menu.Item
                    key={save.id}
                    className={styles.item}
                    onClick={() => openSave(save.id)}
                  >
                    <HistoryAvatar save={save} title={titleFor(save)} />
                    <Menu.ItemLabel>{titleFor(save)}</Menu.ItemLabel>
                  </Menu.Item>
                ))}
              </Menu.Group>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}
