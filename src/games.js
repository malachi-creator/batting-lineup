import { getDocs, query, writeBatch } from "firebase/firestore";
import { db } from "./firebase.js";
import { teamCol, teamDoc } from "./team.js";

const BATCH_LIMIT = 500;

/** Delete a game and all of its at-bats. */
export async function deleteGameRecord(gameId) {
  const snap = await getDocs(query(teamCol("games", gameId, "atBats")));
  const refs = [
    ...snap.docs.map((d) => teamDoc("games", gameId, "atBats", d.id)),
    teamDoc("games", gameId),
  ];

  for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    refs.slice(i, i + BATCH_LIMIT).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}
