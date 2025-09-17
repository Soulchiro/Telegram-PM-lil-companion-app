import React, { useEffect, useState } from "react";

/*
  Smile mapping: index 0 = mood=1 (low) ... index 4 = mood=5 (high)
  Use accessible labels too.
*/
const SMILES = [
  { emo: "😞", label: "Awful" },
  { emo: "😕", label: "Bad" },
  { emo: "😐", label: "Okay" },
  { emo: "🙂", label: "Good" },
  { emo: "😄", label: "Great" },
];

export default function AddMood({ onSubmit, current = null }) {
  const [mood, setMood] = useState(current ?? 3);

  useEffect(() => {
    if (typeof current === "number") setMood(current);
  }, [current]);

  const choose = (i) => {
    const value = i + 1;
    setMood(value);
    if (typeof onSubmit === "function") {
      try { onSubmit(value); } catch (err) { console.error("AddMood onSubmit failed", err); }
    } else {
      console.warn("AddMood: onSubmit is not a function");
    }
  };

  return (
    <div>
      <div className="small-muted" style={{textAlign:"center"}}>Tap to set mood</div>
      <div className="smile-row" role="radiogroup" aria-label="Mood">
        {SMILES.map((s, idx) => (
          <button
            key={s.label}
            className={`smile-btn ${mood === idx + 1 ? "selected" : ""}`}
            onClick={() => choose(idx)}
            aria-pressed={mood === idx + 1}
            aria-label={s.label}
            title={s.label}
          >
            <span aria-hidden="true">{s.emo}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
