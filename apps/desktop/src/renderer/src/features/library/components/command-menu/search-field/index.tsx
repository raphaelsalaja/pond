import { IconMagnifier } from "@pond/icons";
import { Button, Keyboard, Loader } from "@pond/ui";
import type {
  ChangeEventHandler,
  FocusEventHandler,
  KeyboardEventHandler,
  RefObject,
} from "react";
import { SearchChrome } from "@/shared/components/search-chrome";
import { RESULTS_ID } from "../results-list";
import styles from "./styles.module.css";

interface Crumb {
  title: string;
  context?: string;
}

interface SearchFieldProps {
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  placeholder: string;
  crumb?: Crumb;
  busy: boolean;
  activeDescendant?: string;
  onBack: () => void;
  onChange: ChangeEventHandler<HTMLInputElement>;
  onKeyDown: KeyboardEventHandler<HTMLInputElement>;
  onFocus: FocusEventHandler<HTMLInputElement>;
  onBlur: FocusEventHandler<HTMLInputElement>;
}

export function SearchField({
  inputRef,
  value,
  placeholder,
  crumb,
  busy,
  activeDescendant,
  onBack,
  onChange,
  onKeyDown,
  onFocus,
  onBlur,
}: SearchFieldProps) {
  return (
    <div className={styles.search}>
      {crumb ? (
        <div className={styles.crumbs}>
          <Button
            className={styles.crumb}
            variant="tertiary"
            size="xs"
            rounding="full"
            aria-label={`Back from ${crumb.title}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={onBack}
          >
            {crumb.context ? (
              <>
                <span className={styles.context}>{crumb.context}</span>
                <span className={styles.context} aria-hidden>
                  ·
                </span>
              </>
            ) : null}
            <span className={styles.title}>{crumb.title}</span>
          </Button>
        </div>
      ) : null}
      <div className={styles.field}>
        <IconMagnifier className={styles.magnifier} aria-hidden />
        <SearchChrome.Input
          ref={inputRef}
          className={styles.input}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={placeholder}
          aria-label={crumb?.title ?? "Search Pond"}
          role="combobox"
          aria-expanded="true"
          aria-controls={RESULTS_ID}
          aria-activedescendant={activeDescendant}
          spellCheck={false}
        />
        {busy ? (
          <Loader.Spinner className={styles.spinner} aria-label="Searching" />
        ) : null}
        <Keyboard.Key aria-hidden>esc</Keyboard.Key>
      </div>
    </div>
  );
}
