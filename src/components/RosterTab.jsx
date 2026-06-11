import React, { useEffect, useRef, useState } from "react";
import { addDoc, getDoc, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "../firebase.js";
import { teamCol, teamDoc, getTeamName, getTeamCode, setTeam, getTeamId, clearTeam } from "../team.js";
import { Dialog, PromptDialog } from "./Dialog.jsx";
import { tap } from "../haptics.js";

const ROW_H = 60;

export default function RosterTab({ players, showToast }) {
  const [drag, setDrag] = useState(null);
  const [renamePlayer, setRenamePlayer] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [switchConfirm, setSwitchConfirm] = useState(false);
  const [displayCode, setDisplayCode] = useState(getTeamCode());
  const startY = useRef(0);

  useEffect(() => {
    if (displayCode) return;
    getDoc(teamDoc()).then((snap) => {
      const code = snap.exists() ? snap.data().code : null;
      if (code) {
        setDisplayCode(String(code));
        setTeam(getTeamId(), getTeamName(), code);
      }
    });
  }, [displayCode]);

  const teamCode = displayCode;

  const copyCode = async () => {
    if (!teamCode) return;
    try {
      await navigator.clipboard.writeText(teamCode);
      showToast("Team number copied");
    } catch {
      showToast(`Team number: ${teamCode}`);
    }
  };

  const commitOrder = (from, to) => {
    if (from === to) return;
    const order = [...players];
    const [moved] = order.splice(from, 1);
    order.splice(to, 0, moved);
    const batch = writeBatch(db);
    order.forEach((p, i) => {
      if (p.orderIndex !== i) batch.update(teamDoc("players", p.id), { orderIndex: i });
    });
    batch.commit();
    showToast(`${moved.name} now bats ${to + 1}${["st", "nd", "rd"][to] || "th"}`);
  };

  const onPointerDown = (e, index) => {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
    startY.current = e.clientY;
    tap();
    setDrag({ index, overIndex: index, dy: 0 });
  };

  const onPointerMove = (e) => {
    if (!drag) return;
    const dy = e.clientY - startY.current;
    const overIndex = Math.max(0, Math.min(players.length - 1, drag.index + Math.round(dy / ROW_H)));
    if (overIndex !== drag.overIndex) tap(5);
    setDrag((d) => ({ ...d, dy, overIndex }));
  };

  const onPointerEnd = () => {
    if (!drag) return;
    commitOrder(drag.index, drag.overIndex);
    setDrag(null);
  };

  const toggleActive = (p) => {
    tap();
    updateDoc(teamDoc("players", p.id), { active: p.active === false });
  };

  const rowStyle = (i) => {
    if (!drag) return undefined;
    if (i === drag.index) return { transform: `translateY(${drag.dy}px)`, zIndex: 5, position: "relative", transition: "none" };
    if (drag.index < drag.overIndex && i > drag.index && i <= drag.overIndex) return { transform: `translateY(${-ROW_H}px)` };
    if (drag.index > drag.overIndex && i < drag.index && i >= drag.overIndex) return { transform: `translateY(${ROW_H}px)` };
    return undefined;
  };

  return (
    <div>
      <h2 style={{ fontSize: 26, marginBottom: 12 }}>Batting Order</h2>

      {teamCode && (
        <div className="card team-code-card">
          <div className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>Team number</div>
          <div className="team-code-row">
            <span className="team-code">{teamCode}</span>
            <button className="btn small primary" style={{ padding: "0 16px" }} onClick={copyCode}>Copy</button>
          </div>
          <p className="muted" style={{ margin: "8px 0 0", fontSize: 13 }}>Share this so teammates can join on their phones.</p>
        </div>
      )}

      <div className="card" style={{ overflow: "hidden" }}>
        {players.map((p, i) => (
          <div key={p.id} className={`list-row roster-row${drag?.index === i ? " dragging" : ""}`} style={{ ...(p.active === false ? { opacity: 0.4 } : null), ...rowStyle(i) }}>
            <span className="drag-handle" onPointerDown={(e) => onPointerDown(e, i)} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}>☰</span>
            <span className="order-num">{i + 1}</span>
            <span className="grow row-tap" style={{ fontFamily: "var(--font-cond)", fontSize: 19, fontWeight: 600 }} onClick={() => setRenamePlayer(p)}>
              {p.name}{p.active === false && <span className="muted"> · inactive</span>}
            </span>
            <button className="icon-btn" onClick={() => toggleActive(p)}>{p.active === false ? "＋" : "－"}</button>
          </div>
        ))}
        {players.length === 0 && <p className="muted">No players yet — add your lineup below.</p>}
      </div>

      <button className="btn" style={{ width: "100%" }} onClick={() => setAddOpen(true)}>＋ Add Player</button>
      <p className="muted" style={{ marginTop: 10, textAlign: "center" }}>
        Drag ☰ to reorder · tap a name to rename · − benches a player (kept in stats)
      </p>

      <div className="card" style={{ marginTop: 20 }}>
        <h3>Team</h3>
        <div className="list-row">
          <span className="grow">{getTeamName()}</span>
          <button className="btn small" style={{ padding: "0 14px", color: "var(--text-dim)" }} onClick={() => setSwitchConfirm(true)}>Switch team</button>
        </div>
      </div>

      <PromptDialog
        open={!!renamePlayer}
        title="Rename player"
        label="Name"
        defaultValue={renamePlayer?.name || ""}
        onCancel={() => setRenamePlayer(null)}
        onSubmit={(name) => {
          if (name) updateDoc(teamDoc("players", renamePlayer.id), { name });
          setRenamePlayer(null);
        }}
      />

      <PromptDialog
        open={addOpen}
        title="Add player"
        label="Name"
        defaultValue=""
        onCancel={() => setAddOpen(false)}
        onSubmit={(name) => {
          if (!name) return;
          addDoc(teamCol("players"), { name, orderIndex: players.length, active: true });
          showToast(`Added ${name}`);
          setAddOpen(false);
        }}
      />

      <Dialog
        open={switchConfirm}
        title="Switch team?"
        message="Leave this team on this phone? You'll need the team number to get back in."
        confirmLabel="Switch"
        danger
        onConfirm={() => { clearTeam(); location.reload(); }}
        onCancel={() => setSwitchConfirm(false)}
      />
    </div>
  );
}
