import React, { useMemo } from "react";
import { computeLine } from "../stats.js";
import { applyLineupOrder, orderChanged } from "../lineup.js";
import CoachZBlock from "./CoachZ.jsx";

export default function LineupCheck({ players, allAtBats, showToast }) {
  const activePlayers = useMemo(
    () => players.filter((p) => p.active !== false),
    [players]
  );

  const currentOrder = useMemo(
    () => activePlayers.map((p) => p.id),
    [activePlayers]
  );

  const lineupPayload = useMemo(
    () =>
      activePlayers.map((p, i) => {
        const l = computeLine(allAtBats.filter((a) => a.playerId === p.id));
        return {
          id: p.id,
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
    [activePlayers, allAtBats]
  );

  const canApply = (cached) => orderChanged(currentOrder, cached.order);

  const onApply = async (cached) => {
    await applyLineupOrder(players, cached.order);
    showToast("Lineup updated from Coach Z");
  };

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
        applyLabel="Apply recommended lineup"
        canApply={canApply}
        onApply={onApply}
      />
    </div>
  );
}
