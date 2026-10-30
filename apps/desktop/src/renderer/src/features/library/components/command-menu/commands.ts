import {
  IconAlbum2,
  IconBookmark,
  IconBookmarkSlash,
  IconChatBubble,
  IconCircleInfo,
  IconCoffee,
  IconCompass,
  IconCopy,
  IconDownload,
  IconEye,
  IconFile,
  IconFolder,
  IconFolderBan,
  IconFolderOpen,
  IconGear3,
  IconNodes3,
  IconSparkle,
  IconTrashXmark,
  IconTrophy,
  IconVersions,
  IconWindowDownload,
} from "@pond/icons";
import { DEFAULT_FISH_ID } from "@shared/fish-contracts";
import { fishPath } from "@/features/fish";
import {
  importClipboard,
  importEagle,
  importPaths,
  newFolder,
  newTag,
  runNewAction,
} from "@/features/library/components/new-menu/actions";
import { libraryChrome } from "@/features/library/state/library-chrome";
import { resetFilters } from "@/features/library/state/view-store";
import { openSources, pickWatchedFolder } from "@/features/sources";
import { getAppRouter } from "@/shared/lib/app-router";
import { openSettings } from "@/shared/lib/open-settings";
import { fishIntroDialog } from "@/shared/state/fish-intro";
import {
  isCosignVotingOpen,
  PROMPT_IDS,
  promptToast,
} from "@/shared/state/prompts";
import { setupFlow } from "@/shared/state/setup";
import { supportDialog } from "@/shared/state/support";
import type { CommandSpec } from "./types";

export function navigateTo(path: string): void {
  getAppRouter()?.history.push(path);
}

export const COMMANDS: readonly CommandSpec[] = [
  {
    id: "new-folder",
    group: "Create",
    label: "New Folder",
    icon: IconFolder,
    keywords: "create collection organize directory",
    shortcut: "library.new-folder",
    run: () => newFolder(),
  },
  {
    id: "new-tag",
    group: "Create",
    label: "New Tag",
    icon: IconBookmark,
    keywords: "create label organize",
    shortcut: "library.new-tag",
    run: () => newTag("tag"),
  },
  {
    id: "new-tag-group",
    group: "Create",
    label: "New Tag Group",
    icon: IconVersions,
    keywords: "create labels organize",
    shortcut: "library.new-tag-group",
    run: () => newTag("tag-group"),
  },
  {
    id: "new-source",
    group: "Create",
    label: "New Source",
    icon: IconNodes3,
    keywords: "connect watch folder add account",
    shortcut: "sources.new",
    run: () => openSources({ type: "new-source" }),
  },
  {
    id: "new-watch",
    group: "Create",
    label: "New Watch",
    icon: IconEye,
    keywords: "source public account follow import watch",
    run: () => openSources({ type: "new-source" }),
  },
  {
    id: "watched-folder",
    group: "Create",
    label: "New Watched Folder",
    icon: IconFolderOpen,
    keywords: "auto import directory files copy local",
    run: () => void runNewAction(pickWatchedFolder),
  },
  {
    id: "import-files",
    group: "Import",
    label: "Import Files",
    icon: IconFile,
    keywords: "image video audio pdf document media",
    shortcut: "library.import-files",
    run: () => void runNewAction(() => importPaths("files")),
  },
  {
    id: "import-folders",
    group: "Import",
    label: "Import Folders",
    icon: IconFolderOpen,
    keywords: "directory files media",
    shortcut: "library.import-folders",
    run: () => void runNewAction(() => importPaths("folders")),
  },
  {
    id: "import-clipboard",
    group: "Import",
    label: "Import from Clipboard",
    icon: IconCopy,
    keywords: "paste image files",
    run: () => void runNewAction(importClipboard),
  },
  {
    id: "import-eagle",
    group: "Import",
    label: "Import Eagle Library",
    icon: IconDownload,
    keywords: "migrate archive package",
    run: () => void runNewAction(importEagle),
  },
  {
    id: "library",
    group: "Navigate",
    label: "Library",
    detail: "All saves",
    icon: IconAlbum2,
    keywords: "home saves archive",
    shortcut: "nav.library",
    run: () => {
      resetFilters();
      libraryChrome.setNav({ kind: "all" });
      navigateTo("/");
    },
  },
  {
    id: "uncategorized",
    group: "Navigate",
    label: "Uncategorized",
    detail: "Saves that aren't in a folder",
    icon: IconFolderBan,
    keywords: "unfiled inbox no folder",
    run: () => {
      resetFilters();
      libraryChrome.setNav({ kind: "uncategorized" });
      navigateTo("/");
    },
  },
  {
    id: "untagged",
    group: "Navigate",
    label: "Untagged",
    detail: "Saves without tags",
    icon: IconBookmarkSlash,
    keywords: "no tags labels",
    run: () => {
      resetFilters();
      libraryChrome.setNav({ kind: "all" });
      navigateTo("/untagged");
    },
  },
  {
    id: "sources",
    group: "Navigate",
    label: "Sources",
    detail: "Connected accounts and watches",
    icon: IconNodes3,
    keywords: "accounts connect watches",
    shortcut: "nav.sources",
    run: () => navigateTo("/sources"),
  },
  {
    id: "downloads",
    group: "Navigate",
    label: "Downloads",
    detail: "Active and recent transfers",
    icon: IconWindowDownload,
    keywords: "transfers queue",
    shortcut: "nav.downloads",
    run: () => navigateTo("/downloads"),
  },
  {
    id: "tags",
    group: "Navigate",
    label: "Tags",
    detail: "Organize your library",
    icon: IconBookmark,
    keywords: "labels organize",
    run: () => navigateTo("/tags"),
  },
  {
    id: "fish",
    group: "Navigate",
    label: "Fish",
    detail: "Ask your library",
    icon: IconChatBubble,
    keywords: "ask chat ai assistant",
    run: () => navigateTo(fishPath(DEFAULT_FISH_ID)),
  },
  {
    id: "trash",
    group: "Navigate",
    label: "Trash",
    detail: "Recently deleted saves",
    icon: IconTrashXmark,
    keywords: "deleted bin",
    shortcut: "nav.trash",
    run: () => {
      libraryChrome.setNav({ kind: "trash" });
      navigateTo("/trash");
    },
  },
  {
    id: "settings",
    group: "App",
    label: "Open Settings",
    detail: "Preferences, storage, and AI",
    icon: IconGear3,
    keywords: "preferences configuration",
    shortcut: "app.settings",
    run: () => openSettings(),
  },
  ...(import.meta.env.DEV
    ? [
        {
          id: "gallery",
          group: "App",
          label: "Open Gallery",
          detail: "Fish and Koi cards in every state",
          icon: IconAlbum2,
          keywords: "components cards styles dev playground fish animations",
          run: () => navigateTo("/gallery"),
        } satisfies CommandSpec,
        {
          id: "preview-prompt-support",
          group: "App",
          label: "Preview Prompt: support",
          icon: IconSparkle,
          keywords: "dev prompt dialog ask",
          run: () => supportDialog.open(),
        } satisfies CommandSpec,
        ...PROMPT_IDS.map(
          (id) =>
            ({
              id: `preview-prompt-${id}`,
              group: "App",
              label: `Preview Prompt: ${id}`,
              icon: IconSparkle,
              keywords: "dev prompt dialog ask",
              run: () => promptToast.open(id),
            }) satisfies CommandSpec,
        ),
      ]
    : []),
  {
    id: "run-setup",
    group: "App",
    label: "Run Setup Again",
    detail: "Review how Pond is set up",
    icon: IconCompass,
    keywords: "onboarding welcome guide tour setup",
    run: () => setupFlow.open("existing"),
  },
  {
    id: "about-fish",
    group: "App",
    label: "About Fish",
    detail: "What fish do and where Assistant went",
    icon: IconCircleInfo,
    keywords: "assistant chat ai help intro koi",
    run: () => fishIntroDialog.open(),
  },
  {
    id: "support",
    group: "App",
    label: "Support Pond",
    detail: "Buy Me a Coffee or star on GitHub",
    icon: IconCoffee,
    keywords: "donate tip sponsor coffee github star",
    run: () => supportDialog.open(),
  },
  ...(isCosignVotingOpen(Date.now())
    ? [
        {
          id: "cosign",
          group: "App",
          label: "Vote in the Cosign Awards",
          detail: "Raphael is up for People Design",
          icon: IconTrophy,
          keywords: "cosign award nomination vote raphael design",
          run: () => promptToast.open("cosign"),
        } satisfies CommandSpec,
      ]
    : []),
];
