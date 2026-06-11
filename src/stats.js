// All stats are derived client-side from raw at-bats. Never stored.

export const RESULT_LABELS = {
  "1B": "Single",
  "2B": "Double",
  "3B": "Triple",
  HR: "Home Run",
  BB: "Walk",
  OUT: "Out",
  ROE: "Error",
};

export const HIT_RESULTS = ["1B", "2B", "3B", "HR"];
export const BASES = { "1B": 1, "2B": 2, "3B": 3, HR: 4 };

export const OUT_TYPE_LABELS = {
  K: "Strikeout",
  GO: "Ground out",
  FO: "Fly out",
  PO: "Pop-up",
  LO: "Line out",
  FC: "Fielder's choice",
};

export const ZONES = ["LF", "CF", "RF", "IF_L", "IF_M", "IF_R"];
export const ZONE_LABELS = {
  LF: "LF",
  CF: "CF",
  RF: "RF",
  IF_L: "3B-SS",
  IF_M: "MID",
  IF_R: "1B-2B",
};

export const CONTACT_LABELS = { HARD: "Hard", MED: "Medium", WEAK: "Weak" };

export function isHit(ab) {
  return HIT_RESULTS.includes(ab.result);
}

// Standard-ish scoring: ROE counts as an at-bat but not a hit or time on base.
export function computeLine(atBats) {
  const pa = atBats.length;
  const bb = atBats.filter((a) => a.result === "BB").length;
  const h = atBats.filter(isHit).length;
  const ab = pa - bb;
  const tb = atBats.reduce((s, a) => s + (BASES[a.result] || 0), 0);
  const rbi = atBats.reduce((s, a) => s + (a.rbi || 0), 0);

  const outMix = {};
  atBats
    .filter((a) => a.result === "OUT")
    .forEach((a) => {
      if (a.outType) outMix[a.outType] = (outMix[a.outType] || 0) + 1;
    });

  const contactMix = { HARD: 0, MED: 0, WEAK: 0 };
  atBats.forEach((a) => {
    if (a.contact) contactMix[a.contact]++;
  });

  // Spray: every ball in play, split reached (hits + ROE) vs outs
  const spray = {};
  ZONES.forEach((z) => (spray[z] = { hits: 0, outs: 0 }));
  atBats.forEach((a) => {
    if (!a.zone || !spray[a.zone]) return;
    if (isHit(a) || a.result === "ROE") spray[a.zone].hits++;
    else if (a.result === "OUT") spray[a.zone].outs++;
  });

  return {
    pa,
    ab,
    h,
    bb,
    tb,
    rbi,
    avg: ab ? h / ab : 0,
    obp: pa ? (h + bb) / pa : 0,
    slg: ab ? tb / ab : 0,
    outMix,
    contactMix,
    spray,
  };
}

export function fmt3(v) {
  return v.toFixed(3).replace(/^0\./, ".");
}

// Compact encoding sent to the Claude analysis function
export function compactAtBats(atBats, gameDates) {
  return atBats.map((a) => {
    const c = { r: a.result };
    if (a.zone) c.z = a.zone;
    if (a.loc) c.loc = [a.loc.a, a.loc.d];
    if (a.contact) c.c = a.contact;
    if (a.outType) c.o = a.outType;
    if (a.rbi) c.rbi = a.rbi;
    if (a.twoOuts) c.two_outs = true;
    if (gameDates && gameDates[a.gameId]) c.game = gameDates[a.gameId];
    return c;
  });
}
