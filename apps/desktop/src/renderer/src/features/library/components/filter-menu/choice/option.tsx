import type { Predicate } from "@pond/schema/filters/types";
import { Menu } from "@pond/ui";
import type { ReactNode } from "react";
import type { FilterOption } from "../options";
import { isChoiceSelected, selectChoice } from "../selection";
import { excludeGestures } from "./exclude";
import { ChoiceIndicator } from "./indicator";

export function ChoiceOption({
  option,
  rows,
  matching,
  count,
  icon,
  onChange,
}: {
  option: FilterOption;
  rows: Array<Predicate>;
  matching: "any" | "all";
  count: ReactNode;
  icon?: ReactNode;
  onChange: (rows: Array<Predicate>) => void;
}) {
  const excluded = isChoiceSelected(rows, option.predicate, "exclude");
  const included = isChoiceSelected(rows, option.predicate, matching);
  const exclude = () =>
    onChange(
      selectChoice(
        rows,
        option.predicate,
        !excluded && !included,
        included ? matching : "exclude",
      ),
    );
  return (
    <Menu.CheckboxItem
      closeOnClick={false}
      checked={included || excluded}
      data-excluded={excluded || undefined}
      aria-description={excluded ? "Excluded" : undefined}
      {...excludeGestures(exclude)}
      onCheckedChange={(next) =>
        onChange(
          selectChoice(
            rows,
            option.predicate,
            next,
            excluded ? "exclude" : matching,
          ),
        )
      }
    >
      <ChoiceIndicator excluded={excluded} />
      {icon ? <Menu.ItemIcon>{icon}</Menu.ItemIcon> : null}
      <Menu.ItemLabel
        title={
          option.crumb ? `${option.crumb} › ${option.label}` : option.label
        }
      >
        {option.crumb ? (
          <>
            <span data-menu-breadcrumb="">{option.crumb}</span>
            <span aria-hidden data-menu-breadcrumb-separator="">
              ›
            </span>
            <span data-menu-breadcrumb-current="">{option.label}</span>
          </>
        ) : (
          option.label
        )}
      </Menu.ItemLabel>
      {count === null ? null : (
        <Menu.SecondaryLabel>{count}</Menu.SecondaryLabel>
      )}
    </Menu.CheckboxItem>
  );
}
