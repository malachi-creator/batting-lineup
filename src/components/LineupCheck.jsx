import React, { useMemo } from "react";
import { computeLine } from "../stats.js";
import CoachZBlock from "./CoachZ.jsx";

export default function LineupCheck({ players, allAtBats, showToast }) {
  const lineupPayload = useMemo(
    () =>
      players
        .filter((p) => p.active !== false)
        .map((p, i) => {
          const l = computeLine(allAtBats.filter((a) => a.playerId === p.id));
          return {
            order: i + 1,
            name: p.name,
            pa: l.pa,
            obp: +l.obp.toFixed(3),
            avg: +l.avg.toFixed(3),
            slg: +l.slg.toFixed(3),
            contactMix: l.contactMix,
            outMix: l.outMix,
          };
        }),
    [players, allAtBats]
  );

  return (
    <div style={{ marginTop: 4 }}>
      <CoachZBlock
        cacheKey="_lineup"
        abCount={allAtBats.length}
        disabled={allAtBats.length === 0}
        endpoint="lineup-check"
        runLabel="Lineup check (Coach Z)"
        loadingLabel="Checking the lineup…"
        getPayload={() => ({ lineup: lineupPayload })}
        showToast={showToast}
      />
    </div>
  );
}
