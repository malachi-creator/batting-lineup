import React, { useState } from "react";
import { addDoc, collection, doc, getDocs, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { db } from "../firebase.js";
import { BEER_PRESSURE_CODE, BEER_PRESSURE_ID, setTeam } from "../team.js";
import { tap } from "../haptics.js";

export default function TeamGate({ onReady }) {
  const [code, setCode] = useState("");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null); // {name, code}
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const join = async () => {
    const c = code.trim();
    if (!c) return;
    tap(20);
    setBusy(true);
    setError(null);
    try {
      const snap = await getDocs(query(collection(db, "teams"), where("code", "==", c)));
      if (!snap.empty) {
        const d = snap.docs[0];
        setTeam(d.id, d.data().name || "Team", c);
        onReady();
        return;
      }
      if (c === BEER_PRESSURE_CODE) {
        // First launch ever: bind the founding team to its original data path
        await setDoc(
          doc(db, "teams", BEER_PRESSURE_ID),
          { name: "Beer Pressure", code: BEER_PRESSURE_CODE, createdAt: serverTimestamp() },
          { merge: true }
        );
        setTeam(BEER_PRESSURE_ID, "Beer Pressure", c);
        onReady();
        return;
      }
      setError("No team with that number. Check with whoever runs your stats.");
    } catch (e) {
      setError(e.code === "permission-denied"
        ? "Database rules not set up yet — see FIREBASE_RULES.txt."
        : `Couldn't reach the database (${e.code || e.message}).`);
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    tap(20);
    setBusy(true);
    setError(null);
    try {
      let teamCode;
      // 4-digit code, retry on collision
      for (let i = 0; i < 10; i++) {
        teamCode = String(1000 + Math.floor(Math.random() * 9000));
        const clash = await getDocs(query(collection(db, "teams"), where("code", "==", teamCode)));
        if (clash.empty) break;
      }
      const ref = await addDoc(collection(db, "teams"), {
        name,
        code: teamCode,
        createdAt: serverTimestamp(),
      });
      setTeam(ref.id, name, teamCode);
      setCreated({ name, code: teamCode });
    } catch (e) {
      setError(`Couldn't create the team (${e.code || e.message}).`);
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <div className="screen" style={{ paddingTop: 60 }}>
        <h2 style={{ fontSize: 28, textAlign: "center" }}>{created.name}</h2>
        <div className="card" style={{ textAlign: "center", marginTop: 16 }}>
          <h3>Your team number</h3>
          <div style={{ fontFamily: "var(--font-cond)", fontSize: 64, fontWeight: 800, color: "var(--blue)", letterSpacing: "0.1em" }}>
            {created.code}
          </div>
          <p className="muted">
            Anyone on the team enters this number to see your stats. Write it down — it's the only key.
          </p>
        </div>
        <button className="btn primary" style={{ width: "100%" }} onClick={() => { tap(); onReady(); }}>
          Let's go
        </button>
      </div>
    );
  }

  return (
    <div className="screen" style={{ paddingTop: 48 }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <img src="/icon-192.png" width="72" height="72" alt="" style={{ borderRadius: 18 }} />
        <h1 style={{ fontSize: 30, marginTop: 10 }}>
          Pezley <span style={{ color: "var(--blue)" }}>Batting Tracker</span>
        </h1>
      </div>

      <div className="card">
        <h3>Join your team</h3>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="Team number"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && join()}
            style={{ fontSize: 22, textAlign: "center", fontFamily: "var(--font-cond)", letterSpacing: "0.15em" }}
          />
          <button className="btn primary" style={{ minWidth: 110 }} onClick={join} disabled={busy || !code.trim()}>
            {busy ? <span className="spin" style={{ borderTopColor: "#04101f" }} /> : "Enter"}
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Start a new team</h3>
        {!creating ? (
          <button className="btn small" style={{ width: "100%" }} onClick={() => setCreating(true)}>
            New team
          </button>
        ) : (
          <div style={{ display: "flex", gap: 10 }}>
            <input
              placeholder="Team name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
            />
            <button className="btn primary" style={{ minWidth: 110 }} onClick={create} disabled={busy || !newName.trim()}>
              Create
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="card" style={{ borderColor: "var(--red)" }}>
          <p style={{ margin: 0, fontSize: 14 }}>{error}</p>
        </div>
      )}
    </div>
  );
}
