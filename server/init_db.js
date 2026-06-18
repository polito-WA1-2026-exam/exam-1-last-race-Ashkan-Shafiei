import { rm } from "node:fs/promises";
import bcrypt from "bcrypt";
import {
  DB_FILE,
  closeDatabase,
  db as defaultDb,
  exec,
  openDatabase,
  run,
} from "./db.js";

const SALT_ROUNDS = 10;

const stations = [
  ["Central", 48, 48],
  ["Museum", 38, 34],
  ["Harbor", 12, 62],
  ["Old Town", 54, 22],
  ["University", 70, 54],
  ["Stadium", 20, 18],
  ["Garden", 20, 36],
  ["Airport", 90, 64],
  ["Market", 30, 60],
  ["Hilltop", 80, 16],
  ["Riverside", 34, 20],
  ["Library", 50, 28],
  ["Theatre", 66, 26],
  ["Tech Park", 68, 18],
  ["North Gate", 46, 12],
  ["South Gate", 56, 78],
];

const lines = [
  {
    name: "Red Line",
    color: "#d72638",
    stations: ["North Gate", "Central", "Museum", "Old Town", "South Gate"],
  },
  {
    name: "Blue Line",
    color: "#1b6ca8",
    stations: ["Harbor", "Market", "Central", "University", "Airport"],
  },
  {
    name: "Green Line",
    color: "#2e7d32",
    stations: ["Garden", "Museum", "Library", "Tech Park", "Hilltop"],
  },
  {
    name: "Yellow Line",
    color: "#f9a825",
    stations: ["Stadium", "Riverside", "Old Town", "Theatre", "University"],
  },
];

const events = [
  ["Signal failure slows the train", -4],
  ["Crowded platform causes a delay", -2],
  ["Ticket inspector bonus for a valid pass", 2],
  ["Express tunnel shortcut opens", 4],
  ["Lost wallet returned to staff", 1],
  ["Escalator maintenance blocks the exit", -1],
  ["Street musician improves morale", 3],
  ["Wrong platform announcement", -3],
];

const users = [
  ["alice", "Alice Runner"],
  ["bob", "Bob Navigator"],
  ["carol", "Carol Planner"],
];

const completedGames = [
  {
    username: "alice",
    start: "North Gate",
    destination: "Airport",
    initialCoins: 20,
    finalScore: 23,
    createdAt: "2026-05-28T09:00:00.000Z",
    completedAt: "2026-05-28T09:18:00.000Z",
    steps: [
      ["North Gate", "Central", "Express tunnel shortcut opens", 24],
      ["Central", "University", "Crowded platform causes a delay", 22],
      ["University", "Airport", "Lost wallet returned to staff", 23],
    ],
  },
  {
    username: "bob",
    start: "Harbor",
    destination: "Hilltop",
    initialCoins: 20,
    finalScore: 21,
    createdAt: "2026-05-29T15:30:00.000Z",
    completedAt: "2026-05-29T15:52:00.000Z",
    steps: [
      ["Harbor", "Market", "Ticket inspector bonus for a valid pass", 22],
      ["Market", "Central", "Wrong platform announcement", 19],
      ["Central", "Museum", "Street musician improves morale", 22],
      ["Museum", "Library", "Escalator maintenance blocks the exit", 21],
      ["Library", "Tech Park", "Express tunnel shortcut opens", 25],
      ["Tech Park", "Hilltop", "Signal failure slows the train", 21],
    ],
  },
];

async function createSchema(database) {
  await exec(database, `
    PRAGMA foreign_keys = ON;

    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL
    );

    CREATE TABLE stations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      x INTEGER NOT NULL CHECK (x BETWEEN 0 AND 100),
      y INTEGER NOT NULL CHECK (y BETWEEN 0 AND 100)
    );

    CREATE TABLE metro_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL
    );

    CREATE TABLE line_stations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      line_id INTEGER NOT NULL,
      station_id INTEGER NOT NULL,
      position INTEGER NOT NULL,
      UNIQUE (line_id, position),
      UNIQUE (line_id, station_id),
      FOREIGN KEY (line_id) REFERENCES metro_lines(id) ON DELETE CASCADE,
      FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE
    );

    CREATE TABLE events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      effect INTEGER NOT NULL CHECK (effect BETWEEN -4 AND 4)
    );

    CREATE TABLE games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      start_station_id INTEGER NOT NULL,
      destination_station_id INTEGER NOT NULL,
      initial_coins INTEGER NOT NULL,
      final_score INTEGER,
      status TEXT NOT NULL CHECK (status IN ('completed', 'in_progress', 'abandoned')),
      created_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (start_station_id) REFERENCES stations(id),
      FOREIGN KEY (destination_station_id) REFERENCES stations(id)
    );

    CREATE TABLE game_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL,
      step_order INTEGER NOT NULL,
      from_station_id INTEGER NOT NULL,
      to_station_id INTEGER NOT NULL,
      event_id INTEGER NOT NULL,
      coins_after_step INTEGER NOT NULL,
      UNIQUE (game_id, step_order),
      FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
      FOREIGN KEY (from_station_id) REFERENCES stations(id),
      FOREIGN KEY (to_station_id) REFERENCES stations(id),
      FOREIGN KEY (event_id) REFERENCES events(id)
    );
  `);
}

async function seedData(database) {
  const stationIds = new Map();
  const lineIds = new Map();
  const eventIds = new Map();
  const userIds = new Map();

  for (const [stationName, x, y] of stations) {
    const { lastID } = await run(database, "INSERT INTO stations (name, x, y) VALUES (?, ?, ?)", [
      stationName,
      x,
      y,
    ]);
    stationIds.set(stationName, lastID);
  }

  for (const line of lines) {
    const { lastID: lineId } = await run(
      database,
      "INSERT INTO metro_lines (name, color) VALUES (?, ?)",
      [line.name, line.color],
    );
    lineIds.set(line.name, lineId);

    for (const [index, stationName] of line.stations.entries()) {
      await run(
        database,
        "INSERT INTO line_stations (line_id, station_id, position) VALUES (?, ?, ?)",
        [lineId, stationIds.get(stationName), index + 1],
      );
    }
  }

  for (const [description, effect] of events) {
    const { lastID } = await run(database, "INSERT INTO events (description, effect) VALUES (?, ?)", [
      description,
      effect,
    ]);
    eventIds.set(description, lastID);
  }

  for (const [username, displayName] of users) {
    const passwordHash = await bcrypt.hash("password", SALT_ROUNDS);
    const { lastID } = await run(
      database,
      "INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)",
      [username, passwordHash, displayName],
    );
    userIds.set(username, lastID);
  }

  // Completed games are stored separately from their steps so future APIs can resume or inspect a game.
  for (const game of completedGames) {
    const { lastID: gameId } = await run(
      database,
      `INSERT INTO games (
        user_id, start_station_id, destination_station_id, initial_coins,
        final_score, status, created_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, 'completed', ?, ?)`,
      [
        userIds.get(game.username),
        stationIds.get(game.start),
        stationIds.get(game.destination),
        game.initialCoins,
        game.finalScore,
        game.createdAt,
        game.completedAt,
      ],
    );

    for (const [index, step] of game.steps.entries()) {
      const [from, to, event, coinsAfterStep] = step;
      await run(
        database,
        `INSERT INTO game_steps (
          game_id, step_order, from_station_id, to_station_id, event_id, coins_after_step
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          gameId,
          index + 1,
          stationIds.get(from),
          stationIds.get(to),
          eventIds.get(event),
          coinsAfterStep,
        ],
      );
    }
  }
}

async function main() {
  await closeDatabase(defaultDb);
  await rm(DB_FILE, { force: true });

  const database = openDatabase();

  try {
    await createSchema(database);
    await seedData(database);
    console.log(`Database initialized successfully at ${DB_FILE}`);
    console.log("Seeded 4 metro lines, 16 stations, 8 events, 3 users, and 2 completed games.");
  } finally {
    await closeDatabase(database);
  }
}

main().catch((error) => {
  console.error("Database initialization failed:");
  console.error(error);
  process.exit(1);
});
