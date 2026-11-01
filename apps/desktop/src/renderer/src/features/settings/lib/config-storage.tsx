import { StorageLocationSettings } from "@/features/settings/components/sections/storage/location";
import { StorageSummary } from "@/features/settings/components/sections/storage/storage-summary";
import {
  defineSection,
  type SettingsValues,
} from "@/features/settings/lib/engine-types";

const guardsOff = (v: SettingsValues) => v.guardsEnabled !== true;
const limitOff = (v: SettingsValues) => guardsOff(v) || v.maxLibraryGb === null;

export const storageSection = defineSection("storage", {
  title: "Storage",
  description: "Manage disk usage, location, and size limits.",
  groups: [
    { title: "Overview", render: () => <StorageSummary /> },
    {
      title: "Location",
      fullWidth: true,
      render: () => <StorageLocationSettings />,
    },
    {
      title: "Web Pages",
      items: [
        {
          control: "switch",
          key: "autoArchive",
          title: "Archive Web Pages Automatically",
          description: "Off keeps the title, description, and preview image.",
        },
      ],
    },
    {
      title: "Storage Limits",
      items: [
        {
          control: "switch",
          key: "guardsEnabled",
          title: "Limit Library Size",
          description: "Act when the library grows too large.",
        },
        {
          control: "select",
          key: "maxLibraryGb",
          title: "Size Limit",
          description: "Act when the library exceeds this.",
          disabled: guardsOff,
          options: [
            { value: 10, label: "10\u00A0GB" },
            { value: 25, label: "25\u00A0GB" },
            { value: 50, label: "50\u00A0GB" },
            { value: 100, label: "100\u00A0GB" },
            { value: 250, label: "250\u00A0GB" },
            { value: 500, label: "500\u00A0GB" },
            { value: null, label: "No Limit" },
          ],
        },
        {
          control: "select",
          key: "warnAtPercent",
          title: "Warn At",
          description: "Show a banner at this share of the limit.",
          disabled: limitOff,
          options: [
            { value: 70, label: "70%" },
            { value: 80, label: "80%" },
            { value: 90, label: "90%" },
            { value: 95, label: "95%" },
          ],
        },
        {
          control: "select",
          key: "action",
          title: "When the Limit Is Reached",
          description: "What Pond does at the cap.",
          disabled: limitOff,
          options: [
            { value: "warn", label: "Warn" },
            { value: "pauseSync", label: "Pause Fetching" },
            { value: "pauseVideo", label: "Pause Video Downloads" },
          ],
        },
      ],
    },
  ],
});
