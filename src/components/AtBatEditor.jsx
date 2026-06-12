import React, { useState } from "react";
import { updateDoc } from "firebase/firestore";
import { teamDoc } from "../team.js";
import FieldDiagram from "./FieldDiagram.jsx";
import { Dialog } from "./Dialog.jsx";
import {
  CONTACT_LABELS,
  OUT_TYPE_LABELS,
  PLACEMENT_RESULTS,
  RESULT_LABELS,
  ZONE_LABELS,
  needsPlacement,
} from "../stats.js";
import { tap } from "../haptics.js";

const RESULT_OPTIONS = ["1B", "2B", "3B", "HR", "BB", "OUT", "ROE", "FC"];
const OUT_TYPES = ["K", "GO", "FO", "PO", "LO", "FC"];

export default function AtBatEditor({ ab, playerName, open, onClose, onSave }) {
  const [draft, setDraft] = useState(ab);

  React.useEffect(() => {
    if (open && ab) setDraft({ ...ab });
  }, [open, ab]);

  if (!open || !ab) return null;

  const inPlacementFlow = needsPlacement(draft?.result);
  const set = (fields) => setDraft((d) => ({ ...d, ...fields }));
  const place = (zone, loc) => set({ zone, loc });

  const save = () => {
    tap(20);
    onSave({
      result: draft.result,
      outType: draft.result === "OUT" ? draft.outType : null,
      zone: draft.zone || null,
      loc: draft.loc || null,
      contact: inPlacementFlow ? draft.contact || "MED" : null,
      rbi: draft.rbi || 0,
      twoOuts: !!draft.twoOuts,
    });
    onClose();
  };

  return (
    <Dialog open title={`Edit — ${playerName}`} confirmLabel="Save" cancelLabel="Cancel" onConfirm={save} onCancel={onClose}>
      <div className="step-label" style={{ marginTop: 0 }}>Result</div>
      <div className="btn-grid" style={{ marginBottom: 10 }}>
        {RESULT_OPTIONS.map((r) => (
          <button
            key={r}
            className={`btn${draft.result === r ? " selected" : ""}`}
            onClick={() => {
              tap();
              set({
                result: r,
                outType: r === "OUT" ? draft.outType : null,
                zone: r === "BB" || r === "OUT" && !draft.outType ? null : draft.zone,
                loc: r === "BB" ? null : draft.loc,
                contact: PLACEMENT_RESULTS.includes(r) ? draft.contact : null,
              });
            }}
          >
            {RESULT_LABELS[r]}
          </button>
        ))}
      </div>

      {draft.result === "OUT" && (
        <>
          <div className="step-label">Out type</div>
          <div className="btn-grid cols3" style={{ marginBottom: 10 }}>
            {OUT_TYPES.map((o) => (
              <button key={o} className={`btn${draft.outType === o ? " selected" : ""}`} onClick={() => { tap(); set({ outType: o, loc: o === "K" ? null : draft.loc, zone: o === "K" ? null : draft.zone }); }}>
                {OUT_TYPE_LABELS[o]}
              </button>
            ))}
          </div>
        </>
      )}

      {(inPlacementFlow || (draft.result === "OUT" && draft.outType && draft.outType !== "K")) && (
        <>
          <div className="step-label">{draft.loc ? "Tap to move pin" : "Tap where it went"}</div>
          <FieldDiagram marker={draft.loc} onZone={place} size={200} />
        </>
      )}

      {inPlacementFlow && draft.loc && (
        <>
          <div className="step-label">Contact</div>
          <div className="btn-grid cols3" style={{ marginBottom: 10 }}>
            {["HARD", "MED", "WEAK"].map((c) => (
              <button key={c} className={`btn${draft.contact === c ? " selected" : ""}`} onClick={() => { tap(); set({ contact: c }); }}>
                {CONTACT_LABELS[c]}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="more-panel" style={{ marginTop: 8 }}>
        <div className="stepper">
          <button onClick={() => set({ rbi: Math.max(0, (draft.rbi || 0) - 1) })}>−</button>
          <span className="val">{draft.rbi || 0}</span>
          <button onClick={() => set({ rbi: Math.min(4, (draft.rbi || 0) + 1) })}>+</button>
          <span className="muted">RBI</span>
        </div>
        <button className={`toggle${draft.twoOuts ? " on" : ""}`} onClick={() => set({ twoOuts: !draft.twoOuts })}>
          2 outs
        </button>
      </div>
    </Dialog>
  );
}

export async function updateAtBat(gameId, abId, fields) {
  await updateDoc(teamDoc("games", gameId, "atBats", abId), fields);
}
