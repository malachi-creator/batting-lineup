import { parseCatchUpHash } from "./catchUp.js";

export const TABS = ["game", "schedule", "stats", "me", "team"];

const LEGACY_TAB = { roster: "team" };

export function parseAppHash(hash) {
  const catchUp = parseCatchUpHash(hash);
  if (catchUp) return { mode: "catch-up", catchUp };

  const path = (hash || "").replace(/^#\/?/, "").split("?")[0];
  const tab = LEGACY_TAB[path] || path;
  if (TABS.includes(tab)) return { mode: "main", tab };
  return { mode: "main", tab: "game" };
}

export function setAppTabHash(tab) {
  const base = window.location.pathname + window.location.search;
  window.history.replaceState(null, "", `${base}#/${tab}`);
}
