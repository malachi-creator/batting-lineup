import React, { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { getTeamId, teamCol } from "../team.js";
import FieldDiagram from "./FieldDiagram.jsx";
import AtBatEditor, { updateAtBat } from "./AtBatEditor.jsx";
import {
  ENDED_BASE_LABELS,
  OUT_TYPE_LABELS,
  RESULT_LABELS,
  ZONE_LABELS,
  advanceBaseOptions,
  baseEarned,
  canAdvanceOnError,
  formatAbResult,
  normalizeEndedBase,
} from "../stats.js";
import { tap } from "../haptics.js";

const EMPTY_PENDING = {
  result: null,
  outType: null,
  zone: null,
  loc: null,
  contact: null,
  endedBase: null,
  advanceResolved: false,
  rbi: 0,
  twoOuts: false,
};

export default function CatchUpTab({ gameId, playerId, players, games, showToast, onDone }) {
  const game = games.find((g) => g.id === gameId);
  const player = players.find((p) => p.id === playerId);
  const [atBats, setAtBats] = useState([]);
  const [pending, setPending] = useState(EMPTY_PENDING);
  const [showMore, setShowMore] = useState(false);
  const [editAb, setEditAb] = useState(null);
  const [recentOpen, setRecentOpen] = useState(true);

  useEffect(() => {
    localStorage.setItem(`bp.playerId.${getTeamId()}`, playerId);
  }, [playerId]);

  useEffect(() => {
    if (!gameId) return;
    const q = query(teamCol("games", gameId, "atBats"), orderBy("seq"));
    return onSnapshot(q, (snap) => {
      setAtBats(snap.docs.map((d) => ({ id: d.id, gameId, ...d.data() })));
    });
  }, [gameId]);

  const myAtBats = useMemo(
    () => atBats.filter((a) => a.playerId === playerId),
    [atBats, playerId]
  );

  if (!game) {
    return (
      <div className="card">
        <h3>Game not found</h3>
        <p className="muted">This catch-up link may be outdated.</p>
        <button className="btn primary" style={{ width: "100%", marginTop: 12 }} onClick={onDone}>Back to app</button>
      </div>
    );
  }

  if (!player) {
    return (
      <div className="card">
        <h3>Player not found</h3>
        <p className="muted">This player isn't on the roster anymore.</p>
        <button className="btn primary" style={{ width: "100%", marginTop: 12 }} onClick={onDone}>Back to app</button>
      </div>
    );
  }

  const nextSeq = atBats.reduce((max, a) => Math.max(max, a.seq ?? 0), -1) + 1;

  const reset = () => {
    setPending(EMPTY_PENDING);
    setShowMore(false);
  };

  const save = (fields) => {
    tap(20);
    const ab = { ...pending, ...fields };
    addDoc(teamCol("games", game.id, "atBats"), {
      playerId: player.id,
      seq: nextSeq,
      result: ab.result,
      zone: ab.zone || null,
      loc: ab.loc || null,
      contact: ab.contact || null,
      outType: ab.outType || null,
      rbi: ab.rbi || 0,
      twoOuts: !!ab.twoOuts,
      endedBase: normalizeEndedBase(ab),
      source: "catch-up",
      createdAt: serverTimestamp(),
    });
    showToast(`${formatAbResult(ab)} saved`);
    reset();
  };

  const undo = () => {
    if (myAtBats.length === 0) return;
    tap(30);
    const last = myAtBats[myAtBats.length - 1];
    deleteDoc(doc(teamCol("games", game.id, "atBats"), last.id));
    showToast(`Undid ${RESULT_LABELS[last.result] || "last at-bat"}`);
    reset();
  };

  const choose = (fields) => {
    tap();
    setPending((p) => ({ ...p, ...fields }));
  };

  const isHitLike = ["1B", "2B", "3B", "HR", "ROE"].includes(pending.result);

  let step = "result";
  if (pending.result === "OUT" && !pending.outType) step = "outType";
  else if (pending.result === "OUT" && pending.outType && pending.outType !== "K" && !pending.loc) step = "placement";
  else if (pending.result === "OUT" && pending.outType && pending.outType !== "K" && pending.loc) step = "outConfirm";
  else if (isHitLike && !pending.loc) step = "placement";
  else if (isHitLike && pending.loc && !pending.contact) step = "contact";
  else if (canAdvanceOnError(pending.result) && !pending.advanceResolved) step = "advance";

  const placeBall = (zone, loc) => choose({ zone, loc });
  const placementLabel = pending.loc ? "Tap again to move the pin" : "Tap exactly where the ball landed";
  const recent = [...myAtBats].reverse();

  const scoreLabel =
    game.usScore != null && game.themScore != null
      ? `${game.usScore}–${game.themScore}`
      : null;

  return (
    <div>
      <div className="catch-up-banner">
        <div className="grow">
          <div style={{ fontWeight: 700, fontFamily: "var(--font-cond)", fontSize: 16 }}>Catch-up entry</div>
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.4 }}>
            Log at-bats you missed when the app wasn't working.
          </div>
        </div>
        <button className="btn small" onClick={() => { tap(); onDone(); }}>Done</button>
      </div>

      <div className="batter-card">
        <div className="muted" style={{ textTransform: "uppercase", letterSpacing: "0.1em", fontSize: 12 }}>
          {game.date}{game.opponent ? ` vs ${game.opponent}` : ""}{scoreLabel ? ` · ${scoreLabel}` : ""}
        </div>
        <div className="now">{player.name}</div>
        <div className="ondeck">{myAtBats.length} at-bat{myAtBats.length === 1 ? "" : "s"} logged for this game</div>
      </div>

      {step === "result" && (
        <>
          <div className="step-label">Result</div>
          <div className="btn-grid">
            <button className="btn" onClick={() => choose({ result: "1B" })}>Single</button>
            <button className="btn" onClick={() => choose({ result: "2B" })}>Double</button>
            <button className="btn" onClick={() => choose({ result: "3B" })}>Triple</button>
            <button className="btn" onClick={() => choose({ result: "HR" })}>Home Run</button>
            <button className="btn" onClick={() => choose({ result: "BB" })}>Walk</button>
            <button className="btn" onClick={() => choose({ result: "OUT" })}>Out</button>
            <button className="btn span2" onClick={() => choose({ result: "ROE" })}>Reached on Error</button>
          </div>
        </>
      )}

      {step === "outType" && (
        <>
          <div className="step-label">Out — how?</div>
          <div className="btn-grid">
            <button className="btn" onClick={() => save({ result: "OUT", outType: "K" })}>Strikeout</button>
            <button className="btn" onClick={() => choose({ outType: "GO" })}>Ground out</button>
            <button className="btn" onClick={() => choose({ outType: "FO" })}>Fly out</button>
            <button className="btn" onClick={() => choose({ outType: "PO" })}>Pop-up</button>
            <button className="btn" onClick={() => choose({ outType: "LO" })}>Line out</button>
            <button className="btn" onClick={() => choose({ outType: "FC" })}>Force / FC</button>
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

      {step === "contact" && isHitLike && (
        <>
          <div className="step-label">Contact — {RESULT_LABELS[pending.result]}{pending.zone ? ` · ${ZONE_LABELS[pending.zone]}` : ""}</div>
          <FieldDiagram marker={pending.loc} onZone={placeBall} />
          <p className="muted" style={{ textAlign: "center", margin: "8px 0 10px", fontSize: 13 }}>Pin shows where you placed it · tap field to adjust</p>
          <div className="btn-grid cols3">
            {["HARD", "MED", "WEAK"].map((c) => (
              <button
                key={c}
                className={`btn${c === "MED" ? " selected" : ""}`}
                onClick={() => {
                  if (canAdvanceOnError(pending.result)) choose({ contact: c });
                  else save({ contact: c });
                }}
              >
                {c === "HARD" ? "Hard" : c === "MED" ? "Medium" : "Weak"}
              </button>
            ))}
          </div>
        </>
      )}

      {step === "advance" && (
        <>
          <div className="step-label">
            Extra base on error? <span style={{ color: "var(--text)" }}>{formatAbResult(pending)}</span>
          </div>
          <p className="muted" style={{ textAlign: "center", margin: "0 0 12px", fontSize: 13 }}>
            Wild throw, dropped ball, etc. after they were already safe
          </p>
          <div className="btn-grid">
            <button
              className="btn primary"
              onClick={() => save({ endedBase: null, advanceResolved: true })}
            >
              No — stayed at {ENDED_BASE_LABELS[baseEarned(pending)]}
            </button>
            {advanceBaseOptions(pending.result).map((b) => (
              <button
                key={b}
                className="btn"
                onClick={() => save({ endedBase: b, advanceResolved: true })}
              >
                Ended on {ENDED_BASE_LABELS[b]} (E)
              </button>
            ))}
          </div>
        </>
      )}

      {step === "result" && myAtBats.length > 0 && (
        <div className="card" style={{ marginTop: 12, padding: "8px 12px" }}>
          <div className="list-row row-tap" style={{ border: "none" }} onClick={() => { tap(); setRecentOpen((v) => !v); }}>
            <span className="grow" style={{ fontFamily: "var(--font-cond)", fontWeight: 600 }}>Your at-bats this game</span>
            <span className="muted">{recentOpen ? "▾" : "▸"}</span>
          </div>
          {recentOpen && recent.map((a) => (
            <div key={a.id} className="ab-chip row-tap" onClick={() => { tap(); setEditAb(a); }}>
              <span className={`res ${a.result === "BB" ? "bb" : ["1B", "2B", "3B", "HR"].includes(a.result) ? "hit" : "out"}`}>
                {a.result === "OUT" ? a.outType : a.result}
              </span>
              <span className="meta grow">{a.source === "catch-up" ? "catch-up · tap to edit" : "tap to edit"}</span>
            </div>
          ))}
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
        <button className="btn small danger" onClick={undo} disabled={myAtBats.length === 0}>↩ Undo</button>
        {step !== "result" && <button className="btn small" onClick={reset}>Cancel</button>}
      </div>

      <AtBatEditor
        ab={editAb}
        playerName={player.name}
        open={!!editAb}
        onClose={() => setEditAb(null)}
        onSave={(fields) => updateAtBat(game.id, editAb.id, fields).then(() => showToast("At-bat updated"))}
      />
    </div>
  );
}
