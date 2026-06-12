// JC Parks (Jefferson City) adult summer slow-pitch — D league only.
// Source: Summer Softball Packet 2026 — 2 team HRs per game, excess = out.

export const LEAGUE_DIVISION = "D";
export const LEAGUE_HR_LIMIT = 2;
export const LEAGUE_LABEL = "JC Parks D league";

export function countGameHomeRuns(atBats) {
  return atBats.filter((a) => a.result === "HR").length;
}

export function gameHrLimit(game) {
  return game?.hrLimit ?? LEAGUE_HR_LIMIT;
}
