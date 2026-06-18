import bcrypt from "bcrypt";
import cors from "cors";
import express from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { all, db, get, run } from "./db.js";
import {
  buildAdjacency,
  buildSegments,
  findCandidateDestinations,
  validateRoute,
} from "./game_logic.js";

const app = express();
const port = 3001;
const allowedOriginPattern = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;
const initialCoins = 20;
const minimumDistance = 3;
const planningSeconds = 90;
const planningGraceSeconds = 3;

app.use(express.json());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOriginPattern.test(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Not allowed by CORS."));
    },
    credentials: true,
  }),
);
app.use(
  session({
    secret: process.env.SESSION_SECRET ?? "last-race-development-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
    },
  }),
);
app.use(passport.initialize());
app.use(passport.session());

passport.use(
  new LocalStrategy(async (username, password, done) => {
    try {
      const user = await get(db, "SELECT * FROM users WHERE username = ?", [username]);

      if (!user) {
        return done(null, false, { message: "Invalid username or password." });
      }

      const passwordMatches = await bcrypt.compare(password, user.password_hash);

      if (!passwordMatches) {
        return done(null, false, { message: "Invalid username or password." });
      }

      return done(null, toPublicUser(user));
    } catch (error) {
      return done(error);
    }
  }),
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await get(db, "SELECT id, username, display_name FROM users WHERE id = ?", [id]);
    done(null, user ?? false);
  } catch (error) {
    done(error);
  }
});

function toPublicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName ?? user.display_name,
  };
}

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    next();
    return;
  }

  res.status(401).json({ error: "Authentication required." });
}

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

async function loadNetwork() {
  const stations = await all(db, "SELECT id, name, x, y FROM stations ORDER BY name");
  const lineRows = await all(db, "SELECT id, name, color FROM metro_lines ORDER BY id");
  const lineStationRows = await all(
    db,
    `SELECT
      ls.line_id,
      ls.position,
      s.id AS station_id,
      s.name AS station_name,
      s.x,
      s.y
    FROM line_stations ls
    JOIN stations s ON s.id = ls.station_id
    ORDER BY ls.line_id, ls.position`,
  );

  const lines = lineRows.map((line) => ({
    id: line.id,
    name: line.name,
    color: line.color,
    stations: lineStationRows
      .filter((row) => row.line_id === line.id)
      .map((row) => ({
        id: row.station_id,
        name: row.station_name,
        x: row.x,
        y: row.y,
        position: row.position,
      })),
  }));

  const segments = buildSegments(lines);
  const interchangeRows = await all(
    db,
    `SELECT station_id
    FROM line_stations
    GROUP BY station_id
    HAVING COUNT(*) > 1`,
  );
  const interchangeStationIds = new Set(interchangeRows.map((row) => row.station_id));

  return { stations, lines, segments, interchangeStationIds };
}

function selectRandomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function isPlanningDeadlineExpired(game) {
  const createdAt = Date.parse(game.created_at);

  if (!Number.isFinite(createdAt)) {
    return false;
  }

  return Date.now() > createdAt + (planningSeconds + planningGraceSeconds) * 1000;
}

function toPublicSegment(segment) {
  const { lineIds, lineNames, ...publicSegment } = segment;
  return publicSegment;
}

app.get("/", (req, res) => {
  res.json({ message: "Last Race API server is running." });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/instructions", (req, res) => {
  res.json({
    title: "Last Race",
    rules: [
      "Log in to view the underground network and play.",
      "Each game starts with 20 coins.",
      "During setup, study the complete map.",
      "During planning, build a route from the assigned start to destination using the segment list.",
      "The server validates the route and applies one random event to each travelled segment.",
      "Invalid or incomplete routes score zero.",
      "Your ranking score is your best completed game.",
    ],
  });
});

app.post("/api/sessions", (req, res, next) => {
  passport.authenticate("local", (error, user, info) => {
    if (error) {
      next(error);
      return;
    }

    if (!user) {
      res.status(401).json({ error: info?.message ?? "Invalid username or password." });
      return;
    }

    req.login(user, (loginError) => {
      if (loginError) {
        next(loginError);
        return;
      }
      res.status(201).json({ user });
    });
  })(req, res, next);
});

app.get("/api/sessions/current", (req, res) => {
  res.json({ user: req.user ? toPublicUser(req.user) : null });
});

app.delete("/api/sessions/current", (req, res, next) => {
  req.logout((error) => {
    if (error) {
      next(error);
      return;
    }

    req.session.destroy((destroyError) => {
      if (destroyError) {
        next(destroyError);
        return;
      }
      res.status(204).end();
    });
  });
});

app.get(
  "/api/network",
  ensureAuthenticated,
  asyncHandler(async (req, res) => {
    const network = await loadNetwork();
    res.json({
      stations: network.stations,
      lines: network.lines,
      segments: network.segments.map(toPublicSegment),
    });
  }),
);

app.post(
  "/api/games",
  ensureAuthenticated,
  asyncHandler(async (req, res) => {
    const network = await loadNetwork();
    const adjacency = buildAdjacency(network.segments);
    const startStation = selectRandomItem(network.stations);
    const candidates = findCandidateDestinations(
      network.stations,
      adjacency,
      startStation.id,
      minimumDistance,
    );

    if (candidates.length === 0) {
      res.status(500).json({ error: "No reachable destination could be selected." });
      return;
    }

    const destinationStation = selectRandomItem(candidates);
    const createdAt = new Date().toISOString();

    const { lastID } = await run(
      db,
      `INSERT INTO games (
        user_id, start_station_id, destination_station_id, initial_coins,
        final_score, status, created_at, completed_at
      ) VALUES (?, ?, ?, ?, NULL, 'in_progress', ?, NULL)`,
      [req.user.id, startStation.id, destinationStation.id, initialCoins, createdAt],
    );

    res.status(201).json({
      game: {
        id: lastID,
        startStation,
        destinationStation,
        initialCoins,
        minimumDistance,
      },
      planningSeconds,
      segments: network.segments.map(toPublicSegment),
      stations: network.stations,
    });
  }),
);

app.post(
  "/api/games/:id/route",
  ensureAuthenticated,
  asyncHandler(async (req, res) => {
    const gameId = Number(req.params.id);
    const { segmentIds } = req.body;

    if (!Number.isInteger(gameId) || gameId <= 0) {
      res.status(400).json({ error: "Invalid game id." });
      return;
    }

    const game = await get(db, "SELECT * FROM games WHERE id = ? AND user_id = ?", [gameId, req.user.id]);

    if (!game) {
      res.status(404).json({ error: "Game not found." });
      return;
    }

    if (game.status !== "in_progress") {
      res.status(409).json({ error: "This game has already been completed." });
      return;
    }

    if (isPlanningDeadlineExpired(game)) {
      await run(
        db,
        "UPDATE games SET final_score = 0, status = 'completed', completed_at = ? WHERE id = ?",
        [new Date().toISOString(), gameId],
      );
      res.json({
        valid: false,
        reason: "The planning time limit has expired.",
        initialCoins,
        finalScore: 0,
        steps: [],
      });
      return;
    }

    const network = await loadNetwork();
    const events = await all(db, "SELECT id, description, effect FROM events ORDER BY id");
    const validation = validateRoute({
      segmentIds,
      game,
      segments: network.segments,
      interchangeStationIds: network.interchangeStationIds,
    });

    await run(db, "BEGIN TRANSACTION");

    try {
      if (!validation.valid) {
        await run(
          db,
          "UPDATE games SET final_score = 0, status = 'completed', completed_at = ? WHERE id = ?",
          [new Date().toISOString(), gameId],
        );
        await run(db, "COMMIT");
        res.json({
          valid: false,
          reason: validation.reason,
          initialCoins,
          finalScore: 0,
          steps: [],
        });
        return;
      }

      let coins = initialCoins;
      const completedSteps = [];

      for (const [index, step] of validation.steps.entries()) {
        const event = selectRandomItem(events);
        coins += event.effect;

        await run(
          db,
          `INSERT INTO game_steps (
            game_id, step_order, from_station_id, to_station_id, event_id, coins_after_step
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          [gameId, index + 1, step.fromStationId, step.toStationId, event.id, coins],
        );

        completedSteps.push({
          order: index + 1,
          fromStationId: step.fromStationId,
          toStationId: step.toStationId,
          event: {
            description: event.description,
            effect: event.effect,
          },
          coinsAfterStep: coins,
        });
      }

      const finalScore = Math.max(0, coins);
      await run(
        db,
        "UPDATE games SET final_score = ?, status = 'completed', completed_at = ? WHERE id = ?",
        [finalScore, new Date().toISOString(), gameId],
      );
      await run(db, "COMMIT");

      res.json({
        valid: true,
        reason: null,
        initialCoins,
        finalScore,
        steps: completedSteps,
      });
    } catch (error) {
      await run(db, "ROLLBACK");
      throw error;
    }
  }),
);

app.get(
  "/api/games/history",
  ensureAuthenticated,
  asyncHandler(async (req, res) => {
    const games = await all(
      db,
      `SELECT
        g.id,
        g.initial_coins,
        g.final_score,
        g.status,
        g.created_at,
        g.completed_at,
        start.name AS start_station,
        destination.name AS destination_station
      FROM games g
      JOIN stations start ON start.id = g.start_station_id
      JOIN stations destination ON destination.id = g.destination_station_id
      WHERE g.user_id = ?
      ORDER BY g.created_at DESC`,
      [req.user.id],
    );

    res.json({ games });
  }),
);

app.get(
  "/api/ranking",
  ensureAuthenticated,
  asyncHandler(async (req, res) => {
    const ranking = await all(
      db,
      `SELECT
        u.username,
        u.display_name,
        MAX(g.final_score) AS best_score,
        COUNT(g.id) AS completed_games
      FROM users u
      JOIN games g ON g.user_id = u.id
      WHERE g.status = 'completed'
      GROUP BY u.id
      ORDER BY best_score DESC, completed_games ASC, u.username ASC`,
    );

    res.json({ ranking });
  }),
);

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: "Internal server error." });
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
