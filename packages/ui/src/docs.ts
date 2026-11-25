import { docs as accordion } from "./accordion/examples";
import { docs as badge } from "./badge/examples";
import { docs as brandTile } from "./brand-tile/examples";
import { docs as button } from "./button/examples";
import { docs as changelog } from "./changelog/examples";
import { docs as checkbox } from "./checkbox/examples";
import { docs as chip } from "./chip/examples";
import { docs as colorField } from "./color-field/examples";
import { docs as combobox } from "./combobox/examples";
import { docs as contentRow } from "./content-row/examples";
import { docs as contextMenu } from "./context-menu/examples";
import { docs as dataTable } from "./data-table/examples";
import { docs as datePicker } from "./date-picker/examples";
import { docs as dialog } from "./dialog/examples";
import { docs as empty } from "./empty/examples";
import { docs as field } from "./field/examples";
import { docs as fileIcon } from "./file-icon/examples";
import { docs as hoverHighlight } from "./hover-highlight/examples";
import { docs as iconMorph } from "./icon-morph/examples";
import { docs as input } from "./input/examples";
import { docs as keyboard } from "./keyboard/examples";
import { docs as loader } from "./loader/examples";
import { docs as logo } from "./logo/examples";
import { docs as menu } from "./menu/examples";
import { docs as message } from "./message/examples";
import { docs as numberField } from "./number-field/examples";
import { docs as paneHeader } from "./pane-header/examples";
import { docs as pickerPanel } from "./picker-panel/examples";
import { docs as popover } from "./popover/examples";
import { docs as progress } from "./progress/examples";
import { docs as progressiveBlur } from "./progressive-blur/examples";
import { docs as prompt } from "./prompt/examples";
import { docs as rating } from "./rating/examples";
import { docs as reveal } from "./reveal/examples";
import { docs as select } from "./select/examples";
import { docs as settings } from "./settings/examples";
import type { ComponentDocs } from "./shared/docs";
import { docs as shell } from "./shell/examples";
import { docs as shimmer } from "./shimmer/examples";
import { docs as sidebar } from "./sidebar/examples";
import { docs as slider } from "./slider/examples";
import { docs as splitButton } from "./split-button/examples";
import { docs as stepper } from "./stepper/examples";
import { docs as swap } from "./swap/examples";
import { docs as switchDocs } from "./switch/examples";
import { docs as table } from "./table/examples";
import { docs as tabs } from "./tabs/examples";
import { docs as textReveal } from "./text-reveal/examples";
import { docs as titleBar } from "./title-bar/examples";
import { docs as toast } from "./toast/examples";
import { docs as toggleGroup } from "./toggle-group/examples";
import { docs as toggle } from "./toggle/examples";
import { docs as tokenInput } from "./token-input/examples";
import { docs as toolbar } from "./toolbar/examples";
import { docs as tooltip } from "./tooltip/examples";
import { docs as tray } from "./tray/examples";
import { docs as video } from "./video/examples";
import { docs as windowDocs } from "./window/examples";
import { docs as wordmark } from "./wordmark/examples";

export type {
  ComponentDocs,
  ComponentTier,
  Example,
  KeyBinding,
  Part,
} from "./shared/docs";
export { TIER_LABELS } from "./shared/docs";

export const COMPONENT_DOCS: ReadonlyArray<ComponentDocs> = [
  accordion,
  badge,
  brandTile,
  button,
  changelog,
  checkbox,
  chip,
  colorField,
  combobox,
  contentRow,
  contextMenu,
  dataTable,
  datePicker,
  dialog,
  empty,
  field,
  fileIcon,
  hoverHighlight,
  iconMorph,
  input,
  keyboard,
  loader,
  logo,
  menu,
  message,
  numberField,
  paneHeader,
  pickerPanel,
  popover,
  progress,
  progressiveBlur,
  prompt,
  rating,
  reveal,
  select,
  settings,
  shell,
  shimmer,
  sidebar,
  slider,
  splitButton,
  stepper,
  swap,
  switchDocs,
  table,
  tabs,
  textReveal,
  titleBar,
  toast,
  tokenInput,
  toggle,
  toggleGroup,
  toolbar,
  tooltip,
  tray,
  video,
  windowDocs,
  wordmark,
];

export function docsFor(slug: string): ComponentDocs | undefined {
  return COMPONENT_DOCS.find((docs) => docs.slug === slug);
}
