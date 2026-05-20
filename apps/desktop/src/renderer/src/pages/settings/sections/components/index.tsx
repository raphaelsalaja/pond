import { Settings } from "@/components/settings";
import * as Primitive from "./_primitives";
import styles from "./styles.module.css";

export function ComponentsSection() {
  return (
    <Settings.Page>
      <Settings.Header>
        <Settings.Title>Components</Settings.Title>
        <Settings.Description>
          Pond design system for building consistent experiences.
        </Settings.Description>
      </Settings.Header>

      <div className={styles.grid}>
        <Primitive.Tooltip />
        <Primitive.AlertDialog />
        <Primitive.Avatar />
        <Primitive.Button />
        <Primitive.Collapsible />
        <Primitive.Dialog />
        <Primitive.Dropdown />
        <Primitive.Field />
        <Primitive.Input />
        <Primitive.Notification />
        <Primitive.NumberField />
        <Primitive.Popover />
        <Primitive.Select />
        <Primitive.Separator />
        <Primitive.SuggestionToast />
        <Primitive.Switch />
        <Primitive.Toast />
      </div>
    </Settings.Page>
  );
}
