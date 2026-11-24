# Design principles

Pond borrows its sensibility from Benji Taylor's [Family Values](https://benji.org/family-values):
**simplicity**, **fluidity**, and **delight**. It translates them from an iOS wallet
into a macOS/Electron desktop app. Simplicity keeps Pond accessible, fluidity keeps it
oriented, and delight makes it feel cared for. Together they are how we respect your
time, intelligence, and emotional experience.

This is shared vocabulary, not a rulebook to follow blindly. When in doubt, optimise for
the feeling described here.

## The three principles

### Simplicity: gradual revelation

Show the fundamentals; reveal everything else as it becomes relevant. Complexity stays
out of sight and out of mind until you reach for it. Think of walking through a
doorway: you glimpse a room from afar, and it resolves into detail as you enter.

On the desktop this lives in our overlays. Base UI `Menu`, `ContextMenu`, `Popover`,
`Drawer`, and `Dialog` are Pond's "trays". Each surfaces a single focused action or
piece of content, layered on top of the current context rather than navigating away from
it.

### Fluidity: continuous transitions

Treat the app as one continuous space with consistent physical rules. Every motion should
help you understand your path from A to B. We fly instead of teleport: a transition
should clarify what changed and where things went, never decorate.

### Delight: selective emphasis

Delight is deliberate, not sprinkled everywhere. It earns its place by surprise and
novelty, which is why it belongs most in the corners of the app, not the highways. The
goal is to make Pond feel human and considered, and to reward your investment.

## iOS to desktop translation

| Family (iOS)                                          | Pond (desktop)                                                                           |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Dynamic tray system                                   | Base UI `Menu` / `Popover` / `Drawer` / `Dialog` overlays                                |
| Tray emerges from a button, preserving context        | Popovers/menus anchored to their trigger; detail opens as an overlay, not a route swap   |
| Tray title + back/close icon                          | Overlay header (title + close), submenu back navigation                                  |
| Each tray = one action or one piece of content        | One focused job per overlay/section                                                      |
| Tray theme adapts to context (dark flow -> dark tray) | Overlays inherit the active theme tokens                                                 |
| Directional tab motion (tap left -> slides left)      | Directional route/media transitions in the same direction as the action                  |
| Continue -> Confirm text morph (shared letters)       | Morphing labels/counts (`AppliedBadge`, position counter) rather than hard swaps         |
| Wallet cards travel between screens                   | `save-card` -> detail modal continuity; persistent header/footer/side panel across saves |
| Confetti after wallet backup                          | One-time celebratory flourish on rare success (completed backfill)                       |
| Skeuomorphic trash                                    | Cards tumble toward the trash action on delete                                           |
| Animated arrow in empty browser state                 | Guiding affordance in the library empty state                                            |

## The Delight-Impact Curve

Potential for delight **increases** as feature-usage frequency **decreases**. The
specialness of a moment fades with repetition.

- **Rare + significant** (creating a Library, a successful backup/export, empty states,
  first-run moments): high-intensity, memorable moments are worth it.
- **Frequent** (hover, selection, typing, opening saves): restrained polish only. Doing
  too much here turns delight into friction.

When deciding how much delight to add, ask how often it appears. The less often,
the more you can afford.

## Motion standard: no teleporting UI

Newly revealed interface must transition into place. User-visible controls, fields,
rows, panels, menus, notices, and stateful content must not appear at their final
size and position.

- Inline reveals should animate the space they occupy as well as opacity and a small,
  directional translation, so surrounding content moves continuously instead of jumping.
- Overlays should use the enter and exit transitions provided by the shared Base UI
  primitives. List and grid additions should use the lightest transition that preserves
  spatial continuity.
- When the same conceptual object persists across states, transform that object from its
  old state to its new state. Do not duplicate it, remount it, or disguise a swap with a
  crossfade. Shared geometry, letters, icons, and layout anchors should visibly carry
  through the transition.
- Related changes must read as one event. Coordinate their timing, easing, and direction
  so the interface moves as a single system rather than as independently updating parts.
- Direction must follow the app's spatial model: left/right navigation moves laterally,
  a control reveals content from its own location, and an item being moved visibly arrives
  at its destination. Motion must preserve orientation and explain cause and effect.
- When two states cannot meaningfully coexist, complete the outgoing signal before
  introducing the incoming one. Never let animation imply that contradictory states are
  active at the same time.
- Motion must use the shared `--ds-duration-*` and `--ds-easing-*` vocabulary. Frequent
  actions should be restrained; rarer, significant moments may use more emphasis.
- Focus, input, and pointer interaction must be available immediately. Motion explains a
  state change; it must never delay or gate the action.
- Reduced-motion preferences must reach the same final state immediately. No information
  or affordance may depend on seeing the transition.

An animation is not done when its endpoints are correct. Watch it at normal speed and
inspect its intermediate states. Refine timing, geometry, and sequencing until the path
feels coherent; small defects compound across the product as quickly as small,
considered details do.

The exceptions are elements whose motion would misrepresent their behavior, content that
is already present and merely updates in place, and transitions owned by the operating
system or an existing component primitive. When an exception applies, preserve spatial
continuity another way rather than adding decorative motion.

## Do / don't

- **Do** reveal depth progressively through submenus, side panels, and overlays, instead
  of showing everything at once.
- **Do** make transitions directional and purposeful: motion should explain the change.
- **Do** give every newly mounted or revealed user-visible element an intentional enter
  transition, following the motion standard above.
- **Do** keep persistent elements consistent. If a component occupies a space and will
  persist into the next phase, it must not duplicate, remount, or re-animate. Only the
  content that actually changed should transition.
- **Do** vary an overlay's height/shape between steps so progression is unmistakable.
- **Do** pull from the shared motion vocabulary, the `--ds-duration-*` / `--ds-easing-*`
  tokens and the presets in [`lib/motion.ts`](./lib/motion.ts), rather than one-off
  values.
- **Do** give pressed controls physical feedback. Icons answer a click with `pop()`
  from `@pond/ui`, a quick squish that releases without overshoot. Clicked things never
  bounce: popups, dialogs and toggles settle on `--ds-easing-snap`.
- **Do** respect reduced motion. The global `MotionConfig reducedMotion="user"` in
  [`App.tsx`](./App.tsx) and the `data-reduce-motion` CSS overrides in
  [`styles.css`](./styles.css) must cover every new animation. Nothing may depend on
  motion to be legible.
- **Don't** add motion for its own sake, or animate a component that's already on screen
  and staying put.
- **Don't** add a footer Cancel button to a dialog that already has a header close
  control. Reserve cancel actions for stopping work that is already in progress.
- **Don't** use full-screen/route swaps for transient actions that belong in an overlay.
- **Don't** spend high-intensity delight on high-frequency interactions.

## Further reading

The practical interpretation above also draws from Benji's notes on coherent live
updates in [Liveline](https://benji.org/liveline), real transformation rather than icon
swapping in [Morphing icons with Claude](https://benji.org/morphing-icons-with-claude),
shape-changing controls in [Drawesome](https://benji.org/drawesome), iterative visual
refinement in [Agentation](https://benji.org/agentation), precise visual feedback in
[Annotating for agents](https://benji.org/annotating), and playfulness in
[Honkish](https://benji.org/honkish).
