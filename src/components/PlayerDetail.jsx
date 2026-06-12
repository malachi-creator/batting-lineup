import React, { useMemo } from "react";
import FieldDiagram from "./FieldDiagram.jsx";
import CoachZBlock from "./CoachZ.jsx";
import { compactAtBats, computeLine, fmt3, formatAbResult, OUT_TYPE_LABELS, ZONE_LABELS, CONTACT_LABELS, isReachSafe, isReached, resultChipClass, resultChipCode } from "../stats.js";
import { tap } from "../haptics.js";

export default function PlayerDetail({ player, atBats, allAtBats, gameDates, onBack, backLabel = "← Team", showToast }) {
  const line = useMemo(() => computeLine(atBats), [atBats]);
  const teamLine = useMemo(() => computeLine(allAtBats), [allAtBats]);

  const sprayHits = {};
  const sprayOuts = {};
  Object.entries(line.spray).forEach(([z, v]) => {
    sprayHits[z] = v.hits;
    sprayOuts[z] = v.outs;
  });

  // Exact-spot dots for at-bats that recorded a tap location
  const reachedPoints = atBats
    .filter((a) => a.loc && isReached(a))
    .map((a) => ({
      ...a.loc,
      kind: isReachSafe(a) ? (a.result === "ROE" ? "roe" : "fc") : "hit",
      ballType: a.ballType,
      result: a.result,
    }));
  const outPoints = atBats
    .filter((a) => a.loc && a.result === "OUT")
    .map((a) => ({ ...a.loc, kind: "out", outType: a.outType }));

  // Contact trend per game (chronological)
  const trend = useMemo(() => {
    const byGame = {};
    atBats.forEach((a) => {
      if (!a.contact) return;
      (byGame[a.gameId] ||= { HARD: 0, MED: 0, WEAK: 0 })[a.contact]++;
    });
    return Object.entries(byGame)
      .map(([gameId, mix]) => ({ date: gameDates[gameId] || "?", mix }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [atBats, gameDates]);

  const last10 = [...atBats]
    .sort((a, b) => (a.gameId === b.gameId ? a.seq - b.seq : (gameDates[a.gameId] || "").localeCompare(gameDates[b.gameId] || "")))
    .slice(-10)
    .reverse();

  return (
    <div>
      {onBack && (
        <button className="back-btn" onClick={() => { tap(); onBack(); }}>{backLabel}</button>
      )}
      <h2 style={{ fontSize: 30 }}>{player.name}</h2>
      <p className="muted" style={{ marginTop: 4 }}>
        {line.pa} PA · OBP <b style={{ color: "var(--blue)" }}>{line.pa ? fmt3(line.obp) : "—"}</b> · AVG{" "}
        {line.ab ? fmt3(line.avg) : "—"} · SLG {line.ab ? fmt3(line.slg) : "—"} · {line.rbi} RBI
      </p>

      <CoachZBlock
        cacheKey={player.id}
        abCount={atBats.length}
        disabled={atBats.length === 0}
        endpoint="analyze-batter"
        runLabel={`What's going on with ${player.name}?`}
        loadingLabel="Coach Z is watching film…"
        getPayload={() => ({
          name: player.name,
          atBats: compactAtBats(atBats, gameDates),
          playerStats: { pa: line.pa, obp: +line.obp.toFixed(3), avg: +line.avg.toFixed(3), slg: +line.slg.toFixed(3) },
          teamAverages: { obp: +teamLine.obp.toFixed(3), avg: +teamLine.avg.toFixed(3), slg: +teamLine.slg.toFixed(3), contactMix: teamLine.contactMix, outMix: teamLine.outMix },
        })}
        showToast={showToast}
      />

      <div className="card" style={{ marginTop: 14 }}>
        <h3>Spray Chart</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1, textAlign: "center" }}>
            <FieldDiagram heat={sprayHits} heatColor="#3DDC84" points={reachedPoints} size={220} />
            <span className="muted">Reached ({line.reached})</span>
          </div>
          <div style={{ flex: 1, textAlign: "center" }}>
            <FieldDiagram heat={sprayOuts} heatColor="#FF6B6B" points={outPoints} size={220} />
            <span className="muted">Outs ({Object.values(sprayOuts).reduce((s, n) => s + n, 0)})</span>
          </div>
        </div>
        <div className="legend" style={{ justifyContent: "center" }}>
          <span><i style={{ background: "#3DDC84" }} />Hit</span>
          <span><i style={{ background: "#FFC24B" }} />Error</span>
          <span><i style={{ background: "#249EFF" }} />FC</span>
          <span><i style={{ background: "#FF6B6B" }} />Out</span>
        </div>
      </div>

      <div className="card">
        <h3>How the outs happen</h3>
        {Object.keys(line.outMix).length === 0 && <p className="muted">No outs logged.</p>}
        {Object.entries(line.outMix)
          .sort((a, b) => b[1] - a[1])
          .map(([k, n]) => {
            const total = Object.values(line.outMix).reduce((s, v) => s + v, 0);
            return (
              <div className="bar-row" key={k}>
                <span className="lbl">{OUT_TYPE_LABELS[k]}</span>
                <div className="bar"><div style={{ width: `${(n / total) * 100}%` }} /></div>
                <span className="n">{n}</span>
              </div>
            );
          })}
      </div>

      <div className="card">
        <h3>Contact by game</h3>
        {trend.length === 0 ? (
          <p className="muted">No batted balls yet.</p>
        ) : (
          <>
            <div className="trend-row">
              {trend.map((g, i) => {
                const total = g.mix.HARD + g.mix.MED + g.mix.WEAK || 1;
                return (
                  <div className="trend-col" key={i} title={g.date}>
                    <div className="seg-weak" style={{ height: `${(g.mix.WEAK / total) * 100}%` }} />
                    <div className="seg-med" style={{ height: `${(g.mix.MED / total) * 100}%` }} />
                    <div className="seg-hard" style={{ height: `${(g.mix.HARD / total) * 100}%` }} />
                  </div>
                );
              })}
            </div>
            <div className="trend-labels">
              {trend.map((g, i) => (
                <span key={i}>{g.date.slice(5)}</span>
              ))}
            </div>
            <div className="legend">
              <span><i style={{ background: "var(--blue)" }} />Hard</span>
              <span><i style={{ background: "var(--blue-dim)", opacity: 0.6 }} />Medium</span>
              <span><i style={{ background: "var(--red)", opacity: 0.7 }} />Weak</span>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h3>Last {last10.length} at-bats</h3>
        {last10.length === 0 && <p className="muted">Nothing logged yet.</p>}
        {last10.map((a) => (
          <div className="ab-chip" key={a.id}>
            <span className={`res ${resultChipClass(a)}`}>
              {resultChipCode(a)}
            </span>
            <span className="meta">
              {formatAbResult(a)}
              {a.zone ? ` · ${ZONE_LABELS[a.zone]}` : ""}
              {a.contact ? ` · ${CONTACT_LABELS[a.contact]}` : ""}
              {a.rbi ? ` · ${a.rbi} RBI` : ""}
              {a.twoOuts ? " · 2 out" : ""}
            </span>
            <span className="muted">{(gameDates[a.gameId] || "").slice(5)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
