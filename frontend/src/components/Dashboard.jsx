import React, { useCallback, useEffect, useState } from "react";
import AddTask from "./AddTask";
import AddMood from "./AddMood";
import AddReflection from "./AddReflection";

export default function Dashboard() {
  console.log("Mounting <Dashboard>");
  const [tasks, setTasks] = useState([]);
  const [mood, setMood] = useState(null);
  const [reflection, setReflection] = useState("");
  const [error, setError] = useState(null);

  const fetchToday = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/today");
      if (!res.ok) throw new Error("Fetch /api/today failed");
      const data = await res.json();
      setTasks(Array.isArray(data.tasks) ? data.tasks : []);
      setMood(data.mood ?? null);
      setReflection(data.reflection ?? "");
    } catch (err) {
      console.error("Dashboard fetchToday error:", err);
      setError(err.message || String(err));
      setTasks([]);
      setMood(null);
      setReflection("");
    }
  }, []);

  useEffect(() => {
    fetchToday();
  }, [fetchToday]);

  const addTask = async (text) => {
    try {
      if (!text) return;
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error("Add task failed");
      await fetchToday();
    } catch (e) {
      console.error("addTask error", e);
      setError(String(e));
    }
  };

  const toggle = async (id) => {
    try {
      const res = await fetch(`/api/tasks/${id}/toggle`, { method: "POST" });
      if (!res.ok) throw new Error("Toggle failed");
      await fetchToday();
    } catch (e) {
      console.error("toggle error", e);
    }
  };

  const deleteTask = async (id) => {
    try {
      const ok = confirm("Delete this task?");
      if (!ok) return;
      const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      await fetchToday();
    } catch (e) {
      console.error("deleteTask error", e);
      setError(String(e));
    }
  };

  const saveMood = async (m) => {
    try {
      await fetch("/api/mood", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mood: m }),
      });
      await fetchToday();
    } catch (e) {
      console.error("saveMood error", e);
    }
  };

  const saveReflection = async (txt) => {
    try {
      await fetch("/api/reflection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: txt }),
      });
      await fetchToday();
    } catch (e) {
      console.error("saveReflection error", e);
    }
  };

  return (
    <>
      <div className="card">
        <h3>Today</h3>
        <AddTask onAdd={addTask} />
        {error && <div style={{ color: "crimson" }}>{error}</div>}

        <div style={{ marginTop: 8 }}>
          <h4>Tasks</h4>
          {tasks.length === 0 ? (
            <p className="small-muted">No tasks yet</p>
          ) : (
            <ul style={{ paddingLeft: 0, marginTop: 8 }}>
              {tasks.map((t) => (
                <li key={t.id} className="task-row">
                  <div className="task-left">
                    <input
                      type="checkbox"
                      checked={!!t.completed}
                      onChange={() => toggle(t.id)}
                      aria-label={`Toggle ${t.text}`}
                    />
                    <span className="task-text">{t.text}</span>
                  </div>

                  <div className="task-right">
                    <button
                      className="icon-button"
                      title="Delete task"
                      onClick={() => deleteTask(t.id)}
                      aria-label="Delete task"
                    >
                      🗑️
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card">
        <h4>Mood</h4>
        <AddMood onSubmit={saveMood} current={mood} />
      </div>

      <div className="card">
        <h4>Reflection</h4>
        <AddReflection onSubmit={saveReflection} initial={reflection} />
      </div>
    </>
  );
}
