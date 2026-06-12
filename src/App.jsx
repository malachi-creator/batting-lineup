import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase.js";
import { BEER_PRESSURE_ID, getTeamId, getTeamName, teamCol } from "./team.js";
import GameTab from "./components/GameTab.jsx";
import StatsTab from "./components/StatsTab.jsx";
import RosterTab from "./components/RosterTab.jsx";
import MeTab from "./components/MeTab.jsx";
import TeamGate from "./components/TeamGate.jsx";
import CatchUpTab from "./components/CatchUpTab.jsx";
import { parseCatchUpHash, clearCatchUpHash } from "./catchUp.js";
import { useSyncStatus } from "./hooks/useSyncStatus.js";
import { tap } from "./haptics.js";

const ROSTER = [
  "Malachi",
  "Eric",
  "Todd",
  "Logan",
  "Josh",
  "Nick",
  "Darren",
  "Asa",
  "Seth",
  "Kyser",
  "Todd 2",
  "Sam",
  "Bo",
  "Austin",
  "Brian",
];

export default function App() {
  const [team, setTeamState] = useState(getTeamId());
  const [tab, setTab] = useState("game");
  const [players, setPlayers] = useState(null);
  const [games, setGames] = useState(null);
  const [abByGame, setAbByGame] = useState({});
  const [toast, setToast] = useState(null);
  const [installEvt, setInstallEvt] = useState(null);
  const [dbError, setDbError] = useState(null);
  const [catchUp, setCatchUp] = useState(() => parseCatchUpHash(window.location.hash));
  const seeded = useRef(false);
  const toastTimer = useRef(null);

  useEffect(() => {
    const onHash = () => setCatchUp(parseCatchUpHash(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Roster — the founding team's roster is preloaded on first launch
  useEffect(() => {
    if (!team) return;
    const q = query(teamCol("players"), orderBy("orderIndex"));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      if (list.length === 0 && !seeded.current && !snap.metadata.fromCache && team === BEER_PRESSURE_ID) {
        seeded.current = true;
        const batch = writeBatch(db);
        ROSTER.forEach((name, i) => {
          batch.set(doc(teamCol("players")), { name, orderIndex: i, active: true });
        });
        batch.commit();
        return;
      }
      setPlayers(list);
    }, (err) => setDbError(err.code || err.message));
  }, [team]);

  // Games
  useEffect(() => {
    if (!team) return;
    const q = query(teamCol("games"), orderBy("date", "desc"));
    return onSnapshot(q, (snap) => {
      setGames(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    }, (err) => setDbError(err.code || err.message));
  }, [team]);

  const activeGame = useMemo(() => (games || []).find((g) => !g.final) || null, [games]);

  // At-bats: live for the active game, fetch-once for finished games
  useEffect(() => {
    if (!activeGame) return;
    const q = query(teamCol("games", activeGame.id, "atBats"), orderBy("seq"));
    return onSnapshot(q, (snap) => {
      const abs = snap.docs.map((d) => ({ gameId: activeGame.id, ...d.data(), id: d.id }));
      setAbByGame((prev) => ({ ...prev, [activeGame.id]: abs }));
    });
  }, [activeGame?.id]);

  useEffect(() => {
    (games || [])
      .filter((g) => g.final)
      .forEach((g) => {
        if (abByGame[g.id]) return;
        getDocs(query(teamCol("games", g.id, "atBats"), orderBy("seq"))).then((snap) => {
          const abs = snap.docs.map((d) => ({ gameId: g.id, ...d.data(), id: d.id }));
          setAbByGame((prev) => ({ ...prev, [g.id]: abs }));
        });
      });
  }, [games]);

  // Install prompt
  useEffect(() => {
    const h = (e) => {
      e.preventDefault();
      setInstallEvt(e);
    };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);

  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  };

  const allAtBats = useMemo(() => Object.values(abByGame).flat(), [abByGame]);
  const syncStatus = useSyncStatus(!!team);

  const syncLabel = { saved: "Saved", syncing: "Syncing…", offline: "Offline" }[syncStatus];
  const syncClass = syncStatus;

  if (!team) {
    return <TeamGate onReady={() => setTeamState(getTeamId())} />;
  }

  if (dbError) {
    return (
      <div className="screen" style={{ paddingTop: 60 }}>
        <div className="card" style={{ borderColor: "var(--red)" }}>
          <h3 style={{ color: "var(--red)" }}>Database not reachable</h3>
          <p style={{ fontSize: 14, lineHeight: 1.5 }}>
            Firestore said: <b>{dbError}</b>
          </p>
          <p className="muted" style={{ lineHeight: 1.5 }}>
            If this says permission-denied, deploy Firestore rules:{" "}
            <code style={{ fontSize: 13 }}>firebase deploy --only firestore:rules</code> (see README).
          </p>
        </div>
      </div>
    );
  }

  if (!players || !games) {
    return (
      <div className="screen" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span className="spin" /> Loading…
      </div>
    );
  }

  const exitCatchUp = () => {
    clearCatchUpHash();
    setCatchUp(null);
  };

  if (catchUp) {
    return (
      <>
        <header className="app-header">
          <div className="brand">
            {getTeamName() || "Team"} <span>Batting</span>
          </div>
          <div className="header-meta">
            <span className={`sync-badge ${syncClass}`}>{syncLabel}</span>
          </div>
        </header>
        <main className="screen">
          <CatchUpTab
            gameId={catchUp.gameId}
            playerId={catchUp.playerId}
            players={players}
            games={games}
            showToast={showToast}
            onDone={exitCatchUp}
          />
        </main>
        {toast && <div className="toast">{toast}</div>}
      </>
    );
  }

  return (
    <>
      <header className="app-header">
        <div className="brand">
          {getTeamName() || "Team"} <span>Batting</span>
        </div>
        <div className="header-meta">
          <span className={`sync-badge ${syncClass}`}>{syncLabel}</span>
          {activeGame && tab !== "game" && (
            <span className="muted" style={{ color: "var(--green)" }}>● Live</span>
          )}
        </div>
      </header>

      <main className="screen">
        {installEvt && (
          <div className="install-banner">
            <div className="grow">Add to your home screen for dugout use.</div>
            <button
              className="btn small primary"
              style={{ padding: "0 16px" }}
              onClick={async () => {
                installEvt.prompt();
                await installEvt.userChoice;
                setInstallEvt(null);
              }}
            >
              Install
            </button>
          </div>
        )}

        {tab === "game" && (
          <GameTab players={players} games={games} activeGame={activeGame} abByGame={abByGame} showToast={showToast} />
        )}
        {tab === "stats" && (
          <StatsTab players={players} games={games} allAtBats={allAtBats} showToast={showToast} hasActiveGame={!!activeGame} />
        )}
        {tab === "me" && (
          <MeTab players={players} games={games} allAtBats={allAtBats} showToast={showToast} />
        )}
        {tab === "roster" && <RosterTab players={players} showToast={showToast} />}
      </main>

      <nav className="tabbar">
        {[
          ["game", "Game"],
          ["stats", "Stats"],
          ["me", "Me"],
          ["roster", "Roster"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => {
              tap();
              setTab(key);
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
