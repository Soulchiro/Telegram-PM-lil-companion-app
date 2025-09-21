// backend/index.js
import dotenv from "dotenv";
dotenv.config(); // load env first

import express from "express";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim();
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

console.log("DEBUG: SUPABASE_URL length =", SUPABASE_URL.length);
console.log("DEBUG: SUPABASE_SERVICE_ROLE_KEY length =", SUPABASE_SERVICE_ROLE_KEY.length);

let supabase = null;
let dbMode = "sqlite";

if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    dbMode = "supabase";
    console.log("✅ Supabase config detected, running in supabase mode");
  } catch (e) {
    console.warn("⚠️ Failed to init Supabase client, falling back to SQLite", e);
  }
} else {
  console.warn("⚠️ Supabase not configured, falling back to SQLite");
}
console.log("DB mode:", dbMode);

const PORT = process.env.PORT || 3000;
const app = express();

// SQLite DB promise (local dev)
const dbPromise = open({
  filename: path.join(__dirname, "data.sqlite"),
  driver: sqlite3.Database,
});

// middleware
app.use(bodyParser.json());

// quick request logger
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

/* --------------------------
   Simple header-based auth
   - accepts x-telegram-user (JSON string) or x-dev-user
   - in dev, falls back to id=12345 if none provided
---------------------------*/
function parseJsonHeader(h) {
  if (!h) return null;
  try { return JSON.parse(h); } catch (e) {
    try {
      const obj = {};
      h.split("&").forEach(part => {
        const [k, v] = part.split("=");
        if (k) obj[decodeURIComponent(k)] = decodeURIComponent(v || "");
      });
      return obj;
    } catch (e2) { return null; }
  }
}

async function simpleAuthMiddleware(req, res, next) {
  try {
    const tu = parseJsonHeader(req.headers["x-telegram-user"]);
    if (tu && tu.id) {
      req.tgUser = {
        id: Number(tu.id),
        username: tu.username ?? null,
        first_name: tu.first_name ?? null,
        last_name: tu.last_name ?? null
      };
      return next();
    }

    const dev = parseJsonHeader(req.headers["x-dev-user"]);
    if (dev && dev.id) {
      req.tgUser = { id: Number(dev.id), username: dev.username ?? "dev", first_name: dev.first_name ?? "Dev" };
      return next();
    }

    if (process.env.NODE_ENV !== "production") {
      req.tgUser = { id: 12345, username: "devuser", first_name: "Dev" };
      return next();
    }

    return next();
  } catch (err) {
    console.error("simpleAuthMiddleware error:", err);
    return next();
  }
}

app.use("/api", simpleAuthMiddleware);

/* --------------------------
   ensure user exists in Supabase (upsert)
---------------------------*/
async function ensureUserRecord(tgUser) {
  if (!tgUser || !tgUser.id || dbMode !== "supabase") return;
  try {
    const payload = {
      id: Number(tgUser.id),
      username: tgUser.username ?? null,
      first_name: tgUser.first_name ?? null,
      last_name: tgUser.last_name ?? null
    };
    const { data, error } = await supabase.from("users").upsert([payload], { onConflict: "id" });
    if (error) {
      console.error("ensureUserRecord supabase error:", error);
      throw error;
    }
    return data?.[0] ?? null;
  } catch (err) {
    console.error("ensureUserRecord error:", err);
    throw err;
  }
}

/* --------------------------
   API Endpoints (dual-mode)
---------------------------*/

// GET /api/today
app.get("/api/today", async (req, res) => {
  try {
    const date = new Date().toISOString().slice(0, 10);

    if (dbMode === "supabase") {
      if (!req.tgUser?.id) return res.status(401).json({ ok: false, error: "Unauthorized (no telegram user)" });
      const tgId = Number(req.tgUser.id);

      const { data: tasks, error: tErr } = await supabase.from("tasks")
        .select("id, text, completed, created_at, telegram_id")
        .eq("telegram_id", tgId)
        .eq("date", date)
        .order("created_at", { ascending: false });
      if (tErr) throw tErr;

      const { data: moods } = await supabase.from("moods").select("mood").eq("telegram_id", tgId).eq("date", date).limit(1);
      const mood = moods?.[0]?.mood ?? null;

      const { data: refls } = await supabase.from("reflections").select("text").eq("telegram_id", tgId).eq("date", date).limit(1);
      const reflection = refls?.[0]?.text ?? null;

      return res.json({ tasks: tasks || [], mood, reflection });
    } else {
      const db = await dbPromise;
      const tasks = await db.all("SELECT id, text, completed FROM tasks WHERE date=? ORDER BY id DESC", [date]);
      const moodRow = await db.get("SELECT mood FROM moods WHERE date=?", [date]);
      const reflectionRow = await db.get("SELECT text FROM reflections WHERE date=?", [date]);
      return res.json({
        tasks,
        mood: moodRow?.mood ?? null,
        reflection: reflectionRow?.text ?? null
      });
    }
  } catch (err) {
    console.error("GET /api/today err", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// POST /api/tasks
app.post("/api/tasks", async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ ok: false, error: "Empty task" });
  const date = new Date().toISOString().slice(0, 10);

  try {
    if (dbMode === "supabase") {
      if (!req.tgUser?.id) return res.status(401).json({ ok: false, error: "Unauthorized (no telegram user)" });
      await ensureUserRecord(req.tgUser);
      const tgId = Number(req.tgUser.id);
      const { data, error } = await supabase.from("tasks").insert([
        { telegram_id: tgId, date, text: text.trim(), completed: false }
      ]).select().single();
      if (error) throw error;
      return res.json({ ok: true, task: data });
    } else {
      const db = await dbPromise;
      await db.run("INSERT INTO tasks (date, text, completed) VALUES (?, ?, 0)", [date, text.trim()]);
      return res.json({ ok: true });
    }
  } catch (err) {
    console.error("POST /api/tasks error", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// POST /api/tasks/:id/toggle
app.post("/api/tasks/:id/toggle", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (dbMode === "supabase") {
      if (!req.tgUser?.id) return res.status(401).json({ ok: false, error: "Unauthorized (no telegram user)" });
      const tgId = Number(req.tgUser.id);
      const { data, error } = await supabase.from("tasks").select("id,completed,telegram_id").eq("id", id).single();
      if (error || !data) return res.status(404).json({ ok: false, error: "Not found" });
      if (Number(data.telegram_id) !== tgId) return res.status(403).json({ ok: false, error: "Forbidden" });
      const newVal = !data.completed;
      const { error: uErr } = await supabase.from("tasks").update({ completed: newVal }).eq("id", id);
      if (uErr) throw uErr;
      return res.json({ ok: true, completed: newVal });
    } else {
      const db = await dbPromise;
      const row = await db.get("SELECT completed FROM tasks WHERE id=?", [id]);
      if (!row) return res.status(404).json({ ok: false });
      const newVal = row.completed ? 0 : 1;
      await db.run("UPDATE tasks SET completed=? WHERE id=?", [newVal, id]);
      return res.json({ ok: true, completed: !!newVal });
    }
  } catch (err) {
    console.error("POST /api/tasks/:id/toggle err", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// DELETE /api/tasks/:id
app.delete("/api/tasks/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (dbMode === "supabase") {
      if (!req.tgUser?.id) return res.status(401).json({ ok: false, error: "Unauthorized (no telegram user)" });
      const tgId = Number(req.tgUser.id);
      const { data, error } = await supabase.from("tasks").select("telegram_id").eq("id", id).single();
      if (error || !data) return res.status(404).json({ ok: false, error: "Not found" });
      if (Number(data.telegram_id) !== tgId) return res.status(403).json({ ok: false, error: "Forbidden" });
      const { error: delErr } = await supabase.from("tasks").delete().eq("id", id);
      if (delErr) throw delErr;
      return res.json({ ok: true });
    } else {
      const db = await dbPromise;
      const row = await db.get("SELECT id FROM tasks WHERE id = ?", [id]);
      if (!row) return res.status(404).json({ ok: false, error: "Not found" });
      await db.run("DELETE FROM tasks WHERE id = ?", [id]);
      return res.json({ ok: true });
    }
  } catch (err) {
    console.error("DELETE /api/tasks/:id error", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// GET /api/ideas
app.get("/api/ideas", async (req, res) => {
  try {
    if (dbMode === "supabase") {
      if (!req.tgUser?.id) return res.status(401).json({ ok: false, error: "Unauthorized (no telegram user)" });
      const tgId = Number(req.tgUser.id);
      const { data, error } = await supabase.from("ideas").select("id,text,created_at").eq("telegram_id", tgId).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return res.json(data || []);
    } else {
      const db = await dbPromise;
      const ideas = await db.all("SELECT id, text, created_at FROM ideas ORDER BY created_at DESC LIMIT 50");
      return res.json(ideas);
    }
  } catch (err) {
    console.error("GET /api/ideas err", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// POST /api/ideas
app.post("/api/ideas", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ ok: false, error: "Empty idea" });

    if (dbMode === "supabase") {
      if (!req.tgUser?.id) return res.status(401).json({ ok: false, error: "Unauthorized (no telegram user)" });
      await ensureUserRecord(req.tgUser);
      const tgId = Number(req.tgUser.id);
      const { data, error } = await supabase.from("ideas").insert([{ telegram_id: tgId, text: text.trim() }]).select().single();
      if (error) throw error;
      return res.json({ ok: true, idea: data });
    } else {
      const db = await dbPromise;
      await db.run("INSERT INTO ideas (text) VALUES (?)", [text.trim()]);
      return res.json({ ok: true });
    }
  } catch (err) {
    console.error("POST /api/ideas err", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// DELETE /api/ideas/:id
app.delete("/api/ideas/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (dbMode === "supabase") {
      if (!req.tgUser?.id) return res.status(401).json({ ok: false, error: "Unauthorized (no telegram user)" });
      const tgId = Number(req.tgUser.id);
      const { data, error } = await supabase.from("ideas").select("telegram_id").eq("id", id).single();
      if (error || !data) return res.status(404).json({ ok: false, error: "Not found" });
      if (Number(data.telegram_id) !== tgId) return res.status(403).json({ ok: false, error: "Forbidden" });
      const { error: delErr } = await supabase.from("ideas").delete().eq("id", id);
      if (delErr) throw delErr;
      return res.json({ ok: true });
    } else {
      const db = await dbPromise;
      const row = await db.get("SELECT id FROM ideas WHERE id = ?", [id]);
      if (!row) return res.status(404).json({ ok: false, error: "Not found" });
      await db.run("DELETE FROM ideas WHERE id = ?", [id]);
      return res.json({ ok: true });
    }
  } catch (err) {
    console.error("DELETE /api/ideas/:id err", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// POST /api/mood (safe select->update->insert, no upsert)
app.post("/api/mood", async (req, res) => {
  try {
    const { mood } = req.body;
    const date = new Date().toISOString().slice(0, 10);

    if (dbMode === "supabase") {
      if (!req.tgUser?.id) return res.status(401).json({ ok: false, error: "Unauthorized (no telegram user)" });
      await ensureUserRecord(req.tgUser);
      const tgId = Number(req.tgUser.id);

      // Try update first (match by telegram_id + date)
      const upd = await supabase
        .from("moods")
        .update({ mood })
        .match({ telegram_id: tgId, date })
        .select();

      console.log("Supabase moods update result:", upd);

      if (!upd.error && Array.isArray(upd.data) && upd.data.length > 0) {
        return res.json({ ok: true, row: upd.data[0] });
      }

      // No existing row updated -> insert
      const ins = await supabase
        .from("moods")
        .insert([{ telegram_id: tgId, date, mood }])
        .select();

      console.log("Supabase moods insert result:", ins);

      if (ins.error) throw ins.error;
      return res.json({ ok: true, row: ins.data?.[0] ?? null });
    } else {
      const db = await dbPromise;
      await db.run("INSERT OR REPLACE INTO moods (date, mood) VALUES (?, ?)", [date, Number(mood)]);
      return res.json({ ok: true });
    }
  } catch (err) {
    console.error("POST /api/mood err", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});




// POST /api/reflection (safe select->update->insert, no upsert)
app.post("/api/reflection", async (req, res) => {
  try {
    const { text } = req.body;
    const date = new Date().toISOString().slice(0, 10);

    if (dbMode === "supabase") {
      if (!req.tgUser?.id) return res.status(401).json({ ok: false, error: "Unauthorized (no telegram user)" });
      await ensureUserRecord(req.tgUser);
      const tgId = Number(req.tgUser.id);

      // Try update first by telegram_id + date
      const upd = await supabase
        .from("reflections")
        .update({ text: text?.trim() || "" })
        .match({ telegram_id: tgId, date })
        .select();

      console.log("Supabase reflections update result:", upd);

      if (!upd.error && Array.isArray(upd.data) && upd.data.length > 0) {
        return res.json({ ok: true, row: upd.data[0] });
      }

      // Otherwise insert
      const ins = await supabase
        .from("reflections")
        .insert([{ telegram_id: tgId, date, text: text?.trim() || "" }])
        .select();

      console.log("Supabase reflections insert result:", ins);

      if (ins.error) throw ins.error;
      return res.json({ ok: true, row: ins.data?.[0] ?? null });
    } else {
      const db = await dbPromise;
      await db.run("INSERT OR REPLACE INTO reflections (date, text) VALUES (?, ?)", [date, text?.trim() || ""]);
      return res.json({ ok: true });
    }
  } catch (err) {
    console.error("POST /api/reflection err", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});




// GET /api/history (resilient: normalizes stored dates/timestamps)
app.get("/api/history", async (req, res) => {
  try {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().slice(0, 10));
    }

    if (dbMode === "supabase") {
      if (!req.tgUser?.id) return res.status(401).json({ ok: false, error: "Unauthorized (no telegram user)" });
      const tgId = Number(req.tgUser.id);

      // fetch a reasonable window of rows and normalize dates on server
      // (fetch all rows for this user in last 30 days to be safe)
      const fromDate = (() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d.toISOString().slice(0, 10);
      })();

      // pull moods and reflections for user (we'll normalize dates in JS)
      const [mRes, rRes] = await Promise.all([
        supabase.from("moods").select("*").eq("telegram_id", tgId).gte("date", fromDate).order("date", { ascending: false }).limit(500),
        supabase.from("reflections").select("*").eq("telegram_id", tgId).gte("date", fromDate).order("date", { ascending: false }).limit(500)
      ]);

      if (mRes.error) throw mRes.error;
      if (rRes.error) throw rRes.error;

      // helper: produce YYYY-MM-DD from a row (check various fields)
      const toYMD = (row) => {
        if (!row) return null;
        // prefer explicit 'date' field if present and looks like YYYY-MM-DD
        if (row.date && typeof row.date === "string") {
          const m = row.date.match(/^(\d{4}-\d{2}-\d{2})/);
          if (m) return m[1];
        }
        // if row.date is a JS Date or timestamp-like
        if (row.date) {
          try {
            const d = new Date(row.date);
            if (!isNaN(d)) return d.toISOString().slice(0,10);
          } catch {}
        }
        // fallback to created_at / inserted_at fields if present
        if (row.created_at) {
          try {
            const d = new Date(row.created_at);
            if (!isNaN(d)) return d.toISOString().slice(0,10);
          } catch {}
        }
        if (row.inserted_at) {
          try {
            const d = new Date(row.inserted_at);
            if (!isNaN(d)) return d.toISOString().slice(0,10);
          } catch {}
        }
        // last resort: try parsing any field that looks like a timestamp
        for (const k of Object.keys(row)) {
          if (typeof row[k] === "string" && row[k].length > 8 && row[k].includes("-")) {
            try {
              const d = new Date(row[k]);
              if (!isNaN(d)) return d.toISOString().slice(0,10);
            } catch {}
          }
        }
        return null;
      };

      const moodsMap = {};
      (mRes.data || []).forEach(r => {
        const k = toYMD(r);
        if (k) moodsMap[k] = r.mood ?? moodsMap[k];
      });

      const reflMap = {};
      (rRes.data || []).forEach(r => {
        const k = toYMD(r);
        if (k) reflMap[k] = r.text ?? reflMap[k];
      });

      const out = days.map(date => ({
        date,
        mood: (moodsMap.hasOwnProperty(date) ? moodsMap[date] : null),
        highlight: (reflMap[date] || "")
      }));

      return res.json(out);
    } else {
      const db = await dbPromise;
      const rows = await db.all(`
        SELECT m.date, m.mood, r.text as highlight
        FROM moods m
        LEFT JOIN reflections r ON r.date = m.date
        ORDER BY m.date DESC
        LIMIT 7
      `);
      return res.json(rows);
    }
  } catch (err) {
    console.error("GET /api/history err", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});


/* ---------------------
   DB init & serve frontend
--------------------- */
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
