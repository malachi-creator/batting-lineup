import React, { useMemo, useState } from "react";
import {
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { deleteGameRecord } from "../games.js";
import { teamCol, teamDoc } from "../team.js";
import { LEAGUE_DIVISION, LEAGUE_HR_LIMIT, LEAGUE_LABEL, countGameHomeRuns, gameHrLimit } from "../league.js";
import FieldDiagram from "./FieldDiagram.jsx";
import AtBatEditor, { updateAtBat } from "./AtBatEditor.jsx";
import { Dialog, PromptDialog } from "./Dialog.jsx";
import { BALL_TYPE_LABELS, BALL_TYPES, GAME_RESULT_LABELS, OUT_TYPE_LABELS, OUT_TYPES, RESULT_LABELS, ZONE_LABELS, formatAbResult, needsBallType, needsPlacement, resultChipClass, resultChipCode } from "../stats.js";
import { tap } from "../haptics.js";
import { findScheduleForDate, formatScheduleDate, formatScheduleMeta, gameForSchedule, todayISO } from "../schedule.js";

export default function GameTab({ players, games, schedule, activeGame, abByGame, showToast }) {
  if (activeGame) {
    return (
      <AtBatLogger
        game={activeGame}
        players={players}
        atBats={abByGame[activeGame.id] || []}
        showToast={showToast}
      />
    );
  }
  return <GameSetup players={players} games={games} schedule={schedule} showToast={showToast} />;
}

function GameSetup({ players, games, schedule, showToast }) {
  const active = players.filter((p) => p.active !== false);
  const today = todayISO();
  const todayEntry = findScheduleForDate(schedule, today);
  const todayLinked = todayEntry ? gameForSchedule(games, todayEntry.id) : null;
  const [date, setDate] = useState(() => today);
  const [opponent, setOpponent] = useState(() => todayEntry?.opponent || "");
  const [present, setPresent] = useState(() => new Set(active.map((p) => p.id)));

  const toggle = (id) => {
    tap();
    setPresent((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const start = () => {
    tap(20);
    const linkedEntry = findScheduleForDate(schedule, date);
    const alreadyLinked = linkedEntry ? gameForSchedule(games, linkedEntry.id) : null;
    addDoc(teamCol("games"), {
      date,
      opponent: opponent.trim() || null,
      leagueDivision: LEAGUE_DIVISION,
      hrLimit: LEAGUE_HR_LIMIT,
      present: active.filter((p) => present.has(p.id)).map((p) => p.id),
      final: false,
      usScore: null,
      themScore: null,
      result: null,
      scheduleId: linkedEntry && !alreadyLinked ? linkedEntry.id : null,
      createdAt: serverTimestamp(),
    });
  };

  return (
    <div>
      <h2 style={{ fontSize: 26, marginBottom: 12 }}>New Game</h2>
      {todayEntry && !todayLinked && (
        <div className="schedule-today-banner">
          <span className="grow">
            <b>Today:</b> vs {todayEntry.opponent || "TBD"}
            <span className="muted" style={{ display: "block", fontSize: 13, marginTop: 2 }}>
              {formatScheduleDate(todayEntry.date)}
              {formatScheduleMeta(todayEntry) && ` · ${formatScheduleMeta(todayEntry)}`}
              {" · pre-filled below"}
            </span>
          </span>
        </div>
      )}
      <div className="card">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            type="date"
            value={date}
            onChange={(e) => {
              const d = e.target.value;
              setDate(d);
              const entry = findScheduleForDate(schedule, d);
              if (entry?.opponent) setOpponent(entry.opponent);
            }}
          />
          <input placeholder="Opponent (optional)" value={opponent} onChange={(e) => setOpponent(e.target.value)} />
        </div>
        <p className="muted" style={{ margin: "10px 0 0", fontSize: 13 }}>
          {LEAGUE_LABEL} · {LEAGUE_HR_LIMIT} team HRs per game (over limit = out)
        </p>
      </div>
      <div className="card">
        <h3>Who's here? ({present.size})</h3>
        {active.map((p, i) => (
          <div key={p.id} className="list-row row-tap" onClick={() => toggle(p.id)}>
            <span className="order-num">{i + 1}</span>
            <span className="grow" style={{ fontFamily: "var(--font-cond)", fontSize: 18, fontWeight: 600 }}>{p.name}</span>
            <span className={`check${present.has(p.id) ? " on" : ""}`}>{present.has(p.id) ? "✓" : ""}</span>
          </div>
        ))}
      </div>
      <button className="btn primary" style={{ width: "100%" }} onClick={start} disabled={present.size === 0}>
        Start Game
      </button>
      {games.length > 0 && (
        <p className="muted" style={{ textAlign: "center", marginTop: 14 }}>
          {games.length} game{games.length === 1 ? "" : "s"} logged — see Stats → Games
        </p>
      )}
    </div>
  );
}

const EMPTY_PENDING = { result: null, outType: null, ballType: null, zone: null, loc: null, contact: null, rbi: 0, twoOuts: false };

function AtBatLogger({ game, players, atBats, showToast }) {
  const [pending, setPending] = useState(EMPTY_PENDING);
  const [showMore, setShowMore] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [subsOpen, setSubsOpen] = useState(false);
  const [endConfirm, setEndConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [editAb, setEditAb] = useState(null);
  const [recentOpen, setRecentOpen] = useState(false);

  const lineup = useMemo(
    () => players.filter((p) => game.present?.includes(p.id)),
    [players, game.present]
  );

  const bench = useMemo(
    () => players.filter((p) => p.active !== false && !game.present?.includes(p.id)),
    [players, game.present]
  );

  const teamHrs = countGameHomeRuns(atBats);
  const hrLimit = gameHrLimit(game);
  const hrAtLimit = teamHrs >= hrLimit;

  if (lineup.length === 0) return <p className="muted">No players marked present — add a sub from the menu.</p>;

  const batter = lineup[atBats.length % lineup.length];
  const onDeck = lineup[(atBats.length + 1) % lineup.length];

  const scoreLabel =
    game.usScore != null && game.themScore != null
      ? `${game.usScore}–${game.themScore}`
      : null;

  const reset = () => {
    setPending(EMPTY_PENDING);
    setShowMore(false);
  };

  const save = (fields) => {
    tap(20);
    const ab = { ...pending, ...fields };
    const placement = needsPlacement(ab.result);
    const nextSeq = atBats.length === 0 ? 0 : Math.max(...atBats.map((a) => a.seq ?? 0)) + 1;
    addDoc(teamCol("games", game.id, "atBats"), {
      playerId: batter.id,
      seq: nextSeq,
      result: ab.result,
      zone: ab.zone || null,
      loc: ab.loc || null,
      contact: placement ? ab.contact || null : null,
      ballType: needsBallType(ab.result) ? ab.ballType || null : null,
      outType: ab.result === "OUT" ? ab.outType || null : null,
      rbi: ab.rbi || 0,
      twoOuts: !!ab.twoOuts,
      createdAt: serverTimestamp(),
    });
    showToast(`${batter.name}: ${formatAbResult(ab)}${ab.outType === "XHR" ? " · over HR limit" : ab.result === "HR" && teamHrs + 1 >= hrLimit ? ` · team at HR limit (${teamHrs + 1}/${hrLimit})` : ""}`);
    reset();
  };

  const undo = async () => {
    if (pending.result !== null || atBats.length === 0) return;
    tap(30);
    const last = atBats.reduce((a, b) => (a.seq > b.seq ? a : b));
    const who = players.find((p) => p.id === last.playerId);
    await deleteDoc(doc(teamCol("games", game.id, "atBats"), last.id));
    showToast(`Undid ${who?.name || "last"}: ${formatAbResult(last)}`);
    reset();
  };

  const finishGame = async () => {
    setEndConfirm(false);
    setMenuOpen(false);
    await updateDoc(teamDoc("games", game.id), { final: true });
    showToast(`Game saved · ${atBats.length} at-bats`);
  };

  const removeGame = async () => {
    setDeleteConfirm(false);
    setMenuOpen(false);
    await deleteGameRecord(game.id);
    showToast("Game deleted");
  };

  const addSub = async (playerId) => {
    tap();
    const present = [...(game.present || []), playerId];
    await updateDoc(teamDoc("games", game.id), { present });
    const p = players.find((x) => x.id === playerId);
    showToast(`${p?.name} subbed in`);
    setSubsOpen(false);
  };

  const bumpScore = async (field, delta) => {
    const cur = game[field] ?? 0;
    const next = Math.max(0, cur + delta);
    await updateDoc(teamDoc("games", game.id), {
      [field]: next,
      result: field === "usScore" || field === "themScore"
        ? (() => {
            const us = field === "usScore" ? next : (game.usScore ?? 0);
            const them = field === "themScore" ? next : (game.themScore ?? 0);
            return us > them ? "W" : us < them ? "L" : "T";
          })()
        : game.result,
    });
  };

  const choose = (fields) => {
    tap();
    setPending((p) => ({ ...p, ...fields }));
  };

  const pickHr = () => {
    if (hrAtLimit) {
      save({ result: "OUT", outType: "XHR", zone: null, loc: null, contact: null, ballType: null });
      return;
    }
    choose({ result: "HR", outType: null });
  };

  const inPlacementFlow = needsPlacement(pending.result);
  const wantsBallType = needsBallType(pending.result);

  let step = "result";
  if (pending.result === "OUT" && !pending.outType) step = "outType";
  else if (pending.result === "OUT" && pending.outType && pending.outType !== "K" && !pending.loc) step = "placement";
  else if (pending.result === "OUT" && pending.outType && pending.outType !== "K" && pending.loc) step = "outConfirm";
  else if (inPlacementFlow && !pending.loc) step = "placement";
  else if (inPlacementFlow && pending.loc && wantsBallType && !pending.ballType) step = "ballType";
  else if (inPlacementFlow && pending.loc) step = "contact";

  const placeBall = (zone, loc) => choose({ zone, loc });
  const placementLabel = pending.loc ? "Tap again to move the pin" : "Tap exactly where the ball landed";

  const recent = [...atBats].slice(-8).reverse();

  return (
    <div>
      <div className="batter-card">
        <div className="batter-card-top">
          <div className="muted" style={{ textTransform: "uppercase", letterSpacing: "0.1em", fontSize: 12 }}>
            Now batting · #{(atBats.length % lineup.length) + 1} · vs {game.opponent || "—"}
          </div>
          <button className="icon-btn" onClick={() => { tap(); setMenuOpen(true); }} aria-label="Game menu">⋯</button>
        </div>
        {scoreLabel && <div className="score-pill">{scoreLabel}</div>}
        {hrLimit != null && (
          <div className={`hr-pill${hrAtLimit ? " at-limit" : ""}`}>
            Team HRs {teamHrs}/{hrLimit} · D league
            {hrAtLimit && " · next HR is an out"}
          </div>
        )}
        <div className="now">{batter.name}</div>
        <div className="ondeck">On deck: <b>{onDeck.name}</b></div>
      </div>

      {step === "result" && (
        <>
          <div className="step-label">Result</div>
          <div className="btn-grid">
            <button className="btn" onClick={() => choose({ result: "1B" })}>Single</button>
            <button className="btn" onClick={() => choose({ result: "2B" })}>Double</button>
            <button className="btn" onClick={() => choose({ result: "3B" })}>Triple</button>
            <button className={`btn${hrAtLimit ? " danger" : ""}`} onClick={pickHr}>
              {hrAtLimit ? "HR (limit out)" : "Home Run"}
            </button>
            <button className="btn" onClick={() => save({ result: "BB" })}>Walk</button>
            <button className="btn" onClick={() => choose({ result: "OUT" })}>Out</button>
            <button className="btn" onClick={() => choose({ result: "ROE", outType: null })}>{GAME_RESULT_LABELS.ROE}</button>
            <button className="btn" onClick={() => choose({ result: "FC", outType: null })}>{GAME_RESULT_LABELS.FC}</button>
          </div>
        </>
      )}

      {step === "outType" && (
        <>
          <div className="step-label">Out — how?</div>
          <div className="btn-grid">
            {OUT_TYPES.map((o) => (
              <button
                key={o}
                className="btn"
                onClick={() => (o === "K" ? save({ result: "OUT", outType: "K" }) : choose({ outType: o }))}
              >
                {OUT_TYPE_LABELS[o]}
              </button>
            ))}
          </div>
        </>
      )}

      {step === "placement" && (
        <>
          <div className="step-label">{placementLabel} <span style={{ color: "var(--text)" }}>{RESULT_LABELS[pending.result]}{pending.outType ? ` · ${OUT_TYPE_LABELS[pending.outType]}` : ""}</span></div>
          <FieldDiagram marker={pending.loc} onZone={placeBall} />
        </>
      )}

      {step === "outConfirm" && (
        <>
          <div className="step-label">{placementLabel} <span style={{ color: "var(--text)" }}>{OUT_TYPE_LABELS[pending.outType]}</span></div>
          <FieldDiagram marker={pending.loc} onZone={placeBall} />
          <button className="btn primary" style={{ width: "100%", marginTop: 12 }} onClick={() => save({ zone: pending.zone, loc: pending.loc })}>Confirm spot</button>
        </>
      )}

      {step === "ballType" && (
        <>
          <div className="step-label">
            How did it go? <span style={{ color: "var(--text)" }}>{RESULT_LABELS[pending.result]}{pending.zone ? ` · ${ZONE_LABELS[pending.zone]}` : ""}</span>
          </div>
          <FieldDiagram marker={pending.loc} onZone={placeBall} />
          <div className="btn-grid">
            {BALL_TYPES.map((b) => (
              <button key={b} className="btn" onClick={() => choose({ ballType: b })}>
                {BALL_TYPE_LABELS[b]}
              </button>
            ))}
          </div>
        </>
      )}

      {step === "contact" && inPlacementFlow && (
        <>
          <div className="step-label">
            Contact — {pending.ballType ? `${BALL_TYPE_LABELS[pending.ballType]} ` : ""}{RESULT_LABELS[pending.result].toLowerCase()}
            {pending.zone ? ` · ${ZONE_LABELS[pending.zone]}` : ""}
          </div>
          <FieldDiagram marker={pending.loc} onZone={placeBall} />
          <p className="muted" style={{ textAlign: "center", margin: "8px 0 10px", fontSize: 13 }}>Pin shows where it landed · tap to adjust · how well did you drive the arc?</p>
          <div className="btn-grid cols3">
            <button className="btn" onClick={() => save({ contact: "HARD" })}>Hard</button>
            <button className="btn selected" onClick={() => save({ contact: "MED" })}>Medium</button>
            <button className="btn" onClick={() => save({ contact: "WEAK" })}>Weak</button>
          </div>
        </>
      )}

      {step === "result" && atBats.length > 0 && (
        <div className="card" style={{ marginTop: 12, padding: "8px 12px" }}>
          <div className="list-row row-tap" style={{ border: "none" }} onClick={() => { tap(); setRecentOpen((v) => !v); }}>
            <span className="grow" style={{ fontFamily: "var(--font-cond)", fontWeight: 600 }}>Recent at-bats</span>
            <span className="muted">{recentOpen ? "▾" : "▸"}</span>
          </div>
          {recentOpen && recent.map((a) => {
            const who = players.find((p) => p.id === a.playerId);
            return (
              <div key={a.id} className="ab-chip row-tap" onClick={() => { tap(); setEditAb(a); }}>
                <span className={`res ${resultChipClass(a)}`}>
                  {resultChipCode(a)}
                </span>
                <span className="meta grow">{who?.name} · tap to edit</span>
              </div>
            );
          })}
        </div>
      )}

      <button className="btn small" style={{ width: "100%", marginTop: 14, color: "var(--text-dim)" }} onClick={() => setShowMore((v) => !v)}>
        {showMore ? "Less" : "More (RBI / 2 outs)"}
      </button>

      {showMore && (
        <div className="more-panel">
          <div className="stepper">
            <button onClick={() => choose({ rbi: Math.max(0, pending.rbi - 1) })}>−</button>
            <span className="val">{pending.rbi}</span>
            <button onClick={() => choose({ rbi: Math.min(4, pending.rbi + 1) })}>+</button>
            <span className="muted">RBI</span>
          </div>
          <button className={`toggle${pending.twoOuts ? " on" : ""}`} onClick={() => choose({ twoOuts: !pending.twoOuts })}>2 outs</button>
        </div>
      )}

      <div className="logger-footer">
        {pending.result === null ? (
          <button className="btn small danger" onClick={undo} disabled={atBats.length === 0}>↩ Undo</button>
        ) : (
          <button className="btn small" onClick={reset}>Cancel</button>
        )}
        <button className="btn small" style={{ color: "var(--text-dim)" }} onClick={() => setEndConfirm(true)}>End Game</button>
      </div>

      <p className="muted" style={{ textAlign: "center", marginTop: 12 }}>
        {atBats.length} at-bats · {lineup.length} in lineup{bench.length ? ` · ${bench.length} on bench` : ""}
      </p>

      <Dialog
        open={menuOpen}
        title="Game menu"
        hideCancel
        confirmLabel="Close"
        onConfirm={() => setMenuOpen(false)}
        onCancel={() => setMenuOpen(false)}
      >
        <div className="step-label" style={{ marginTop: 0 }}>Score</div>
        {hrLimit != null && (
          <p style={{ margin: "0 0 10px", fontSize: 14 }}>
            Team home runs: <b>{teamHrs}/{hrLimit}</b>
            <span className="muted"> · D league</span>
          </p>
        )}
        <div className="score-row">
          <span>Us</span>
          <div className="stepper">
            <button onClick={() => bumpScore("usScore", -1)}>−</button>
            <span className="val">{game.usScore ?? 0}</span>
            <button onClick={() => bumpScore("usScore", 1)}>+</button>
          </div>
          <span>Them</span>
          <div className="stepper">
            <button onClick={() => bumpScore("themScore", -1)}>−</button>
            <span className="val">{game.themScore ?? 0}</span>
            <button onClick={() => bumpScore("themScore", 1)}>+</button>
          </div>
        </div>
        {bench.length > 0 && (
          <button className="btn" style={{ width: "100%", marginTop: 10 }} onClick={() => { setSubsOpen(true); setMenuOpen(false); }}>
            Add sub ({bench.length} available)
          </button>
        )}
        <button
          className="btn danger"
          style={{ width: "100%", marginTop: 10 }}
          onClick={() => { setDeleteConfirm(true); setMenuOpen(false); }}
        >
          Delete game
        </button>
      </Dialog>

      <Dialog open={subsOpen} title="Add sub" hideCancel confirmLabel="Done" onConfirm={() => setSubsOpen(false)} onCancel={() => setSubsOpen(false)}>
        {bench.map((p) => (
          <div key={p.id} className="list-row row-tap" onClick={() => addSub(p.id)}>
            <span className="grow" style={{ fontFamily: "var(--font-cond)", fontSize: 18, fontWeight: 600 }}>{p.name}</span>
            <span className="muted">+ Add</span>
          </div>
        ))}
      </Dialog>

      <Dialog
        open={endConfirm}
        title="End game?"
        message={`${atBats.length} at-bats logged.${scoreLabel ? ` Final score: ${scoreLabel}.` : " Set score in the menu first if you want W/L tracked."}`}
        confirmLabel="End game"
        cancelLabel="Keep going"
        onConfirm={finishGame}
        onCancel={() => setEndConfirm(false)}
      />

      <Dialog
        open={deleteConfirm}
        title="Delete game?"
        message={`Remove ${game.date}${game.opponent ? ` vs ${game.opponent}` : ""} and all ${atBats.length} at-bats? This can't be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={removeGame}
        onCancel={() => setDeleteConfirm(false)}
      />

      <AtBatEditor
        ab={editAb}
        playerName={players.find((p) => p.id === editAb?.playerId)?.name}
        open={!!editAb}
        onClose={() => setEditAb(null)}
        onSave={(fields) => updateAtBat(game.id, editAb.id, fields).then(() => showToast("At-bat updated"))}
      />
    </div>
  );
}
