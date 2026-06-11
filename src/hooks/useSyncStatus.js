import { useEffect, useState } from "react";
import { limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { teamCol } from "../team.js";

export function useSyncStatus(enabled) {
  const [status, setStatus] = useState("saved");

  useEffect(() => {
    if (!enabled) return;

    const apply = (hasPending) => {
      if (!navigator.onLine) setStatus("offline");
      else if (hasPending) setStatus("syncing");
      else setStatus("saved");
    };

    const onNet = () => apply(false);
    window.addEventListener("online", onNet);
    window.addEventListener("offline", onNet);

    const q = query(teamCol("games"), orderBy("date", "desc"), limit(1));
    const unsub = onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
      apply(snap.metadata.hasPendingWrites);
    });

    return () => {
      unsub();
      window.removeEventListener("online", onNet);
      window.removeEventListener("offline", onNet);
    };
  }, [enabled]);

  return status;
}
