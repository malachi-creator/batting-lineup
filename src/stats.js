// All stats are derived client-side from raw at-bats. Never stored.
// Result set and labels are tuned for rec-league slow-pitch softball.

export const RESULT_LABELS = {
  "1B": "Single",
  "2B": "Double",
  "3B": "Triple",
  HR: "Home Run",
  BB: "Walk",
  OUT: "Out",
  ROE: "Error",
  FC: "Fielder's Choice",
};

// Short labels for the in-game tap grid (dugout speed).
export const GAME_RESULT_LABELS = {
  ...RESULT_LABELS,
  ROE: "Error (safe)",
  FC: "FC (safe)",
};

export const HIT_RESULTS = ["1B", "2B", "3B", "HR"];
// Safe reach without a hit — same AB/OBP treatment as ROE.
export const REACH_SAFE_RESULTS = ["ROE", "FC"];
// Hits + safe reaches: need placement and contact steps when logging.
export const PLACEMENT_RESULTS = [...HIT_RESULTS, ...REACH_SAFE_RESULTS];
export const BASES = { "1B": 1, "2B": 2, "3B": 3, HR: 4 };

export const OUT_TYPE_LABELS = {
  K: "Strikeout",
  GO: "Ground out",
  FO: "Fly out",
  PO: "Pop-up",
  LO: "Line out",
  FC: "Force out", // legacy: logged under OUT before FC became its own result
  XHR: "HR limit out", // JC Parks: team HR over game limit counts as an out
};

// Most common slow-pitch outs first (pop-ups and lazy flies are typical).
export const OUT_TYPES = ["PO", "FO", "GO", "LO", "K"];
export const EDIT_OUT_TYPES = [...OUT_TYPES, "FC", "XHR"];

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

// How a reached ball traveled (hits + ROE/FC). Same codes as out types, separate field.
export const BALL_TYPE_LABELS = {
  GO: "Ground",
  FO: "Fly",
  LO: "Line",
  PO: "Pop-up",
};

export const BALL_TYPES = ["GO", "FO", "LO", "PO"];

export const BALL_TYPE_SHORT = {
  GO: "Ground",
  FO: "Fly",
  LO: "Line",
  PO: "Pop-up",
};

export function isHit(ab) {
  return HIT_RESULTS.includes(ab.result);
}

export function isReachSafe(ab) {
  return REACH_SAFE_RESULTS.includes(ab.result);
}

export function isReached(ab) {
  return isHit(ab) || isReachSafe(ab);
}

export function needsPlacement(result) {
  return PLACEMENT_RESULTS.includes(result);
}

/** CSS class for at-bat result chips (hit / walk / error / fc / out). */
export function resultChipClass(ab) {
  if (ab.result === "BB") return "bb";
  if (ab.result === "ROE") return "roe";
  if (ab.result === "FC") return "fc";
  if (isHit(ab)) return "hit";
  return "out";
}

/** Short code shown on at-bat result chips. */
export function resultChipCode(ab) {
  if (ab.result === "OUT") return ab.outType || "OUT";
  if (ab.result === "ROE") return "Err";
  return ab.result;
}

/** Human-readable result for toasts and meta lines. */
export function formatAbResult(ab) {
  if (ab.result === "OUT") return OUT_TYPE_LABELS[ab.outType] || RESULT_LABELS.OUT;
  const base = RESULT_LABELS[ab.result] || ab.result;
  if (ab.ballType && BALL_TYPE_SHORT[ab.ballType] && isReached(ab)) {
    return `${BALL_TYPE_SHORT[ab.ballType]} ${base.toLowerCase()}`;
  }
  return base;
}

// Standard-ish scoring: ROE/FC count as an at-bat but not a hit or OBP reach.
export function computeLine(atBats) {
  const pa = atBats.length;
  const bb = atBats.filter((a) => a.result === "BB").length;
  const h = atBats.filter(isHit).length;
  const ab = pa - bb;
  const tb = atBats.reduce((s, a) => s + (BASES[a.result] || 0), 0);
  const rbi = atBats.reduce((s, a) => s + (a.rbi || 0), 0);
  const reached = atBats.filter(isReached).length;

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

  // Spray: every ball in play, split reached (hits + ROE + FC) vs outs
  const spray = {};
  ZONES.forEach((z) => (spray[z] = { hits: 0, outs: 0 }));
  atBats.forEach((a) => {
    if (!a.zone || !spray[a.zone]) return;
    if (isReached(a)) spray[a.zone].hits++;
    else if (a.result === "OUT") spray[a.zone].outs++;
  });

  return {
    pa,
    ab,
    h,
    bb,
    tb,
    rbi,
    reached,
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
    if (a.ballType) c.b = a.ballType;
    if (a.outType) c.o = a.outType;
    if (a.rbi) c.rbi = a.rbi;
    if (a.twoOuts) c.two_outs = true;
    if (gameDates && gameDates[a.gameId]) c.game = gameDates[a.gameId];
    return c;
  });
}
