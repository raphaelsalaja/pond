import { useCallback } from "react";
import { usePrefs } from "../../../pool/prefs";
import { Button, Input, useToast } from "../../../ui";
import {
  Row,
  SectionHeader,
  SectionStack,
  SettingsCard,
  StackedRow,
} from "./_shared";

/**
 * Profile section. The display name is woven into AI prompts (so
 * captions can address you by name) and shown in the title bar; the
 * avatar is copied into `<library>/_meta/avatar.<ext>` so it lives
 * with the library, not the OS user account.
 */
export function ProfileSection() {
  const toast = useToast();
  const [profile, patch] = usePrefs("profile");

  const pickAvatar = useCallback(async () => {
    const res = (await window.pond.query("profile.pickAvatar", {})) as
      | { ok: true; path: string }
      | { ok: false; reason: string };
    if (!res.ok) {
      if (res.reason !== "cancelled") {
        toast.add({
          title: "Couldn't set avatar",
          description: res.reason,
          type: "error",
        });
      }
      return;
    }
    toast.add({ title: "Avatar updated", type: "success" });
  }, [toast]);

  const clearAvatar = useCallback(async () => {
    await window.pond.query("profile.clearAvatar", {});
    toast.add({ title: "Avatar cleared", type: "success" });
  }, [toast]);

  return (
    <SectionStack>
      <SectionHeader
        title="Profile"
        description="How Pond addresses you in AI captions and the title bar. Stays on this machine."
      />

      <SettingsCard title="Identity">
        <StackedRow
          label="Display name"
          description="Used as `{name}` in agent prompts and shown next to your library name."
        >
          <Input
            size="sm"
            placeholder="Your name"
            value={profile.displayName}
            onChange={(e) => patch({ displayName: e.target.value })}
          />
        </StackedRow>
        <Row
          label="Avatar"
          description={
            profile.avatarPath
              ? `Stored at ${profile.avatarPath}`
              : "No avatar set."
          }
          control={
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {profile.avatarPath ? (
                <img
                  src={`file://${profile.avatarPath}`}
                  alt="avatar"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    objectFit: "cover",
                  }}
                />
              ) : null}
              <Button size="sm" onClick={() => void pickAvatar()}>
                Pick image…
              </Button>
              {profile.avatarPath ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void clearAvatar()}
                >
                  Clear
                </Button>
              ) : null}
            </div>
          }
        />
      </SettingsCard>
    </SectionStack>
  );
}
