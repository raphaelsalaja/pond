import { IconFile } from "@pond/icons";
import { TokenInput } from ".";
import type { TokenInputValue } from ".";
import { Chip } from "../chip";
import type { ComponentDocs } from "../shared/docs";

const SAVES = [
  { value: "save-1", label: "Brutalist type specimens" },
  { value: "save-2", label: "Kinetic poster series" },
  { value: "save-3", label: "Moodboard for the launch" },
];

const DRAFT: TokenInputValue = [
  "Compare ",
  { type: "save", value: "save-1", label: "Brutalist type specimens" },
  " with ",
  { type: "save", value: "save-2", label: "Kinetic poster series" },
];

function Mentions({
  defaultValue,
  disabled,
}: {
  defaultValue?: TokenInputValue;
  disabled?: boolean;
}) {
  return (
    <TokenInput.Root
      defaultValue={defaultValue}
      disabled={disabled}
      renderToken={(token) => (
        <TokenInput.Token>
          <Chip.Item tone="mention">
            <Chip.Icon>
              <IconFile size={12} />
            </Chip.Icon>
            <Chip.Label>{token.label}</Chip.Label>
          </Chip.Item>
        </TokenInput.Token>
      )}
    >
      <TokenInput.Editor
        aria-label="Message"
        placeholder="Type @ to mention a Save"
      />
      <TokenInput.Menu triggers={[{ char: "@", type: "save", items: SAVES }]}>
        <TokenInput.Popup>
          <TokenInput.Status />
          <TokenInput.Empty>No Saves found.</TokenInput.Empty>
          <TokenInput.List>
            {SAVES.map((save) => (
              <TokenInput.Item
                key={save.value}
                value={save.value}
                label={save.label}
              >
                <TokenInput.ItemIcon>
                  <IconFile />
                </TokenInput.ItemIcon>
                <TokenInput.ItemLabel>{save.label}</TokenInput.ItemLabel>
              </TokenInput.Item>
            ))}
          </TokenInput.List>
        </TokenInput.Popup>
      </TokenInput.Menu>
    </TokenInput.Root>
  );
}

export const docs: ComponentDocs = {
  slug: "token-input",
  name: "Token Input",
  tier: "form",
  summary:
    "A text field that holds tokens, like mentioned Saves, between its words, with a menu that suggests them.",
  parts: [
    {
      name: "TokenInput.Root",
      description:
        "Holds the value: text and tokens. `renderToken` draws each token, and `onSubmit` runs on Enter.",
    },
    {
      name: "TokenInput.Editor",
      description: "The editable text. Shows `placeholder` while empty.",
    },
    {
      name: "TokenInput.Token / TokenInput.TokenRemove",
      description:
        "A token's content inside `renderToken`, and a part that removes it.",
    },
    {
      name: "TokenInput.Menu",
      description:
        "Suggests tokens when a trigger like `@` is typed. `triggers` lists each trigger and its items or loader.",
    },
    {
      name: "TokenInput.Popup / TokenInput.List / TokenInput.Item",
      description:
        "The suggestion popup, opening above the field, and its options.",
    },
    {
      name: "TokenInput.ItemIcon / TokenInput.ItemLabel",
      description: "An option's leading media and its text.",
    },
    {
      name: "TokenInput.Empty / TokenInput.Status",
      description:
        "What shows while nothing matches, and the polite count read to screen readers.",
    },
  ],
  keyboard: [
    { keys: "@", action: "Opens the suggestions" },
    { keys: "ArrowUp / ArrowDown", action: "Moves through the suggestions" },
    { keys: "Enter / Tab", action: "Inserts the highlighted suggestion" },
    { keys: "Escape", action: "Closes the suggestions" },
    { keys: "Backspace / Delete", action: "Removes the token at the caret" },
    { keys: "Enter", action: "Submits, when `onSubmit` is set" },
    { keys: "Shift+Enter", action: "Starts a new line" },
  ],
  accessibility: [
    "The editor is a multiline textbox; name it with `aria-label` or a visible label.",
    "Each token reads as its label and kind, and inserting or removing one is announced.",
    "Focus stays in the editor while arrow keys move the highlight, which is exposed with `aria-activedescendant`.",
    "`TokenInput.Status` announces the number of suggestions and loading.",
  ],
  examples: [
    { name: "Empty", render: () => <Mentions /> },
    { name: "With Tokens", render: () => <Mentions defaultValue={DRAFT} /> },
    {
      name: "Disabled",
      render: () => <Mentions defaultValue={DRAFT} disabled />,
    },
  ],
};
