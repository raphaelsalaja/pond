import { Button, useToast } from "@pond/ui";
import { Cell } from "./cell";

export default function SuggestionToastCell() {
  const toast = useToast();

  return (
    <Cell label="Suggestion Toast">
      <Button
        size="sm"
        onClick={async () => {
          const result = await window.pond.suggestions.notify({
            key: `components-demo-${Date.now()}`,
            title: "10 saves haven't been touched in a while",
            body: "Pond can tidy them up for you.\nYou can always reopen them from Trash.",
            icons: [
              "https://www.google.com/s2/favicons?domain=reddit.com&sz=64",
              "https://www.google.com/s2/favicons?domain=youtube.com&sz=64",
              "https://www.google.com/s2/favicons?domain=notion.so&sz=64",
              "https://www.google.com/s2/favicons?domain=linear.app&sz=64",
            ],
            actions: [
              {
                id: "dismiss",
                label: "Not Now",
                shortcut: "esc",
                variant: "ghost",
              },
              {
                id: "once",
                label: "Clean Up Once",
                variant: "secondary",
              },
              {
                id: "daily",
                label: "Clean Up Daily",
                shortcut: "enter",
                variant: "primary",
              },
            ],
            autoDismissMs: 0,
          });
          toast.add({
            title: "Suggestion outcome",
            description: result.outcome,
            type:
              result.outcome === "dismissed" || result.outcome === "timed_out"
                ? "info"
                : "success",
          });
        }}
      >
        Show suggestion
      </Button>
    </Cell>
  );
}
