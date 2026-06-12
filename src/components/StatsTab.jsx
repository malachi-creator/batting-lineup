import React, { useMemo, useState } from "react";
import { getDocs, query, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "../firebase.js";
import { computeLine, fmt3, resultChipCode } from "../stats.js";
import { teamCol, teamDoc } from "../team.js";
import PlayerDetail from "./PlayerDetail.jsx";
import LineupCheck from "./LineupCheck.jsx";
import { Dialog } from "./Dialog.jsx";
import {
  exportStatsCsv,
  filterAtBatsByDate,
  gameResult,
  recordLine,
  seasonOptions,
  shareStats,
} from "../export.js";
import { tap } from "../haptics.js";

export default function StatsTab({ players, games, allAtBats, showToast, hasActiveGame }) {
  const [view, setView] = useState("team");
  const [playerId, setPlayerId] = useState(null);
  const [dateFilter, setDateFilter] = useState("all");

  const gameDates = useMemo(() => {
    const m = {};
    games.forEach((g) => (m[g.id] = g.date));
    return m;
  }, [games]);

  const filteredAtBats = useMemo(
    () => filterAtBatsByDate(allAtBats, games, dateFilter),
    [allAtBats, games, dateFilter]
  );

  const filters = useMemo(() => seasonOptions(games), [games]);
  const rec = useMemo(() => recordLine(games), [games]);

  if (playerId) {
    const player = players.find((p) => p.id === playerId);
    return (
      <PlayerDetail
        player={player}
        players={players}
        atBats={filteredAtBats.filter((a) => a.playerId === playerId)}
        allAtBats={filteredAtBats}
        gameDates={gameDates}
        onBack={() => setPlayerId(null)}
        showToast={showToast}
      />
    );
  }

  const downloadCsv = () => {
    const csv = exportStatsCsv(players, filteredAtBats, games);
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "batting-stats.csv";
    a.click();
    showToast("CSV downloaded");
  };

  return (
    <div>
      <div className="filter-row">
        <select value={dateFilter} onChange={(e) => { tap(); setDateFilter(e.target.value); }}>
          {filters.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
        <button className="btn small" onClick={() => shareStats(players, filteredAtBats, games, showToast)}>Share</button>
        <button className="btn small" onClick={downloadCsv}>CSV</button>
      </div>

      {rec.w + rec.l + rec.t > 0 && (
        <p className="record-line">Record: <b>{rec.w}-{rec.l}{rec.t ? `-${rec.t}` : ""}</b></p>
      )}

      <div className="seg">
        {[["team", "Team"], ["games", "Games"]].map(([k, label]) => (
          <button key={k} className={view === k ? "active" : ""} onClick={() => { tap(); setView(k); }}>{label}</button>
        ))}
      </div>

      {view === "team" && (
        <>
          <TeamTable players={players} allAtBats={filteredAtBats} onPlayer={setPlayerId} />
          <LineupCheck players={players} allAtBats={filteredAtBats} showToast={showToast} />
        </>
      )}
      {view === "games" && (
        <GamesLog
          players={players}
          games={games}
          allAtBats={allAtBats}
          showToast={showToast}
          hasActiveGame={hasActiveGame}
        />
      )}
    </div>
  );
}

function outMixShort(outMix) {
  const order = ["PO", "FO", "GO", "LO", "K", "XHR", "FC"];
  return order.filter((k) => outMix[k]).map((k) => `${outMix[k]}${k}`).join(" ") || "—";
}

function TeamTable({ players, allAtBats, onPlayer }) {
  const [sort, setSort] = useState("obp");

  const rows = useMemo(() => {
    const r = players
      .map((p) => ({ player: p, line: computeLine(allAtBats.filter((a) => a.playerId === p.id)) }))
      .filter((row) => row.line.pa > 0 || row.player.active !== false);
    const cmp = {
      name: (a, b) => a.player.name.localeCompare(b.player.name),
      pa: (a, b) => b.line.pa - a.line.pa,
      obp: (a, b) => b.line.obp - a.line.obp || b.line.pa - a.line.pa,
      slg: (a, b) => b.line.slg - a.line.slg || b.line.pa - a.line.pa,
    }[sort];
    return r.sort(cmp);
  }, [players, allAtBats, sort]);

  const th = (key, label) => (
    <th className={`sortable${sort === key ? " sorted" : ""}`} onClick={() => { tap(); setSort(key); }}>{label}</th>
  );

  return (
    <div className="card" style={{ padding: "6px 10px", overflowX: "auto" }}>
      <table className="stats">
        <thead>
          <tr>
            {th("name", "Player")}
            {th("pa", "PA")}
            <th>H</th>
            <th>BB</th>
            {th("obp", "OBP")}
            <th>AVG</th>
            {th("slg", "SLG")}
            <th>Outs</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ player, line }) => (
            <tr key={player.id} className="row-tap" onClick={() => { tap(); onPlayer(player.id); }}>
              <td className="name">{player.name}</td>
              <td>{line.pa}</td>
              <td>{line.h}</td>
              <td>{line.bb}</td>
              <td style={{ color: "var(--blue)", fontWeight: 600 }}>{line.pa ? fmt3(line.obp) : "—"}</td>
              <td>{line.ab ? fmt3(line.avg) : "—"}</td>
              <td>{line.ab ? fmt3(line.slg) : "—"}</td>
              <td className="muted" style={{ fontSize: 12 }}>{outMixShort(line.outMix)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {allAtBats.length === 0 && <p className="muted" style={{ textAlign: "center" }}>No at-bats yet — log a game first.</p>}
    </div>
  );
}

function GamesLog({ players, games, allAtBats, showToast, hasActiveGame }) {
  const [openId, setOpenId] = useState(null);
  const [editGame, setEditGame] = useState(null);
  const [deleteGame, setDeleteGame] = useState(null);
  const [reopenGame, setReopenGame] = useState(null);

  const saveGameEdit = async () => {
    const g = editGame;
    const us = g.usScore === "" || g.usScore == null ? null : Number(g.usScore);
    const them = g.themScore === "" || g.themScore == null ? null : Number(g.themScore);
    let result = g.result || null;
    if (us != null && them != null) result = us > them ? "W" : us < them ? "L" : "T";
    await updateDoc(teamDoc("games", g.id), {
      date: g.date,
      opponent: g.opponent?.trim() || null,
      usScore: us,
      themScore: them,
      result,
    });
    showToast("Game updated");
    setEditGame(null);
  };

  return (
    <div>
      {games.length === 0 && <p className="muted">No games yet.</p>}
      {games.map((g) => {
        const abs = allAtBats.filter((a) => a.gameId === g.id);
        const line = computeLine(abs);
        const open = openId === g.id;
        const result = gameResult(g);
        const score = g.usScore != null && g.themScore != null ? `${g.usScore}–${g.themScore}` : null;
        return (
          <div key={g.id} className="card">
            <div className="list-row" style={{ borderBottom: open ? undefined : "none" }}>
              <div className="grow row-tap" onClick={() => { tap(); setOpenId(open ? null : g.id); }}>
                <div style={{ fontFamily: "var(--font-cond)", fontSize: 18, fontWeight: 700 }}>
                  {g.date} {g.opponent ? `vs ${g.opponent}` : ""}{" "}
                  {!g.final && <span style={{ color: "var(--green)" }}>· LIVE</span>}
                  {result && g.final && <span className={`result-badge ${result}`}> {result}</span>}
                  {score && <span className="muted"> · {score}</span>}
                </div>
                <div className="muted">
                  {line.pa} PA · {line.h} H · {line.bb} BB · {line.rbi} RBI · OBP {line.pa ? fmt3(line.obp) : "—"}
                </div>
              </div>
              <button className="icon-btn" onClick={() => { tap(); setEditGame({ ...g }); }}>✎</button>
            </div>
            {open && (
              <>
                <table className="stats" style={{ marginTop: 6 }}>
                  <thead><tr><th>Player</th><th>PA</th><th>H</th><th>BB</th><th>RBI</th><th>Line</th></tr></thead>
                  <tbody>
                    {players.filter((p) => abs.some((a) => a.playerId === p.id)).map((p) => {
                      const pabs = abs.filter((a) => a.playerId === p.id);
                      const l = computeLine(pabs);
                      return (
                        <tr key={p.id}>
                          <td className="name">{p.name}</td>
                          <td>{l.pa}</td>
                          <td>{l.h}</td>
                          <td>{l.bb}</td>
                          <td>{l.rbi}</td>
                          <td className="muted" style={{ fontSize: 12 }}>{pabs.map((a) => resultChipCode(a)).join(" ")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="game-actions">
                  {g.final && !hasActiveGame && (
                    <button className="btn small" onClick={() => setReopenGame(g)}>Reopen</button>
                  )}
                  <button className="btn small danger" onClick={() => setDeleteGame(g)}>Delete</button>
                </div>
              </>
            )}
          </div>
        );
      })}

      {editGame && (
        <Dialog open title="Edit game" confirmLabel="Save" onConfirm={saveGameEdit} onCancel={() => setEditGame(null)}>
          <label className="field-label">Date</label>
          <input type="date" value={editGame.date || ""} onChange={(e) => setEditGame({ ...editGame, date: e.target.value })} />
          <label className="field-label">Opponent</label>
          <input value={editGame.opponent || ""} onChange={(e) => setEditGame({ ...editGame, opponent: e.target.value })} placeholder="Opponent" />
          <div className="score-row" style={{ marginTop: 10 }}>
            <span>Us</span>
            <input type="number" min="0" value={editGame.usScore ?? ""} onChange={(e) => setEditGame({ ...editGame, usScore: e.target.value })} style={{ width: 64 }} />
            <span>Them</span>
            <input type="number" min="0" value={editGame.themScore ?? ""} onChange={(e) => setEditGame({ ...editGame, themScore: e.target.value })} style={{ width: 64 }} />
          </div>
        </Dialog>
      )}

      <Dialog
        open={!!deleteGame}
        title="Delete game?"
        message={`Remove ${deleteGame?.date}${deleteGame?.opponent ? ` vs ${deleteGame.opponent}` : ""} and all its at-bats? This can't be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          const g = deleteGame;
          const snap = await getDocs(query(teamCol("games", g.id, "atBats")));
          const batch = writeBatch(db);
          snap.docs.forEach((d) => batch.delete(teamDoc("games", g.id, "atBats", d.id)));
          batch.delete(teamDoc("games", g.id));
          await batch.commit();
          showToast("Game deleted");
          setDeleteGame(null);
        }}
        onCancel={() => setDeleteGame(null)}
      />

      <Dialog
        open={!!reopenGame}
        title="Reopen game?"
        message="This game will become live again so you can keep logging at-bats."
        confirmLabel="Reopen"
        onConfirm={async () => {
          await updateDoc(teamDoc("games", reopenGame.id), { final: false });
          showToast("Game reopened — check Game tab");
          setReopenGame(null);
        }}
        onCancel={() => setReopenGame(null)}
      />
    </div>
  );
}
