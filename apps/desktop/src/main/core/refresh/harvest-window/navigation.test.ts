import { describe, expect, it } from "vitest";
import { isInterstitial, looksLikeAuthWall } from "./navigation";

describe("looksLikeAuthWall", () => {
  it("catches Vimeo and Dribbble sign-in pages", () => {
    expect(looksLikeAuthWall("https://vimeo.com/log_in")).toBe(true);
    expect(looksLikeAuthWall("https://dribbble.com/session/new")).toBe(true);
    expect(looksLikeAuthWall("https://dribbble.com/signups/new")).toBe(true);
  });

  it("catches LinkedIn's sign-in and auth wall", () => {
    const signIn = "https://www.linkedin.com/uas/login?session_redirect=%2F";
    expect(looksLikeAuthWall(signIn)).toBe(true);
    expect(looksLikeAuthWall("https://www.linkedin.com/authwall")).toBe(true);
  });

  it("catches X's onboarding sign-in redirect", () => {
    expect(
      looksLikeAuthWall(
        "https://x.com/i/jf/onboarding/web?redirect_after_login=%2Fi%2Fbookmarks&mode=login",
      ),
    ).toBe(true);
    expect(looksLikeAuthWall("https://x.com/i/history")).toBe(false);
  });

  it("leaves content pages alone", () => {
    expect(looksLikeAuthWall("https://dribbble.com/simplebits/likes")).toBe(
      false,
    );
  });
});

describe("isInterstitial", () => {
  it("spots the Anubis proof-of-work page", () => {
    expect(
      isInterstitial(
        "https://unsplash.com/.within.website/?redir=%2Fbookmarks",
      ),
    ).toBe(true);
    expect(isInterstitial("https://unsplash.com/bookmarks")).toBe(false);
  });
});
