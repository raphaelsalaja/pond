if (
  typeof window !== "undefined" &&
  !new URLSearchParams(window.location.search).has("variant")
) {
  const url = new URL(window.location.href);
  url.searchParams.set("variant", "all");
  window.history.replaceState(window.history.state, "", url);
}
