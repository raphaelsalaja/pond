# @pond/ui audit

Working inventory for the design system pass. Delete this file once every verdict below has shipped.

Usage counts are files under `apps/` (and `packages/video` where noted) that import the component. Behavior is what supplies keyboard, focus and ARIA. Focus rings come from `reset.css` plus `focus-modality.ts` unless a row says otherwise.

## Verdicts

| Component | Usage | Behavior | Accessibility gaps | API gaps | Tests | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| Accordion | 4 | Base UI accordion | None | None | Static | Keep |
| AgentHeader | 0 | Wraps `Pane.Header` | None | `ComponentProps`, not a compound | None | Cut: duplicate of `Pane.Header` |
| Badge | 3 | None | None | `.badge` class carries the component name | Static | Keep, rename class to `.root` |
| BrandTile | 2 | None | Always `aria-hidden`, decorative only | Missing `package.json` subpath | None | Keep, add subpath |
| Button | 150 | Base UI button | `icon` doesn't require `aria-label`; transitions ignore reduced motion | None | Static | Keep, require a name for icon buttons |
| Changelog | 1 | None | None | Missing subpath | None | Keep, add subpath |
| Checkbox | 11 | Base UI checkbox | None | None | None | Keep |
| Chip | 18 | Menu and Button | `Clear` and `Filter` clear don't require a label | None | Static | Keep, require clear labels |
| CodeBlock | 1 (agent) | Hand-rolled clipboard | None | None | None | Move to desktop `agent` |
| ColorField | 4 | React Aria | Focus state is `data-focus`, not `:focus-visible` | Picker parts take ad-hoc props | Behavior | Keep, rebuild on UI SDK, drop React Aria |
| Combobox | 2 | Base UI combobox | `ChipRemove` has no default label; transitions ignore reduced motion | None | None | Keep |
| Composer | 2 (agent) | Hand-rolled form | `Composer.Input` has no default name | Two exports (`Composer`, `ComposerView`) | Desktop only | Move to desktop `agent` |
| ContentRow | 1 | Native button | Transitions ignore reduced motion | `ComponentProps` | None | Keep |
| ContextMenu | 1 | Base UI context menu | Shared popup transitions ignore reduced motion | None | None | Keep |
| ContextPicker | 0 | Hand-rolled filter | No arrow-key navigation | Not a compound; `.context-picker` class | None | Cut |
| DataTable | 15 | TanStack Table, TanStack Virtual, dnd-kit reorder | None | Root takes ad-hoc props | Behavior | Keep, move column reorder to UI SDK |
| DatePicker | 1 | Hand-rolled calendar grid | Selected day uses `aria-pressed`, grid expects `aria-selected` | Single function | Behavior | Keep |
| Dialog | 60+ | Base UI dialog and alert dialog | Paged `Description` is a plain `<p>`, loses `aria-describedby` | None | None | Keep, wire paged description |
| Drawer | 0 | Base UI drawer | Transitions ignore reduced motion | None | None | Cut |
| Empty | 17 | None | None | None | None | Keep |
| ErrorNotice | 2 (agent) | Reveal and Button | None | Single function | None | Move to desktop `agent` |
| Field | 14 | Base UI field | None | None | None | Keep |
| Input | 51 | Base UI input | Transitions ignore reduced motion | `ComponentProps` | Static | Keep |
| Keyboard | 9 | None | None | None | None | Keep |
| Loader | 9 | CSS | None | `ComponentProps` | None | Keep |
| Logo | 6 | None | None | None | None | Keep |
| Menu | 41 | Base UI menu | Shared popup transitions ignore reduced motion | None | Static | Keep |
| Message | 1 + video | None | No live region for streaming replies | `role` prop shadows the HTML attribute | None | Keep, shared with `packages/video` |
| Pane | 4 | None | None | Folder `pane-header` exports `Pane` | Static | Keep |
| PickerPanel | 9 | Popover plus hand-rolled cursor | Items don't set `aria-selected` | `ComponentProps` in places | Static | Keep, rebuild cursor on UI SDK |
| Popover | 11 | Base UI popover | Shared popup transitions ignore reduced motion | None | None | Keep |
| Prompt | 2 + video | Reveal | `Freeform` input has no name; `Choices` has no legend | None | None | Keep, shared with `packages/video` |
| Rating | 2 | Base UI radio group | Empty stars were `gray-6`, under 3:1 | No mixed value | Static | Keep; takes `null` for a mixed value and replaces desktop `RatingStars` |
| ReferenceList | 0 runtime | Hand-rolled list | No list role | Not a compound | None | Cut UI; `ReferenceItem` type moves to desktop |
| Reveal | 5 | Motion | None | Custom props | None | Keep |
| RunStatus | 1 (agent) | Reveal and Shimmer | None | `.run-status` class; no `className` | None | Move to desktop `agent` |
| ScrollArea | 0 | `data-scroll-fade` attribute | None | None | Static | Cut: the attribute alone does the job |
| Select | 23 | Base UI select | None | None | None | Keep |
| Settings | 43 | None | None | None | None | Keep |
| Shell | 1 | None | None | None | None | Keep |
| Shimmer | 3 | CSS | None | None | None | Keep |
| Sidebar | 16 | Base UI button, hand-rolled collapsible, UI SDK tree | Tree roles live in the desktop folder tree | None | Behavior | Keep; `Sidebar.Tree` ships, the desktop folder tree moves onto it once browser tests settle multi-select, drag and rename |
| Slider | 10 | Base UI slider | None | None | None | Keep |
| Sounds | 2 | `@web-kits/audio` | Not applicable | None | Static | Keep |
| Stepper | 1 | Hand-rolled number field | No `role="group"` | Custom props | None | Keep, add group role |
| Swap | 2 | Motion | None | None | None | Keep |
| Switch | 14 | Base UI switch | Transitions ignore reduced motion | None | Static | Keep |
| Tab | 0 | Hand-rolled overflow | No tab roles, no keyboard | `ComponentProps` | None | Cut: `Tabs` owns tabs |
| Table | 1 | Native table | None | `containerClassName` prop | None | Keep: different job from `DataTable` |
| Tabs | 2 | Base UI tabs | None | None | Static | Keep |
| Thread | 5 (agent) | `use-stick-to-bottom` | No `role="log"` on the message stream | `.thread` class | Desktop only | Move to desktop `agent` |
| TitleBar | 1 | None | None | None | None | Keep |
| Toast | 4 | Base UI toast | Base UI owns the live region | None | Static | Keep |
| Toggle | 12 | Base UI toggle | Icon toggles don't require a name | None | None | Keep |
| ToggleGroup | 11 | Base UI toggle group | None | None | None | Keep |
| Toolbar | 4 | Base UI toolbar | None | `Row` uses `HTMLAttributes` | None | Keep |
| Tooltip | 42 | Base UI tooltip | None | Callable plus compound | None | Keep |
| Tray | 2 | `useRender` | No `role="toolbar"`, no arrow keys | None | None | Keep, add toolbar behavior |
| Video | 10 | Base UI slider, hand-rolled media state | `Video.Media` has no default label | Missing subpath | Behavior | Keep, add subpath |
| Window | 2 | Hand-rolled edge resize | None | None | Behavior | Keep, move resize to UI SDK |
| Wordmark | 3 | Logo | None | None | Static | Keep |

## Overlaps reviewed

- `Tab` and `Tabs`: `Tabs` is the real tablist. Cut `Tab`.
- `Toggle`, `ToggleGroup` and `Switch`: separate jobs. `Switch` is a setting, `Toggle` a pressed tool button, `ToggleGroup` a segmented control. Keep all three.
- `Badge` and `Chip`: status label versus interactive filter or tag. Keep both.
- `Table` and `DataTable`: styled markup versus a virtualized, sortable grid. Keep both.
- `Menu`, `ContextMenu`, `Select`, `Combobox` and `PickerPanel`: each maps to a different Base UI root or interaction. `PickerPanel` keeps its own list cursor, rebuilt on UI SDK. `ContextPicker` is cut.
- `Reveal`, `useTextReveal`, `Swap` and `Shimmer`: size reveal, typed text, keyed crossfade and text shimmer. Keep all four.
- `Loader` and `Shimmer`: busy indicator versus emphasis. Keep both.
- `Dialog` and `Drawer`: `Drawer` has no users. Cut it.
- `Shell` and `Window`: `Shell` still frames the library page. Keep for now.

## Exports

Every component folder gets a `package.json` subpath, so `@pond/ui/<folder>` always resolves. Light, app-agnostic components are also exported from `index.ts`. `DataTable` and `Sounds` stay subpath-only so pages that don't render them don't load them.

## Cross-cutting fixes

- Reduced motion now stops transitions and press scale in Button, Checkbox, Input, Switch, Combobox, Tray, Settings, Loader and the shared popup and toast styles. ContentRow has no transitions.
- A literal `icon` on `Button` or `Toggle` requires `aria-label` or `aria-labelledby`. `Chip.Clear` and `Combobox.ChipRemove` default to "Remove". Wrappers that forward a boolean `icon` (Menu, PickerPanel, ContentRow) still rely on their own callers for a name.
- The faintest text role is `--ds-foreground-tertiary`, so every text color clears AA.
- The focus ring was `--ds-accent-a6`, between 1.4:1 and 2.1:1 against the surfaces. It is now `--ds-accent`, at least 3.7:1 in every preset, and `tokens.test.ts` holds it there.
- The off Switch track is `--ds-foreground-tertiary`, which clears 3:1 at contrast 100.

## Native buttons in the apps

Every bare `<button>` under `apps/` is a test fixture. The product violations were two `PropertyList.Row` elements with `role="button"` and hand-rolled Enter and Space handling, in the save detail facts and info sections. Both now render through `Button` with `nativeButton={false}`.
