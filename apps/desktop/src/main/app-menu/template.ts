import type { RecentMenuEntry } from "../../shared/constants";
import { buildEditSection } from "./edit-section";
import { buildFileSection } from "./file-section";
import { buildLibrarySection } from "./library-section";
import { buildGoSection, buildHistorySection } from "./navigation-sections";
import { buildOrganizeSection } from "./organize-section";
import {
  buildApplicationSections,
  buildDeveloperSections,
  buildHelpSection,
  buildSettingsItem,
  buildWindowSection,
} from "./system-sections";
import type { AppMenuContext, AppMenuItem } from "./types";
import { buildViewSection } from "./view-section";

export function buildAppMenuTemplate(
  context: AppMenuContext,
  recentEntries: Array<RecentMenuEntry>,
): Array<AppMenuItem> {
  const settingsItem = buildSettingsItem(context);

  return [
    ...buildApplicationSections(context, settingsItem),
    buildFileSection(context),
    buildEditSection(context, settingsItem),
    buildOrganizeSection(context),
    buildViewSection(context),
    buildGoSection(context),
    buildHistorySection(context, recentEntries),
    buildLibrarySection(context),
    buildWindowSection(context),
    ...buildDeveloperSections(context),
    buildHelpSection(context),
  ];
}
