import React, { useEffect, useState } from "react";

export default function History() {
  console.log("Mounting <History>");
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setError(null);
        const res = await fetch("/api/history");
        if (!res.ok) throw new Error("fetch /api/history failed");
        const data = await res.json();
        if (!mounted) return;
        setRows(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error("History fetch error", e);
        setError(String(e));
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="card">
      <h3>Last 7 days</h3>
      {error && <div style={{ color: "crimson" }}>{error}</div>}
      {rows.length === 0 ? (
        <p className="small-muted">No history yet</p>
      ) : (
        <ul>
          {rows.map((r) => (
            <li key={r.date}>
              {r.date}: Mood {r.mood ?? "-"} {r.highlight ? `— ${r.highlight}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
