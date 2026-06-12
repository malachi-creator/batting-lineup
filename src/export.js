import { computeLine, fmt3, resultChipCode } from "./stats.js";

export function filterAtBatsByDate(allAtBats, games, filter) {
  if (!filter || filter === "all") return allAtBats;
  const gameMap = Object.fromEntries(games.map((g) => [g.id, g.date]));
  const now = new Date();
  const cutoff =
    filter === "30d"
      ? new Date(now.getTime() - 30 * 864e5).toISOString().slice(0, 10)
      : filter.endsWith("-season")
        ? `${filter.slice(0, 4)}-01-01`
        : null;
  const end =
    filter.endsWith("-season") ? `${filter.slice(0, 4)}-12-31` : null;

  return allAtBats.filter((a) => {
    const d = gameMap[a.gameId];
    if (!d) return false;
    if (cutoff && d < cutoff) return false;
    if (end && d > end) return false;
    return true;
  });
}

export function seasonOptions(games) {
  const years = [...new Set(games.map((g) => g.date?.slice(0, 4)).filter(Boolean))].sort().reverse();
  return [
    { value: "all", label: "All time" },
    { value: "30d", label: "Last 30 days" },
    ...years.map((y) => ({ value: `${y}-season`, label: `${y} season` })),
  ];
}

export function gameResult(g) {
  if (g.result) return g.result;
  if (g.usScore == null || g.themScore == null) return null;
  if (g.usScore > g.themScore) return "W";
  if (g.usScore < g.themScore) return "L";
  return "T";
}

export function recordLine(games) {
  let w = 0, l = 0, t = 0;
  games.filter((g) => g.final).forEach((g) => {
    const r = gameResult(g);
    if (r === "W") w++;
    else if (r === "L") l++;
    else if (r === "T") t++;
  });
  return { w, l, t };
}

export function exportStatsCsv(players, allAtBats, games) {
  const gameMap = Object.fromEntries(games.map((g) => [g.id, g.date]));
  const header = "Player,PA,AB,H,BB,RBI,AVG,OBP,SLG";
  const rows = players.map((p) => {
    const l = computeLine(allAtBats.filter((a) => a.playerId === p.id));
    return [p.name, l.pa, l.ab, l.h, l.bb, l.rbi, l.ab ? fmt3(l.avg) : "", l.pa ? fmt3(l.obp) : "", l.ab ? fmt3(l.slg) : ""].join(",");
  });
  const abs = ["", "At-bats", "Date,Player,Result,Ball,Zone,Contact,RBI"];
  allAtBats.forEach((a) => {
    const p = players.find((x) => x.id === a.playerId);
    abs.push([gameMap[a.gameId] || "", p?.name || "", resultChipCode(a), a.ballType || "", a.zone || "", a.contact || "", a.rbi || 0].join(","));
  });
  return [header, ...rows, ...abs].join("\n");
}

export function exportStatsText(players, allAtBats, games) {
  const rec = recordLine(games);
  const lines = [`Beer Pressure Batting Stats`, `Record: ${rec.w}-${rec.l}${rec.t ? `-${rec.t}` : ""}`, ""];
  players.forEach((p) => {
    const l = computeLine(allAtBats.filter((a) => a.playerId === p.id));
    if (l.pa === 0) return;
    lines.push(`${p.name}: ${l.pa} PA, ${fmt3(l.avg)} AVG, ${fmt3(l.obp)} OBP, ${fmt3(l.slg)} SLG, ${l.rbi} RBI`);
  });
  return lines.join("\n");
}

export async function shareStats(players, allAtBats, games, showToast) {
  const text = exportStatsText(players, allAtBats, games);
  try {
    if (navigator.share) {
      await navigator.share({ title: "Batting stats", text });
    } else {
      await navigator.clipboard.writeText(text);
      showToast("Stats copied to clipboard");
    }
  } catch {
    showToast("Could not share stats");
  }
}
