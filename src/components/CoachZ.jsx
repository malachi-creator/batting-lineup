import React, { useEffect, useState } from "react";
import { getCachedAnalysis, runAnalysis } from "../coach.js";
import { tap } from "../haptics.js";

export default function CoachZBlock({ cacheKey, abCount, disabled, endpoint, runLabel, loadingLabel, getPayload, showToast }) {
  const [cached, setCached] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let live = true;
    getCachedAnalysis(cacheKey).then((c) => live && setCached(c));
    return () => { live = false; };
  }, [cacheKey]);

  const upToDate = cached && cached.lastAnalyzedAbCount === abCount;

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
    </div>
  );
}
