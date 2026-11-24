import { Input, Settings } from "@pond/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { savePrefsSection, usePrefs } from "@/shared/state/prefs";
import type { AgentPrefs } from "../types";
import styles from "./styles.module.css";

type Personalization = Pick<AgentPrefs, "userProfile" | "responseInstructions">;

export function PersonalizationSection() {
  const [agent, , loaded] = usePrefs("agent");
  return (
    <Settings.Page>
      <Settings.Header>
        <Settings.HeaderText>
          <Settings.Title>Personalization</Settings.Title>
          <Settings.Description>
            Give your fish context about you and how you like replies.
          </Settings.Description>
        </Settings.HeaderText>
      </Settings.Header>
      {loaded ? (
        <PersonalizationForm
          value={agent}
          onSave={(patch) => savePrefsSection("agent", patch)}
        />
      ) : (
        <p role="status">Loading personalization</p>
      )}
    </Settings.Page>
  );
}

function GuidanceField({
  id,
  title,
  description,
  value,
  placeholder,
  onValueChange,
  onBlur,
}: {
  id: string;
  title: string;
  description: string;
  value: string;
  placeholder: string;
  onValueChange: (value: string) => void;
  onBlur: () => void;
}) {
  const descriptionId = `${id}-description`;
  return (
    <Settings.Section>
      <Settings.SectionDetails>
        <Settings.SectionTitle>
          <label htmlFor={id}>{title}</label>
        </Settings.SectionTitle>
        <Settings.SectionDescription id={descriptionId}>
          {description}
        </Settings.SectionDescription>
      </Settings.SectionDetails>
      <Settings.List>
        <Input.Textarea
          id={id}
          className={styles.area}
          padding="comfortable"
          aria-describedby={descriptionId}
          placeholder={placeholder}
          value={value}
          onValueChange={onValueChange}
          onBlur={onBlur}
          maxLength={8000}
          rows={8}
        />
      </Settings.List>
    </Settings.Section>
  );
}

export function PersonalizationForm({
  value,
  onSave,
}: {
  value: Personalization;
  onSave: (patch: Personalization) => Promise<void>;
}) {
  const [profile, setProfile] = useState(value.userProfile ?? "");
  const [instructions, setInstructions] = useState(
    value.responseInstructions ?? "",
  );
  const [error, setError] = useState("");
  const draft = useRef({ profile, instructions });
  const saved = useRef({
    userProfile: value.userProfile ?? "",
    responseInstructions: value.responseInstructions ?? "",
  });
  const timer = useRef(0);
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  const persist = useCallback(async () => {
    const next = {
      userProfile: draft.current.profile,
      responseInstructions: draft.current.instructions,
    };
    if (
      next.userProfile === saved.current.userProfile &&
      next.responseInstructions === saved.current.responseInstructions
    ) {
      return;
    }
    try {
      await onSaveRef.current(next);
      saved.current = next;
      setError("");
    } catch {
      setError("Could not save personalization. Try again.");
    }
  }, []);

  function schedule() {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void persist(), 400);
  }

  function commit() {
    window.clearTimeout(timer.current);
    return persist();
  }

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      void persist();
    },
    [persist],
  );

  return (
    <div className={styles.form}>
      <GuidanceField
        id="agent-profile"
        title="About You"
        description="Share your interests, work, or context you want your fish to know."
        placeholder="Your role, interests, and other context"
        value={profile}
        onValueChange={(text) => {
          setProfile(text);
          draft.current = { ...draft.current, profile: text };
          schedule();
        }}
        onBlur={() => void commit()}
      />
      <GuidanceField
        id="agent-instructions"
        title="Response Instructions"
        description="Set your preferred tone, language, and level of detail."
        placeholder="Tone, language, and level of detail"
        value={instructions}
        onValueChange={(text) => {
          setInstructions(text);
          draft.current = { ...draft.current, instructions: text };
          schedule();
        }}
        onBlur={() => void commit()}
      />
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
