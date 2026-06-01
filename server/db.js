import sqlite3 from "sqlite3";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const DB_DIR = join(__dirname, "data");
export const DB_FILE = join(DB_DIR, "last_race.sqlite");

mkdirSync(DB_DIR, { recursive: true });

sqlite3.verbose();

export function openDatabase(filename = DB_FILE) {
  const database = new sqlite3.Database(filename);
  database.run("PRAGMA foreign_keys = ON");
  return database;
}

export const db = openDatabase();

export function run(database, sql, params = []) {
  return new Promise((resolve, reject) => {
    database.run(sql, params, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

export function get(database, sql, params = []) {
  return new Promise((resolve, reject) => {
    database.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(row);
    });
  });
}

export function all(database, sql, params = []) {
  return new Promise((resolve, reject) => {
    database.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(rows);
    });
  });
}

export function exec(database, sql) {
  return new Promise((resolve, reject) => {
    database.exec(sql, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export function closeDatabase(database = db) {
  return new Promise((resolve, reject) => {
    database.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
