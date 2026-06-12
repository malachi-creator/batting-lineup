import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase.js";
import { BEER_PRESSURE_ID, getTeamId, getTeamName, teamCol } from "./team.js";
import GameTab from "./components/GameTab.jsx";
import StatsTab from "./components/StatsTab.jsx";
import RosterTab from "./components/RosterTab.jsx";
import MeTab from "./components/MeTab.jsx";
import ScheduleTab from "./components/ScheduleTab.jsx";
import TeamGate from "./components/TeamGate.jsx";
import CatchUpTab from "./components/CatchUpTab.jsx";
import { clearCatchUpHash } from "./catchUp.js";
import { parseAppHash, setAppTabHash } from "./nav.js";
import { useSyncStatus } from "./hooks/useSyncStatus.js";
import { tap } from "./haptics.js";
import { buildGameFromSchedule, getAutoStartEnabled, shouldAutoStart } from "./schedule.js";
import { SUMMER_SCHEDULE_2026 } from "./summerSchedule2026.js";

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

const initialRoute = parseAppHash(window.location.hash);

export default function App() {
  const [team, setTeamState] = useState(getTeamId());
  const [tab, setTab] = useState(initialRoute.mode === "main" ? initialRoute.tab : "game");
  const [players, setPlayers] = useState(null);
  const [games, setGames] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [abByGame, setAbByGame] = useState({});
  const [toast, setToast] = useState(null);
  const [installEvt, setInstallEvt] = useState(null);
  const [dbError, setDbError] = useState(null);
  const [catchUp, setCatchUp] = useState(initialRoute.mode === "catch-up" ? initialRoute.catchUp : null);
  const seeded = useRef(false);
  const scheduleSeeded = useRef(false);
  const autoStarted = useRef(false);
  const toastTimer = useRef(null);

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash || hash === "#") setAppTabHash(tab);

    const onHash = () => {
      const route = parseAppHash(window.location.hash);
      if (route.mode === "catch-up") {
        setCatchUp(route.catchUp);
        return;
      }
      setCatchUp(null);
      setTab(route.tab);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigateToTab = (key) => {
    setTab(key);
    setAppTabHash(key);
  };

  // Roster — the founding team's roster is preloaded on first launch
  useEffect(() => {
    if (!team) return;
    const q = query(teamCol("players"), orderBy("orderIndex"));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
      setGames(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, (err) => setDbError(err.code || err.message));
  }, [team]);

  // Season schedule — Beer Pressure's 2026 summer slate is preloaded on first launch
  useEffect(() => {
    if (!team) return;
    const q = query(teamCol("schedule"), orderBy("date", "asc"));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (list.length === 0 && !scheduleSeeded.current && !snap.metadata.fromCache && team === BEER_PRESSURE_ID) {
        scheduleSeeded.current = true;
        const batch = writeBatch(db);
        SUMMER_SCHEDULE_2026.forEach((entry) => {
          batch.set(doc(teamCol("schedule")), {
            date: entry.date,
            time: entry.time,
            opponent: entry.opponent,
            location: entry.location,
            createdAt: serverTimestamp(),
          });
        });
        batch.commit();
        return;
      }
      setSchedule(list);
    }, (err) => setDbError(err.code || err.message));
  }, [team]);

  const activeGame = useMemo(() => (games || []).find((g) => !g.final) || null, [games]);

  // At-bats: live for the active game, fetch-once for finished games
  useEffect(() => {
    if (!activeGame) return;
    const q = query(teamCol("games", activeGame.id, "atBats"), orderBy("seq"));
    return onSnapshot(q, (snap) => {
      const abs = snap.docs.map((d) => ({ id: d.id, gameId: activeGame.id, ...d.data() }));
      setAbByGame((prev) => ({ ...prev, [activeGame.id]: abs }));
    });
  }, [activeGame?.id]);

  useEffect(() => {
    (games || [])
      .filter((g) => g.final)
      .forEach((g) => {
        if (abByGame[g.id]) return;
        getDocs(query(teamCol("games", g.id, "atBats"), orderBy("seq"))).then((snap) => {
          const abs = snap.docs.map((d) => ({ id: d.id, gameId: g.id, ...d.data() }));
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

  // Auto-start today's scheduled game when the app opens
  useEffect(() => {
    if (!players || !games || !schedule || autoStarted.current) return;
    const entry = shouldAutoStart({
      schedule,
      games,
      activeGame,
      autoStartEnabled: getAutoStartEnabled(),
    });
    if (!entry) return;
    autoStarted.current = true;
    const present = players.filter((p) => p.active !== false).map((p) => p.id);
    addDoc(teamCol("games"), {
      ...buildGameFromSchedule(entry, present),
      createdAt: serverTimestamp(),
    }).then(() => {
      navigateToTab("game");
      showToast(`Game started vs ${entry.opponent || "opponent"}`);
    });
  }, [players, games, schedule, activeGame]);

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

  if (!players || !games || !schedule) {
    return (
      <div className="screen" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span className="spin" /> Loading…
      </div>
    );
  }

  const exitCatchUp = () => {
    setCatchUp(null);
    setTab("game");
    clearCatchUpHash("game");
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
          <GameTab
            players={players}
            games={games}
            schedule={schedule}
            activeGame={activeGame}
            abByGame={abByGame}
            showToast={showToast}
          />
        )}
        {tab === "schedule" && (
          <ScheduleTab schedule={schedule} games={games} showToast={showToast} />
        )}
        {tab === "stats" && (
          <StatsTab
            players={players}
            games={games}
            allAtBats={allAtBats}
            showToast={showToast}
            hasActiveGame={!!activeGame}
            onGoToGame={() => navigateToTab("game")}
          />
        )}
        {tab === "me" && (
          <MeTab players={players} games={games} allAtBats={allAtBats} showToast={showToast} />
        )}
        {tab === "team" && <RosterTab players={players} showToast={showToast} />}
      </main>

      <nav className="tabbar">
        {[
          ["game", "Game"],
          ["schedule", "Schedule"],
          ["stats", "Stats"],
          ["me", "Me"],
          ["team", "Team"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => {
              tap();
              navigateToTab(key);
            }}
          >
            {label}
            {key === "game" && activeGame && <span className="tab-live" aria-hidden="true" />}
          </button>
        ))}
      </nav>

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
