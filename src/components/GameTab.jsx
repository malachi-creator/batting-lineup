import React, { useMemo, useState } from "react";
import {
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { teamCol, teamDoc } from "../team.js";
import FieldDiagram from "./FieldDiagram.jsx";
import AtBatEditor, { updateAtBat } from "./AtBatEditor.jsx";
import { Dialog, PromptDialog } from "./Dialog.jsx";
import { GAME_RESULT_LABELS, OUT_TYPE_LABELS, OUT_TYPES, RESULT_LABELS, ZONE_LABELS, formatAbResult, needsPlacement, resultChipClass, resultChipCode } from "../stats.js";
import { tap } from "../haptics.js";

export default function GameTab({ players, games, activeGame, abByGame, showToast }) {
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
  return <GameSetup players={players} games={games} showToast={showToast} />;
}

function GameSetup({ players, games, showToast }) {
  const active = players.filter((p) => p.active !== false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [opponent, setOpponent] = useState("");
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
    addDoc(teamCol("games"), {
      date,
      opponent: opponent.trim() || null,
      present: active.filter((p) => present.has(p.id)).map((p) => p.id),
      final: false,
      usScore: null,
      themScore: null,
      result: null,
      createdAt: serverTimestamp(),
    });
  };

  return (
    <div>
      <h2 style={{ fontSize: 26, marginBottom: 12 }}>New Game</h2>
      <div className="card">
        <div style={{ display: "flex", gap: 10 }}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <input placeholder="Opponent (optional)" value={opponent} onChange={(e) => setOpponent(e.target.value)} />
        </div>
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

const EMPTY_PENDING = { result: null, outType: null, zone: null, loc: null, contact: null, rbi: 0, twoOuts: false };

function AtBatLogger({ game, players, atBats, showToast }) {
  const [pending, setPending] = useState(EMPTY_PENDING);
  const [showMore, setShowMore] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [subsOpen, setSubsOpen] = useState(false);
  const [endConfirm, setEndConfirm] = useState(false);
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
    const nextSeq = atBats.length === 0 ? 0 : Math.max(...atBats.map((a) => a.seq ?? 0)) + 1;
    addDoc(teamCol("games", game.id, "atBats"), {
      playerId: batter.id,
      seq: nextSeq,
      result: ab.result,
      zone: ab.zone || null,
      loc: ab.loc || null,
      contact: ab.contact || null,
      outType: ab.result === "OUT" ? ab.outType || null : null,
      rbi: ab.rbi || 0,
      twoOuts: !!ab.twoOuts,
      createdAt: serverTimestamp(),
    });
    showToast(`${batter.name}: ${formatAbResult(ab)}`);
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

  const inPlacementFlow = needsPlacement(pending.result);

  let step = "result";
  if (pending.result === "OUT" && !pending.outType) step = "outType";
  else if (pending.result === "OUT" && pending.outType && pending.outType !== "K" && !pending.loc) step = "placement";
  else if (pending.result === "OUT" && pending.outType && pending.outType !== "K" && pending.loc) step = "outConfirm";
  else if (inPlacementFlow && !pending.loc) step = "placement";
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
            <button className="btn" onClick={() => choose({ result: "HR" })}>Home Run</button>
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

      {step === "contact" && inPlacementFlow && (
        <>
          <div className="step-label">Contact — {RESULT_LABELS[pending.result]}{pending.zone ? ` · ${ZONE_LABELS[pending.zone]}` : ""}</div>
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
