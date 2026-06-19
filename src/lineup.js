import { writeBatch } from "firebase/firestore";
import { db } from "./firebase.js";
import { teamDoc } from "./team.js";

/** Apply a recommended batting order for active players; inactive players stay at the end. */
export async function applyLineupOrder(allPlayers, activeOrderIds) {
  const activeSet = new Set(activeOrderIds);
  const orderedActive = activeOrderIds
    .map((id) => allPlayers.find((p) => p.id === id))
    .filter(Boolean);
  const inactive = allPlayers.filter((p) => !activeSet.has(p.id));
  const newOrder = [...orderedActive, ...inactive];

  const batch = writeBatch(db);
  newOrder.forEach((p, i) => {
    if (p.orderIndex !== i) batch.update(teamDoc("players", p.id), { orderIndex: i });
  });
  await batch.commit();
}

export function orderChanged(currentIds, recommendedIds) {
  if (!recommendedIds?.length || currentIds.length !== recommendedIds.length) return false;
  return currentIds.some((id, i) => id !== recommendedIds[i]);
}
