---
name: base-ui
description: Authoritative reference for Base UI (`@base-ui/react`) — the unstyled component library that powers `@pond/ui`. Use whenever you're about to read, write, or refactor code involving any `Base.*` or `@pond/ui` primitive (Menu, Select, Combobox, Dialog, AlertDialog, Popover, Tooltip, Toast, Tabs, Field, Input, NumberField, Switch, Checkbox, Radio, Slider, Toolbar, Collapsible, Accordion, Avatar, ScrollArea, Separator, Toggle, ToggleGroup, NavigationMenu, ContextMenu, Menubar, Drawer, Form, Fieldset, OTPField, PreviewCard, Progress, Meter, Autocomplete). Triggers on `<Menu.…`, `<Select.…`, `<Dialog.…`, `<Popover.…`, `<Combobox.…`, `<Tooltip.…`, `<Toast.…`, mentions of "Base UI", "base-ui", `@base-ui/react`, or any time the agent is about to import from `@pond/ui` or write a `render` prop, `Trigger`, `Portal`, `Positioner`, `Popup`, `GroupLabel`, or other Base UI part.
---

# /base-ui: working with Base UI without guessing

## Rule zero — fetch the doc before writing the primitive

Base UI ships an `llms.txt` index at <https://base-ui.com/llms.txt>. Every component has its own `.md` page at `https://base-ui.com/react/components/<name>.md`. When you are about to use a Base UI primitive you have not used in this session — or anything more than the trivial usage shown in this skill — **fetch the per-component `.md` first**, then write the code.

The component `.md` files are short, exhaustive, and authoritative. They list every part, every prop, every data attribute, and every CSS variable. They are the source of truth — your memory is not.

```text
Menu                    https://base-ui.com/react/components/menu.md
Menubar                 https://base-ui.com/react/components/menubar.md
Context Menu            https://base-ui.com/react/components/context-menu.md
Navigation Menu         https://base-ui.com/react/components/navigation-menu.md
Dialog                  https://base-ui.com/react/components/dialog.md
Alert Dialog            https://base-ui.com/react/components/alert-dialog.md
Popover                 https://base-ui.com/react/components/popover.md
Preview Card            https://base-ui.com/react/components/preview-card.md
Tooltip                 https://base-ui.com/react/components/tooltip.md
Drawer                  https://base-ui.com/react/components/drawer.md
Toast                   https://base-ui.com/react/components/toast.md
Select                  https://base-ui.com/react/components/select.md
Combobox                https://base-ui.com/react/components/combobox.md
Autocomplete            https://base-ui.com/react/components/autocomplete.md
Tabs                    https://base-ui.com/react/components/tabs.md
Accordion               https://base-ui.com/react/components/accordion.md
Collapsible             https://base-ui.com/react/components/collapsible.md
Field                   https://base-ui.com/react/components/field.md
Fieldset                https://base-ui.com/react/components/fieldset.md
Form                    https://base-ui.com/react/components/form.md
Input                   https://base-ui.com/react/components/input.md
Number Field            https://base-ui.com/react/components/number-field.md
OTP Field               https://base-ui.com/react/components/otp-field.md
Toolbar                 https://base-ui.com/react/components/toolbar.md
Toggle                  https://base-ui.com/react/components/toggle.md
Toggle Group            https://base-ui.com/react/components/toggle-group.md
Switch                  https://base-ui.com/react/components/switch.md
Checkbox                https://base-ui.com/react/components/checkbox.md
Checkbox Group          https://base-ui.com/react/components/checkbox-group.md
Radio                   https://base-ui.com/react/components/radio.md
Slider                  https://base-ui.com/react/components/slider.md
Separator               https://base-ui.com/react/components/separator.md
Scroll Area             https://base-ui.com/react/components/scroll-area.md
Progress                https://base-ui.com/react/components/progress.md
Meter                   https://base-ui.com/react/components/meter.md
Avatar                  https://base-ui.com/react/components/avatar.md
Button                  https://base-ui.com/react/components/button.md
```

Handbook (read once if you've not seen Base UI before):

```text
Quick start             https://base-ui.com/react/overview/quick-start.md
Composition             https://base-ui.com/react/handbook/composition.md  (the `render` prop)
Customization           https://base-ui.com/react/handbook/customization.md (data attrs, CSS vars)
Animation               https://base-ui.com/react/handbook/animation.md   (data-starting-style etc.)
Styling                 https://base-ui.com/react/handbook/styling.md
Forms                   https://base-ui.com/react/handbook/forms.md
TypeScript              https://base-ui.com/react/handbook/typescript.md
```

Utilities:

```text
mergeProps              https://base-ui.com/react/utils/merge-props.md
useRender               https://base-ui.com/react/utils/use-render.md
DirectionProvider       https://base-ui.com/react/utils/direction-provider.md
CspProvider             https://base-ui.com/react/utils/csp-provider.md
```

## How Base UI is structured

Every Base UI component is a **family of small parts** exported from a single namespace and composed by the consumer. There is no monolithic `<Menu>` — there's `<Menu.Root>`, `<Menu.Trigger>`, `<Menu.Portal>`, `<Menu.Positioner>`, `<Menu.Popup>`, `<Menu.Item>`, etc. The library is unstyled by default; styling is your job (CSS Modules in this codebase).

The pattern is identical across components, so once you know one you know them all:

```tsx
<X.Root>                            // state owner; props like open / value / onValueChange live here
  <X.Trigger />                     // element that opens the floating surface
  <X.Portal>                        // teleports the surface into a portal (usually document.body)
    <X.Positioner>                  // wraps the floating-ui positioning logic
      <X.Popup>                     // the actual surface (animated, styled)
        <X.Arrow />                 // optional arrow node
        <X.Item />                  // interactive children
      </X.Popup>
    </X.Positioner>
  </X.Portal>
</X.Root>
```

`Portal → Positioner → Popup` is non-negotiable for floating components (Menu, Select, Combobox, Popover, Dialog, AlertDialog, Tooltip, PreviewCard, ContextMenu, NavigationMenu, Menubar). Don't skip a layer or wrap them in extra divs.

## The `render` prop — Base UI's polymorphism

To render a Base UI part as a custom element (your own `<Button>`, an `Sidebar.ToolbarButton`, an `Input` from `@pond/ui`), pass that element to the part's `render` prop. Do NOT wrap your custom element around the part.

Right:

```tsx
<Menu.Trigger
  render={
    <Sidebar.ToolbarButton aria-label="Recently viewed">
      <IconClock width={14} height={14} />
    </Sidebar.ToolbarButton>
  }
/>
```

Wrong (renders an extra DOM node, breaks ARIA wiring, breaks event coordination):

```tsx
<Menu.Trigger>
  <Sidebar.ToolbarButton aria-label="Recently viewed">
    <IconClock />
  </Sidebar.ToolbarButton>
</Menu.Trigger>
```

`render` accepts either a React element (above) or a function that receives merged props:

```tsx
<Menu.Trigger
  render={(props, state) => (
    <Sidebar.ToolbarButton {...props} data-open={state.open ? "" : undefined} />
  )}
/>
```

Use the function form when you need to read state for styling and the data-attribute Base UI emits isn't enough.

See: <https://base-ui.com/react/handbook/composition.md>.

## Group parts must live inside their `Group`

This is the trap I hit most often. Any `*GroupLabel`, `*GroupItem`, or other "group child" part **must be a descendant of its sibling `Group` part**, or Base UI throws `…GroupRootContext is missing`.

Right:

```tsx
<Menu.Popup>
  <Menu.Group>
    <Menu.GroupLabel>Recently viewed</Menu.GroupLabel>
    <Menu.Item>…</Menu.Item>
  </Menu.Group>
</Menu.Popup>
```

Wrong:

```tsx
<Menu.Popup>
  <Menu.GroupLabel>Recently viewed</Menu.GroupLabel>   {/* ❌ no Group ancestor */}
  <Menu.Item>…</Menu.Item>
</Menu.Popup>
```

The same rule applies to: `Select.Group` + `Select.GroupLabel`, `Combobox.Group` + `Combobox.GroupLabel`, `RadioGroup` + `Radio`, `CheckboxGroup` + `Checkbox`, `ToggleGroup` + `Toggle`, `Tabs.List` + `Tabs.Tab`, etc. If a part has "Group" in any sibling part's name, assume the parent-child relationship is required.

## Disabled / open / selected state via `data-*` attributes

Base UI never gives you a `className` for state. It writes data attributes onto the rendered element and you target them in CSS:

```css
.popup {
  &[data-starting-style],
  &[data-ending-style] { opacity: 0; transform: scale(0.97); }
  &[data-open]         { /* open animation end-state */ }
}

.item {
  &[data-highlighted]  { background: var(--ds-gray-a3); }
  &[data-disabled]     { opacity: 0.5; cursor: not-allowed; }
  &[data-checked]      { color: var(--ds-accent-11); }
}
```

The full list of data attributes a part emits is in its component `.md`. When you need to style a state, fetch that page first and check the table — don't guess names.

## Animations: `data-starting-style` / `data-ending-style`

Base UI handles open / close by mounting the surface, painting it with `data-starting-style`, then removing the attribute on the next frame. To animate, write your transition keyed off those attributes:

```css
.popup {
  transition: opacity 120ms ease, transform 120ms ease;

  &[data-starting-style],
  &[data-ending-style] {
    opacity: 0;
    transform: scale(0.97);
  }
}
```

`transform-origin: var(--transform-origin)` lets you anchor scale animations to the trigger — Base UI sets this CSS variable on the positioner.

See: <https://base-ui.com/react/handbook/animation.md>.

## Floating component variables

`Positioner` sets these CSS variables on itself:

- `--available-width`, `--available-height` — viewport-aware max sizes for the popup
- `--anchor-width`, `--anchor-height` — the trigger's box (great for matching `Select` popup to trigger width)
- `--transform-origin` — anchored to the trigger

Read them with `var(--available-width)` etc. inside your popup CSS.

## Common mistakes to avoid

- **Skipping `Portal` / `Positioner`.** Always: `Trigger → Portal → Positioner → Popup`.
- **Putting the popup inside the trigger.** Trigger and Popup are siblings under `Root`, not parent-child.
- **`Trigger` as wrapper instead of `render` prop.** See above.
- **Empty `<X.Group>` wrappers around a single item.** Use `Group` only when you actually want a labelled or semantically-grouped block; a flat list of items needs no `Group`.
- **Missing `Value` inside `Select.Trigger`.** `Select.Trigger` does not auto-render the current value; you compose `<Select.Trigger><Select.Value /></Select.Trigger>`.
- **Using `value` instead of `defaultValue` for uncontrolled state.** Base UI follows React's controlled/uncontrolled split strictly. Pick one.
- **`onValueChange` vs `onCheckedChange`.** Different parts use different change handler names. Check the component `.md`.
- **Forgetting `keepMounted` when animating exit.** `Popup` unmounts by default; use the documented `keepMounted` / `actionsRef` pattern when you want CSS to drive the exit animation.
- **Treating `disabled` as visually only.** A disabled Base UI part also blocks focus and keyboard nav by design. Don't reach for `aria-disabled` to "softly" disable; either truly disable or don't.

## Quick recipes

### Menu with a labelled group

```tsx
<Menu.Root>
  <Menu.Trigger render={<MyButton />} />
  <Menu.Portal>
    <Menu.Positioner side="bottom" align="start" sideOffset={6}>
      <Menu.Popup>
        <Menu.Group>
          <Menu.GroupLabel>Recently viewed</Menu.GroupLabel>
          <Menu.Item onClick={…}>…</Menu.Item>
        </Menu.Group>
      </Menu.Popup>
    </Menu.Positioner>
  </Menu.Portal>
</Menu.Root>
```

### Select that matches its trigger width

```tsx
<Select.Root value={value} onValueChange={setValue}>
  <Select.Trigger>
    <Select.Value />
    <Select.Icon />
  </Select.Trigger>
  <Select.Portal>
    <Select.Positioner sideOffset={6}>
      <Select.Popup style={{ width: "var(--anchor-width)" }}>
        <Select.Item value="a">A</Select.Item>
        <Select.Item value="b">B</Select.Item>
      </Select.Popup>
    </Select.Positioner>
  </Select.Portal>
</Select.Root>
```

### Dialog with backdrop

```tsx
<Dialog.Root open={open} onOpenChange={setOpen}>
  <Dialog.Portal>
    <Dialog.Backdrop />
    <Dialog.Popup>
      <Dialog.Title>…</Dialog.Title>
      <Dialog.Description>…</Dialog.Description>
      <Dialog.Close render={<Button />}>Close</Dialog.Close>
    </Dialog.Popup>
  </Dialog.Portal>
</Dialog.Root>
```

### Tooltip wrapping a disabled trigger

`Tooltip.Trigger` is the focusable target. If your trigger is `disabled`, the tooltip won't fire on hover unless you keep it focusable. Either use `aria-disabled` on the trigger and prevent the click yourself, or move the tooltip to a wrapper.

## When `@pond/ui` already wraps a Base UI part

Always prefer `@pond/ui`'s wrapper over reaching for `@base-ui/react` directly. The wrappers in `packages/ui/src/<name>/` apply Pond's class names, defaults, and accessibility props. If a wrapper doesn't expose the part you need, extend the wrapper rather than bypassing it. The compound-component conventions in `.cursor/components/SKILL.md` apply to those wrappers.

## Workflow checklist

When you're about to write Base UI code:

- [ ] Identify the component name (Menu, Select, …).
- [ ] Fetch `https://base-ui.com/react/components/<name>.md` if you haven't this session.
- [ ] Confirm the part hierarchy (`Root → Trigger → Portal → Positioner → Popup → …`).
- [ ] Check the `data-*` attribute table for the parts you'll style.
- [ ] If you need polymorphism, use the `render` prop, not a wrapping element.
- [ ] If you're using `*GroupLabel` or any group-scoped part, wrap it in its `Group`.
- [ ] If the part has both controlled (`value`) and uncontrolled (`defaultValue`) modes, pick one and stick with it.
- [ ] Prefer the `@pond/ui` wrapper; only drop down to `@base-ui/react` when necessary.
