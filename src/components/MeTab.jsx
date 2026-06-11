import React, { useMemo, useState } from "react";
import PlayerDetail from "./PlayerDetail.jsx";
import { computeLine, fmt3 } from "../stats.js";
import { getTeamId } from "../team.js";
import { tap } from "../haptics.js";

// Player-facing area: pick yourself once, land on your own stats after that.
export default function MeTab({ players, games, allAtBats, showToast }) {
  const storageKey = `bp.playerId.${getTeamId()}`;
  const [playerId, setPlayerId] = useState(() => localStorage.getItem(storageKey));

  const gameDates = useMemo(() => {
    const m = {};
    games.forEach((g) => (m[g.id] = g.date));
    return m;
  }, [games]);

  const player = players.find((p) => p.id === playerId);

  if (!player) {
    return (
      <div>
        <h2 style={{ fontSize: 26, marginBottom: 4 }}>Who are you?</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Pick your name to see your stats. Saved on this phone.
        </p>
        <div className="card">
          {players
            .filter((p) => p.active !== false)
            .map((p) => {
              const line = computeLine(allAtBats.filter((a) => a.playerId === p.id));
              return (
                <div
                  key={p.id}
                  className="list-row row-tap"
                  onClick={() => {
                    tap();
                    localStorage.setItem(storageKey, p.id);
                    setPlayerId(p.id);
                  }}
                >
                  <span className="grow" style={{ fontFamily: "var(--font-cond)", fontSize: 19, fontWeight: 600 }}>
                    {p.name}
                  </span>
                  <span className="muted">
                    {line.pa ? `${line.pa} PA · OBP ${fmt3(line.obp)}` : "no at-bats yet"}
                  </span>
                </div>
              );
            })}
        </div>
      </div>
    );
  }

  return (
    <PlayerDetail
      player={player}
      atBats={allAtBats.filter((a) => a.playerId === player.id)}
      allAtBats={allAtBats}
      gameDates={gameDates}
      onBack={() => {
        localStorage.removeItem(storageKey);
        setPlayerId(null);
      }}
      backLabel="↺ Switch player"
      showToast={showToast}
    />
  );
}
