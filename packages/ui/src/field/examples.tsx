import { Field } from ".";
import { Input } from "../input";
import type { ComponentDocs } from "../shared/docs";

export const docs: ComponentDocs = {
  slug: "field",
  name: "Field",
  tier: "form",
  summary: "Labels a control and ties its description and error to it.",
  parts: [
    {
      name: "Field.Root",
      description:
        "Groups one control with its label. Takes `invalid` and `disabled`.",
    },
    {
      name: "Field.Label",
      description: "The visible label. Clicking it focuses the control.",
    },
    {
      name: "Field.Control",
      description: "A bare control; use `render` to supply `Input.Field`.",
    },
    {
      name: "Field.Description",
      description: "Help text read after the label.",
    },
    {
      name: "Field.Error",
      description: "The error message, shown when the field is invalid.",
    },
  ],
  keyboard: [{ keys: "Tab", action: "Moves focus to the control" }],
  accessibility: [
    "`Field.Label` is a native `<label>` for the control inside `Field.Root`.",
    "`Field.Description` and `Field.Error` are linked with `aria-describedby`.",
    "An invalid field sets `aria-invalid` on its control.",
    "A required control adds an asterisk to the label.",
  ],
  examples: [
    {
      name: "Default",
      render: () => (
        <Field.Root>
          <Field.Label>Library Name</Field.Label>
          <Input.Root>
            <Input.Field defaultValue="Pond" />
          </Input.Root>
          <Field.Description>
            Shown in the sidebar and window title.
          </Field.Description>
        </Field.Root>
      ),
    },
    {
      name: "Required",
      render: () => (
        <Field.Root>
          <Field.Label>Source URL</Field.Label>
          <Input.Root>
            <Input.Field required placeholder="https://" />
          </Input.Root>
        </Field.Root>
      ),
    },
    {
      name: "Error",
      render: () => (
        <Field.Root invalid>
          <Field.Label>Folder Name</Field.Label>
          <Input.Root>
            <Input.Field defaultValue="" />
          </Input.Root>
          <Field.Error match>Enter a folder name.</Field.Error>
        </Field.Root>
      ),
    },
    {
      name: "Disabled",
      render: () => (
        <Field.Root disabled>
          <Field.Label>Library Name</Field.Label>
          <Input.Root>
            <Input.Field defaultValue="Pond" />
          </Input.Root>
        </Field.Root>
      ),
    },
  ],
};
