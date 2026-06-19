import React, { useEffect, useState } from "react";
import { getCachedAnalysis, runAnalysis } from "../coach.js";
import { tap } from "../haptics.js";
import { Dialog } from "./Dialog.jsx";

export default function CoachZBlock({
  cacheKey,
  abCount,
  disabled,
  endpoint,
  runLabel,
  loadingLabel,
  getPayload,
  showToast,
  applyLabel,
  canApply,
  onApply,
}) {
  const [cached, setCached] = useState(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [confirmApply, setConfirmApply] = useState(false);

  useEffect(() => {
    let live = true;
    getCachedAnalysis(cacheKey).then((c) => live && setCached(c));
    return () => { live = false; };
  }, [cacheKey]);

  const upToDate = cached && cached.lastAnalyzedAbCount === abCount;
  const showApply = cached && canApply?.(cached);

  const analyze = async () => {
    tap(20);
    setLoading(true);
    try {
      const rec = await runAnalysis(cacheKey, endpoint, getPayload(), abCount);
      setCached(rec);
    } catch (e) {
      showToast(e.message);
    } finally {
      setLoading(false);
    }
  };

  const apply = async () => {
    setConfirmApply(false);
    setApplying(true);
    try {
      await onApply(cached);
    } catch (e) {
      showToast(e.message || "Could not update lineup");
    } finally {
      setApplying(false);
    }
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn primary" style={{ flex: 1 }} onClick={analyze} disabled={loading || disabled}>
          {loading ? (
            <><span className="spin" style={{ borderTopColor: "#04101f" }} /> {loadingLabel}</>
          ) : (
            runLabel
          )}
        </button>
        {cached && (
          <button className="btn small" style={{ padding: "0 14px" }} onClick={analyze} disabled={loading || disabled} aria-label="Refresh analysis">
            ↻
          </button>
        )}
      </div>
      {cached && (
        <div className="coach-box">
          <span className="tag">Coach Z {upToDate ? "· up to date" : "· from earlier at-bats"}</span>
          {cached.text}
        </div>
      )}
      {showApply && (
        <button
          className="btn primary"
          style={{ width: "100%", marginTop: 8 }}
          disabled={applying}
          onClick={() => { tap(); setConfirmApply(true); }}
        >
          {applying ? "Updating lineup…" : applyLabel}
        </button>
      )}
      <Dialog
        open={confirmApply}
        title="Apply Coach Z lineup?"
        message="This updates your batting order on the roster. You can still drag to reorder afterward."
        confirmLabel="Apply lineup"
        onConfirm={apply}
        onCancel={() => setConfirmApply(false)}
      />
    </div>
  );
}
