import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import {
  BookOpen,
  History,
  LogIn,
  LogOut,
  Map as MapIcon,
  Play,
  RotateCcw,
  Send,
  Timer,
  TrainFront,
  Trash2,
  Trophy,
  Undo2,
} from "lucide-react";
import { api } from "./api";
import "./App.css";

const AuthContext = createContext(null);

function useAuth() {
  return useContext(AuthContext);
}

function App() {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    api
      .getCurrentUser()
      .then((payload) => setUser(payload.user))
      .finally(() => setCheckingSession(false));
  }, []);

  const authValue = useMemo(
    () => ({
      user,
      login: async (username, password) => {
        const payload = await api.login(username, password);
        setUser(payload.user);
      },
      logout: async () => {
        await api.logout();
        setUser(null);
      },
    }),
    [user],
  );

  if (checkingSession) {
    return <PageShell status="Checking session..." />;
  }

  return (
    <AuthContext.Provider value={authValue}>
      <PageShell>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/play"
            element={
              <ProtectedRoute>
                <PlayPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ranking"
            element={
              <ProtectedRoute>
                <RankingPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/history"
            element={
              <ProtectedRoute>
                <HistoryPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </PageShell>
    </AuthContext.Provider>
  );
}

function PageShell({ children, status }) {
  const auth = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await auth.logout();
    navigate("/");
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/">
          <TrainFront size={24} aria-hidden="true" />
          Last Race
        </Link>
        <nav className="nav-links" aria-label="Main navigation">
          <Link to="/">
            <BookOpen size={17} aria-hidden="true" />
            Instructions
          </Link>
          {auth?.user && (
            <Link to="/play">
              <Play size={17} aria-hidden="true" />
              Play
            </Link>
          )}
          {auth?.user && (
            <Link to="/ranking">
              <Trophy size={17} aria-hidden="true" />
              Ranking
            </Link>
          )}
          {auth?.user && (
            <Link to="/history">
              <History size={17} aria-hidden="true" />
              History
            </Link>
          )}
        </nav>
        <div className="session-area">
          {auth?.user ? (
            <>
              <span>{auth.user.displayName}</span>
              <button type="button" className="ghost-button" onClick={handleLogout}>
                <LogOut size={17} aria-hidden="true" />
                Logout
              </button>
            </>
          ) : (
            <Link className="primary-button" to="/login">
              <LogIn size={17} aria-hidden="true" />
              Login
            </Link>
          )}
        </div>
      </header>
      {status ? <main className="page narrow">{status}</main> : children}
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" replace />;
}

function CharacterScene({ compact = false }) {
  return (
    <div className={compact ? "character-scene compact" : "character-scene"} aria-hidden="true">
      <div className="track-line" />
      <div className="spark spark-one" />
      <div className="spark spark-two" />
      <div className="train-character">
        <div className="train-window left" />
        <div className="train-window right" />
        <div className="train-smile" />
        <div className="train-light left" />
        <div className="train-light right" />
      </div>
      <div className="coin-character">
        <span />
      </div>
      <div className="signal-character">
        <span />
      </div>
    </div>
  );
}

function HomePage() {
  const { user } = useAuth();
  const [instructions, setInstructions] = useState(null);

  useEffect(() => {
    api.getInstructions().then(setInstructions);
  }, []);

  return (
    <main className="page home-layout">
      <section className="intro">
        <CharacterScene />
        <p className="eyebrow">Underground strategy game</p>
        <h1>Plan the route before the clock runs out.</h1>
        <p className="lead">
          Study the fictional metro network, reconstruct the hidden connections from the segment
          list, and reach the destination with as many coins as possible.
        </p>
        <div className="actions">
          {user ? (
            <Link className="primary-button" to="/play">
              <Play size={18} aria-hidden="true" />
              Start playing
            </Link>
          ) : (
            <Link className="primary-button" to="/login">
              <LogIn size={18} aria-hidden="true" />
              Login to play
            </Link>
          )}
        </div>
      </section>
      <section className="rules-panel" aria-label="Game rules">
        <h2>{instructions?.title ?? "Last Race"}</h2>
        <ol>
          {(instructions?.rules ?? []).map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ol>
      </section>
    </main>
  );
}

function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("alice");
  const [password, setPassword] = useState("password");
  const [error, setError] = useState("");

  if (user) {
    return <Navigate to="/play" replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    try {
      await login(username, password);
      navigate("/play");
    } catch (loginError) {
      setError(loginError.message);
    }
  }

  return (
    <main className="page narrow">
      <h1>Login</h1>
      <CharacterScene compact />
      <form className="form-panel" onSubmit={handleSubmit}>
        <label>
          Username
          <input value={username} onChange={(event) => setUsername(event.target.value)} />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && <p className="error-message">{error}</p>}
        <button type="submit" className="primary-button">
          <LogIn size={18} aria-hidden="true" />
          Login
        </button>
      </form>
    </main>
  );
}

function PlayPage() {
  const [network, setNetwork] = useState(null);
  const [gameData, setGameData] = useState(null);
  const [phase, setPhase] = useState("setup");
  const [selectedSegments, setSelectedSegments] = useState([]);
  const [secondsLeft, setSecondsLeft] = useState(90);
  const [result, setResult] = useState(null);
  const [visibleStepIndex, setVisibleStepIndex] = useState(0);
  const [error, setError] = useState("");
  const submittingRef = useRef(false);

  const submitRoute = useCallback(async () => {
    if (!gameData || submittingRef.current) {
      return;
    }

    submittingRef.current = true;
    setError("");

    try {
      const payload = await api.submitRoute(
        gameData.game.id,
        selectedSegments.map((segment) => segment.id),
      );
      setResult(payload);
      setVisibleStepIndex(payload.valid ? 1 : 0);
      setPhase(payload.valid ? "execution" : "result");
    } catch (submitError) {
      setError(submitError.message);
      submittingRef.current = false;
    }
  }, [gameData, selectedSegments]);

  useEffect(() => {
    api.getNetwork().then(setNetwork).catch((networkError) => setError(networkError.message));
  }, []);

  useEffect(() => {
    if (phase !== "planning") {
      return undefined;
    }

    const timerId = setInterval(() => {
      setSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);

    return () => clearInterval(timerId);
  }, [phase]);

  useEffect(() => {
    if (phase === "planning" && secondsLeft === 0) {
      const timeoutId = setTimeout(() => submitRoute(), 0);
      return () => clearTimeout(timeoutId);
    }

    return undefined;
  }, [phase, secondsLeft, submitRoute]);

  const stationById = useMemo(() => {
    const stations = gameData?.stations ?? network?.stations ?? [];
    return new Map(stations.map((station) => [station.id, station]));
  }, [gameData, network]);

  const currentStationId = useMemo(() => {
    if (!gameData) {
      return null;
    }

    return selectedSegments.reduce((current, segment) => {
      if (segment.stationAId === current) {
        return segment.stationBId;
      }
      if (segment.stationBId === current) {
        return segment.stationAId;
      }
      return current;
    }, gameData.game.startStation.id);
  }, [gameData, selectedSegments]);

  async function startGame() {
    setError("");
    const payload = await api.startGame();
    setGameData(payload);
    setSelectedSegments([]);
    setSecondsLeft(payload.planningSeconds);
    setResult(null);
    setVisibleStepIndex(0);
    submittingRef.current = false;
    setPhase("planning");
  }

  function addSegment(segment) {
    if (phase !== "planning") {
      return;
    }

    setSelectedSegments((current) => [...current, segment]);
  }

  function showNextStep() {
    if (!result) {
      return;
    }

    if (visibleStepIndex >= result.steps.length) {
      setPhase("result");
      return;
    }

    setVisibleStepIndex((current) => current + 1);
  }

  if (!network) {
    return <main className="page">Loading network...</main>;
  }

  const planningSegments = gameData?.segments ?? [];
  const startStationId = gameData?.game.startStation.id;
  const destinationStationId = gameData?.game.destinationStation.id;

  return (
    <main className="page play-grid">
      <section className="map-panel">
        {phase !== "setup" && (
          <div className="map-mascot" aria-hidden="true">
            <div className="runner-dot" />
            <div className="route-pulse one" />
            <div className="route-pulse two" />
            <div className="route-pulse three" />
          </div>
        )}
        <div className="section-heading">
          <div>
            <p className="eyebrow">{phase}</p>
            <h1>
              <MapIcon size={38} aria-hidden="true" />
              Metro network
            </h1>
          </div>
          {phase === "planning" && (
            <span className="timer">
              <Timer size={18} aria-hidden="true" />
              {secondsLeft}s
            </span>
          )}
        </div>
        <NetworkMap
          network={phase === "setup" ? network : { ...gameData, lines: network.lines }}
          showLines={phase === "setup"}
          selectedSegments={selectedSegments}
          startStationId={startStationId}
          destinationStationId={destinationStationId}
        />
      </section>

      <section className="side-panel">
        {phase === "setup" && <CharacterScene compact />}
        {phase === "setup" && (
          <>
            <h2>Setup</h2>
            <p>
              Study the complete map. When you start, the line connections disappear and a random
              start and destination are assigned by the server.
            </p>
            <button type="button" className="primary-button" onClick={startGame}>
              <Play size={18} aria-hidden="true" />
              Ready to play
            </button>
          </>
        )}

        {phase === "planning" && gameData && (
          <>
            <h2>Planning</h2>
            <div className="mission">
              <span>From {gameData.game.startStation.name}</span>
              <span>To {gameData.game.destinationStation.name}</span>
              <span>Current {stationById.get(currentStationId)?.name}</span>
            </div>
            <RouteBuilder
              segments={planningSegments}
              currentStationId={currentStationId}
              selectedSegments={selectedSegments}
              onAddSegment={addSegment}
              onUndo={() => setSelectedSegments((current) => current.slice(0, -1))}
              onClear={() => setSelectedSegments([])}
              onSubmit={submitRoute}
              canSubmit={selectedSegments.length > 0}
            />
          </>
        )}

        {phase === "execution" && result && (
          <ExecutionView
            result={result}
            stationById={stationById}
            visibleStepIndex={visibleStepIndex}
            onNext={showNextStep}
          />
        )}

        {phase === "result" && result && (
          <ResultView
            result={result}
            onNewGame={() => {
              setPhase("setup");
              setGameData(null);
              setResult(null);
              setSelectedSegments([]);
            }}
          />
        )}

        {error && <p className="error-message">{error}</p>}
      </section>
    </main>
  );
}

function NetworkMap({
  network,
  showLines,
  selectedSegments = [],
  startStationId,
  destinationStationId,
}) {
  const stations = network?.stations ?? [];
  const lines = network?.lines ?? [];
  const stationById = new Map(stations.map((station) => [station.id, station]));

  return (
    <svg className="network-map" viewBox="0 0 100 100" role="img" aria-label="Metro network map">
      {showLines &&
        lines.map((line) => (
          <polyline
            key={line.id}
            points={line.stations.map((station) => `${station.x},${station.y}`).join(" ")}
            fill="none"
            stroke={line.color}
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

      {selectedSegments.map((segment, index) => {
        const first = stationById.get(segment.stationAId);
        const second = stationById.get(segment.stationBId);

        if (!first || !second) {
          return null;
        }

        return (
          <line
            key={`${segment.id}-${index}`}
            x1={first.x}
            y1={first.y}
            x2={second.x}
            y2={second.y}
            className="selected-route-line"
          />
        );
      })}

      {stations.map((station) => {
        const isStart = station.id === startStationId;
        const isDestination = station.id === destinationStationId;
        const labelY = station.y > 82 ? station.y - 4 : station.y + 6;

        return (
          <g key={station.id} className="station-node">
            <circle
              cx={station.x}
              cy={station.y}
              r={station.isInterchange ? 2.4 : 1.9}
              className={isStart ? "start-station" : isDestination ? "destination-station" : ""}
            />
            <text x={station.x + 2.8} y={labelY}>
              {station.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function RouteBuilder({
  segments,
  currentStationId,
  selectedSegments,
  onAddSegment,
  onUndo,
  onClear,
  onSubmit,
  canSubmit,
}) {
  const selectableSegments = segments
    .map((segment) => ({
      ...segment,
      canSelect: segment.stationAId === currentStationId || segment.stationBId === currentStationId,
    }))
    .sort((first, second) => {
      if (first.canSelect !== second.canSelect) {
        return first.canSelect ? -1 : 1;
      }

      return `${first.stationAName}-${first.stationBName}`.localeCompare(
        `${second.stationAName}-${second.stationBName}`,
      );
    });

  return (
    <>
      <div className="builder-actions">
        <button type="button" className="ghost-button" onClick={onUndo} disabled={selectedSegments.length === 0}>
          <Undo2 size={17} aria-hidden="true" />
          Undo
        </button>
        <button type="button" className="ghost-button" onClick={onClear} disabled={selectedSegments.length === 0}>
          <Trash2 size={17} aria-hidden="true" />
          Clear
        </button>
        <button type="button" className="primary-button" onClick={onSubmit} disabled={!canSubmit}>
          <Send size={17} aria-hidden="true" />
          Submit route
        </button>
      </div>
      <ol className="selected-route">
        {selectedSegments.length === 0 ? (
          <li>No segment selected yet.</li>
        ) : (
          selectedSegments.map((segment, index) => (
            <li key={`${segment.id}-${index}`}>
              {segment.stationAName} - {segment.stationBName}
            </li>
          ))
        )}
      </ol>
      <div className="segment-list" aria-label="Available segments">
        {selectableSegments.map((segment) => (
          <button
            type="button"
            key={segment.id}
            disabled={!segment.canSelect}
            onClick={() => onAddSegment(segment)}
          >
            <span>
              {segment.stationAName} - {segment.stationBName}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

function ExecutionView({ result, stationById, visibleStepIndex, onNext }) {
  const visibleSteps = result.steps.slice(0, visibleStepIndex);
  const complete = visibleStepIndex >= result.steps.length;

  return (
    <>
      <h2>Execution</h2>
      <p>Events are selected by the server and applied one step at a time.</p>
      <ol className="execution-list">
        {visibleSteps.map((step) => (
          <li key={step.order}>
            <strong>
              {stationById.get(step.fromStationId)?.name} to {stationById.get(step.toStationId)?.name}
            </strong>
            <span>
              {step.event.description} ({step.event.effect > 0 ? "+" : ""}
              {step.event.effect})
            </span>
            <em>{step.coinsAfterStep} coins</em>
          </li>
        ))}
      </ol>
      <button type="button" className="primary-button" onClick={onNext}>
        <Play size={17} aria-hidden="true" />
        {complete ? "Show result" : "Next step"}
      </button>
    </>
  );
}

function ResultView({ result, onNewGame }) {
  return (
    <>
      <h2>Result</h2>
      {result.valid ? (
        <p>Your route was valid. Final score: {result.finalScore} coins.</p>
      ) : (
        <p>
          Invalid route: {result.reason} Final score: {result.finalScore} coins.
        </p>
      )}
      <button type="button" className="primary-button" onClick={onNewGame}>
        <RotateCcw size={18} aria-hidden="true" />
        New game
      </button>
      <Link className="ghost-link" to="/ranking">
        <Trophy size={17} aria-hidden="true" />
        View ranking
      </Link>
    </>
  );
}

function RankingPage() {
  const [ranking, setRanking] = useState([]);

  useEffect(() => {
    api.getRanking().then((payload) => setRanking(payload.ranking));
  }, []);

  return (
    <main className="page narrow">
      <h1>
        <Trophy size={38} aria-hidden="true" />
        General ranking
      </h1>
      <table className="data-table">
        <thead>
          <tr>
            <th>Player</th>
            <th>Best score</th>
            <th>Completed games</th>
          </tr>
        </thead>
        <tbody>
          {ranking.map((entry) => (
            <tr key={entry.username}>
              <td>{entry.display_name}</td>
              <td>{entry.best_score}</td>
              <td>{entry.completed_games}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

function HistoryPage() {
  const [games, setGames] = useState([]);

  useEffect(() => {
    api.getHistory().then((payload) => setGames(payload.games));
  }, []);

  return (
    <main className="page narrow">
      <h1>
        <History size={38} aria-hidden="true" />
        My games
      </h1>
      <table className="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Route</th>
            <th>Status</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          {games.map((game) => (
            <tr key={game.id}>
              <td>{new Date(game.created_at).toLocaleString()}</td>
              <td>
                {game.start_station} to {game.destination_station}
              </td>
              <td>{game.status}</td>
              <td>{game.final_score ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

export default App;
