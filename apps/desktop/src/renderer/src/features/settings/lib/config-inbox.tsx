import {
  type Binding,
  group,
  type SettingsValues,
} from "@/features/settings/lib/engine-types";
import { usePrefs } from "@/shared/state/prefs";

type InboxValues = {
  inboxEnabled: boolean;
  inboxCaptures: boolean;
  inboxSync: boolean;
  inboxWatches: boolean;
  inboxImports: boolean;
};

function useInboxBinding(): Binding<InboxValues> {
  const [inbox, patch, loaded] = usePrefs("inbox");
  const { channels } = inbox;
  return {
    loaded,
    values: {
      inboxEnabled: inbox.enabled,
      inboxCaptures: channels.captures,
      inboxSync: channels.sync,
      inboxWatches: channels.watches,
      inboxImports: channels.imports,
    },
    patch: (delta) =>
      patch({
        enabled: delta.inboxEnabled ?? inbox.enabled,
        channels: {
          captures: delta.inboxCaptures ?? channels.captures,
          sync: delta.inboxSync ?? channels.sync,
          watches: delta.inboxWatches ?? channels.watches,
          imports: delta.inboxImports ?? channels.imports,
        },
      }),
  };
}

const inboxOff = (values: SettingsValues) => values.inboxEnabled !== true;

export const inboxGroup = group.with(useInboxBinding, {
  title: "Inbox",
  items: [
    {
      control: "switch",
      key: "inboxEnabled",
      title: "Add New Saves to Inbox",
      description: "Saves you already have stay out until you add them.",
      keywords: ["review", "triage", "process", "snooze"],
    },
    {
      control: "switch",
      key: "inboxCaptures",
      title: "Captures",
      description: "The extension, Quick Add, pasting, and dropped files.",
      disabled: inboxOff,
    },
    {
      control: "switch",
      key: "inboxSync",
      title: "Source Sync",
      description: "Saves fetched from your connected accounts.",
      disabled: inboxOff,
    },
    {
      control: "switch",
      key: "inboxWatches",
      title: "Watches",
      description: "Saves from Watches and the watched folder.",
      disabled: inboxOff,
    },
    {
      control: "switch",
      key: "inboxImports",
      title: "Imports",
      description: "Eagle libraries, bookmarks, and exports from other apps.",
      disabled: inboxOff,
    },
  ],
});
