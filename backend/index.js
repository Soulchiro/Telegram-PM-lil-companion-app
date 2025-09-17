import express from "express";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const app = express();

// DB
const dbPromise = open({
  filename: path.join(__dirname, "data.sqlite"),
  driver: sqlite3.Database,
});

// middleware
app.use(bodyParser.json());

// simple logger
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// API: read today (tasks, mood, reflection)
app.get("/api/today", async (req, res) => {
  const db = await dbPromise;
  const date = new Date().toISOString().slice(0, 10);
  const tasks = await db.all("SELECT id, text, completed FROM tasks WHERE date=? ORDER BY id DESC", [date]);
  const moodRow = await db.get("SELECT mood FROM moods WHERE date=?", [date]);
  const reflectionRow = await db.get("SELECT text FROM reflections WHERE date=?", [date]);
  res.json({
    tasks,
    mood: moodRow?.mood ?? null,
    reflection: reflectionRow?.text ?? null
  });
});

// API: ideas list
app.get("/api/ideas", async (req, res) => {
  const db = await dbPromise;
  const ideas = await db.all("SELECT id, text, created_at FROM ideas ORDER BY created_at DESC LIMIT 50");
  res.json(ideas);
});

// API: history (last 7 days moods + highlights)
app.get("/api/history", async (req, res) => {
  const db = await dbPromise;
  const rows = await db.all(`
    SELECT m.date, m.mood, r.text as highlight
    FROM moods m
    LEFT JOIN reflections r ON r.date = m.date
    ORDER BY m.date DESC
    LIMIT 7
  `);
  res.json(rows);
});

// POST: add task (stores for today)
app.post("/api/tasks", async (req, res) => {
  const db = await dbPromise;
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ ok: false, error: "Empty task" });
  const date = new Date().toISOString().slice(0, 10);
  await db.run("INSERT INTO tasks (date, text, completed) VALUES (?, ?, 0)", [date, text.trim()]);
  res.json({ ok: true });
});

// POST: toggle task completed (optional)
app.post("/api/tasks/:id/toggle", async (req, res) => {
  const db = await dbPromise;
  const id = Number(req.params.id);
  const row = await db.get("SELECT completed FROM tasks WHERE id=?", [id]);
  if (!row) return res.status(404).json({ ok: false });
  const newVal = row.completed ? 0 : 1;
  await db.run("UPDATE tasks SET completed=? WHERE id=?", [newVal, id]);
  res.json({ ok: true, completed: !!newVal });
});

// DELETE task
app.delete("/api/tasks/:id", async (req, res) => {
  try {
    console.log("DELETE /api/tasks/:id called with id=", req.params.id);
    const db = await dbPromise;
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: "Invalid id" });

    // check exists
    const row = await db.get("SELECT id FROM tasks WHERE id = ?", [id]);
    if (!row) {
      return res.status(404).json({ ok: false, error: "Not found" });
    }

    await db.run("DELETE FROM tasks WHERE id = ?", [id]);
    console.log("Deleted task", id);
    return res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/tasks/:id error", err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
});

// POST: add idea
app.post("/api/ideas", async (req, res) => {
  const db = await dbPromise;
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ ok: false, error: "Empty idea" });
  await db.run("INSERT INTO ideas (text) VALUES (?)", [text.trim()]);
  res.json({ ok: true });
});

// DELETE idea
app.delete("/api/ideas/:id", async (req, res) => {
  try {
    console.log("DELETE /api/ideas/:id called with id=", req.params.id);
    const db = await dbPromise;
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: "Invalid id" });

    const row = await db.get("SELECT id FROM ideas WHERE id = ?", [id]);
    if (!row) {
      return res.status(404).json({ ok: false, error: "Not found" });
    }

    await db.run("DELETE FROM ideas WHERE id = ?", [id]);
    console.log("Deleted idea", id);
    return res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/ideas/:id error", err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
});

// POST: save mood (for today)
app.post("/api/mood", async (req, res) => {
  const db = await dbPromise;
  const { mood } = req.body;
  const date = new Date().toISOString().slice(0, 10);
  await db.run("INSERT OR REPLACE INTO moods (date, mood) VALUES (?, ?)", [date, Number(mood)]);
  res.json({ ok: true });
});

// POST: save reflection (for today)
app.post("/api/reflection", async (req, res) => {
  const db = await dbPromise;
  const { text } = req.body;
  const date = new Date().toISOString().slice(0, 10);
  await db.run("INSERT OR REPLACE INTO reflections (date, text) VALUES (?, ?)", [date, text?.trim() || ""]);
  res.json({ ok: true });
});

// DB init & serve static frontend
async function init() {
  const db = await dbPromise;
  await db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT,
      text TEXT,
      completed INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS ideas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS moods (
      date TEXT PRIMARY KEY,
      mood INTEGER
    );
    CREATE TABLE IF NOT EXISTS reflections (
      date TEXT PRIMARY KEY,
      text TEXT
    );
  `);

  // Serve frontend build folder
  app.use(express.static(path.join(__dirname, "../frontend/dist")));

  // fallback to index.html for client-side routing
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/dist/index.html"));
  });

  app.listen(PORT, () => {
    console.log(`🚀 PM Companion (backend+frontend) listening on http://localhost:${PORT}`);
  });
}

init().catch(err => {
  console.error("Failed to init DB/server:", err);
  process.exit(1);
});
