import React, { useEffect, useRef, useState } from "react";
export default function Pomodoro() {
  console.log("Mounting <Pomodoro>");
  const [time, setTime] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => setTime((t) => (t > 0 ? t - 1 : 0)), 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  const mm = Math.floor(time / 60);
  const ss = time % 60;

  return (
    <div className="card">
      <h3>Pomodoro</h3>
      <div style={{ fontSize: 28 }}>{String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}</div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="add-button" onClick={() => setRunning((r) => !r)}>{running ? "Pause" : "Start"}</button>
        <button className="add-button" onClick={() => { setRunning(false); setTime(25 * 60); }} style={{ background: "#708238" }}>Reset</button>
      </div>
    </div>
  );
}
