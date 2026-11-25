import { Combobox } from "@pond/ui/combobox";
import { clsx as cn } from "clsx";
import { useState } from "react";
import { rankTags } from "@/utils/library-targets";
import type { Tag } from "@/utils/messaging";
import styles from "./styles.module.css";

const SUGGESTIONS = 40;

interface TagsProps {
  tags: Array<Tag>;
  recent: Array<string>;
  value: Array<string>;
  onValueChange: (value: Array<string>) => void;
  /** Popups render in the shadow root when the picker lives on a page. */
  container?: HTMLElement | null;
  className?: string;
}

function merge(current: Array<string>, added: Array<string>): Array<string> {
  const seen = new Set(current.map((tag) => tag.toLowerCase()));
  const next = [...current];
  for (const tag of added) {
    if (seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    next.push(tag);
  }
  return next;
}

export function Tags({
  tags,
  recent,
  value,
  onValueChange,
  container,
  className,
}: TagsProps) {
  const [query, setQuery] = useState("");
  const typed = query.trim();
  const known = new Set(tags.map((tag) => tag.name.toLowerCase()));
  const chosen = new Set(value.map((tag) => tag.toLowerCase()));
  const suggestions = rankTags(tags, recent, typed, SUGGESTIONS);
  const creatable =
    typed &&
    !known.has(typed.toLowerCase()) &&
    !chosen.has(typed.toLowerCase());
  const items = creatable ? [...suggestions, typed] : suggestions;

  return (
    <Combobox.Root
      multiple
      autoHighlight
      items={items}
      filter={null}
      value={value}
      inputValue={query}
      onInputValueChange={(next) => {
        if (!next.includes(",")) {
          setQuery(next);
          return;
        }
        const parts = next.split(",");
        const rest = parts.pop() ?? "";
        const typedTags = parts.map((part) => part.trim()).filter(Boolean);
        onValueChange(merge(value, typedTags));
        setQuery(rest.trimStart());
      }}
      onValueChange={(next) => {
        onValueChange(merge([], next));
        setQuery("");
      }}
    >
      <Combobox.InputGroup className={cn(styles.tags, className)}>
        <Combobox.Chips>
          {value.map((tag) => (
            <Combobox.Chip key={tag} aria-label={tag}>
              {tag}
              <Combobox.ChipRemove aria-label={`Remove ${tag}`} />
            </Combobox.Chip>
          ))}
          <Combobox.ChipsInput
            aria-label="Tags"
            placeholder={value.length > 0 ? "" : "Add tags"}
          />
        </Combobox.Chips>
      </Combobox.InputGroup>
      <Combobox.Portal container={container}>
        <Combobox.Positioner>
          <Combobox.Popup>
            <Combobox.Empty>Type to create a tag</Combobox.Empty>
            <Combobox.List>
              {(tag: string) => (
                <Combobox.Item key={tag} value={tag}>
                  <Combobox.ItemLabel>
                    {creatable && tag === typed ? `Create “${tag}”` : tag}
                  </Combobox.ItemLabel>
                  <Combobox.ItemEnd>
                    <Combobox.ItemIndicator />
                  </Combobox.ItemEnd>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
