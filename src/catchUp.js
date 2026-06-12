/** Per-player catch-up links for logging missed at-bats after a game. */

export function buildCatchUpLink(gameId, playerId) {
  const url = new URL(window.location.href);
  url.hash = `/catch-up?game=${encodeURIComponent(gameId)}&player=${encodeURIComponent(playerId)}`;
  return url.toString();
}

export function parseCatchUpHash(hash) {
  if (!hash?.startsWith("#/catch-up")) return null;
  const qs = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
  const params = new URLSearchParams(qs);
  const gameId = params.get("game");
  const playerId = params.get("player");
  if (!gameId || !playerId) return null;
  return { gameId, playerId };
}

export function clearCatchUpHash(tab = "game") {
  const base = window.location.pathname + window.location.search;
  window.history.replaceState(null, "", `${base}#/${tab}`);
}

export async function copyCatchUpLink(gameId, playerId, showToast) {
  const link = buildCatchUpLink(gameId, playerId);
  try {
    await navigator.clipboard.writeText(link);
    showToast("Catch-up link copied");
  } catch {
    showToast(link);
  }
}
