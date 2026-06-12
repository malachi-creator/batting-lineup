// JC Parks (Jefferson City) adult summer slow-pitch rules baked into game setup.
// Source: Summer Softball Packet 2026 — USA Softball with local exceptions.

/** Team HR limits per game (excess HRs are outs). */
export const JC_PARKS_HR_LIMITS = {
  C: 4,
  D: 2,
};

export const LEAGUE_DIVISIONS = [
  { value: "", label: "No HR limit", hrLimit: null },
  { value: "C", label: "JC Parks · C (4 HR/game)", hrLimit: 4 },
  { value: "D", label: "JC Parks · D (2 HR/game)", hrLimit: 2 },
];

export function hrLimitForDivision(division) {
  if (!division) return null;
  return JC_PARKS_HR_LIMITS[division] ?? null;
}

export function countGameHomeRuns(atBats) {
  return atBats.filter((a) => a.result === "HR").length;
}
