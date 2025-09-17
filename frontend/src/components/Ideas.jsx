import React, { useEffect, useState } from "react";
import AddIdea from "./AddIdea";

export default function Ideas() {
  console.log("Mounting <Ideas>");
  const [ideas, setIdeas] = useState([]);
  const [error, setError] = useState(null);

  const fetchIdeas = async () => {
    try {
      setError(null);
      const res = await fetch("/api/ideas");
      if (!res.ok) throw new Error("fetch /api/ideas failed");
      const data = await res.json();
      setIdeas(Array.isArray(data) ? data : data.ideas || []);
    } catch (e) {
      console.error("Ideas fetch error", e);
      setError(String(e));
      setIdeas([]);
    }
  };

  useEffect(() => {
    fetchIdeas();
  }, []);

  const add = async (text) => {
    try {
      if (!text) return;
      const res = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error("Add idea failed");
      await fetchIdeas();
    } catch (e) {
      console.error("add idea error", e);
      setError(String(e));
    }
  };

  const deleteIdea = async (id) => {
    try {
      const ok = confirm("Delete this idea?");
      if (!ok) return;
      const res = await fetch(`/api/ideas/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete idea failed");
      await fetchIdeas();
    } catch (e) {
      console.error("delete idea error", e);
      setError(String(e));
    }
  };

  return (
    <div className="card">
      <h3>Ideas</h3>
      <AddIdea onAdd={add} />
      {error && <div style={{ color: "crimson" }}>{error}</div>}
      <ul style={{ paddingLeft: 0, marginTop: 8 }}>
        {ideas.length === 0 ? (
          <p className="small-muted">No ideas yet</p>
        ) : (
          ideas.map((i) => (
            <li key={i.id} className="task-row">
              <div className="task-left">
                <span className="task-text">{i.text}</span>
              </div>
              <div className="task-right">
                <button
                  className="icon-button"
                  title="Delete idea"
                  onClick={() => deleteIdea(i.id)}
                >
                  🗑️
                </button>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
