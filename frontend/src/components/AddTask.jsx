import React, { useState } from "react";
export default function AddTask({ onAdd }) {
  console.log("Mounting <AddTask>", { onAddType: typeof onAdd });
  const [text, setText] = useState("");
  const submit = (e) => {
    e.preventDefault();
    const v = (text || "").trim();
    if (!v) return;
    if (typeof onAdd === "function") {
      try { onAdd(v); } catch (err) { console.error("AddTask onAdd threw", err); }
    } else {
      console.warn("AddTask missing onAdd or not a function");
    }
    setText("");
  };
  return (
    <form onSubmit={submit} className="row">
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="New task..." />
      <button className="add-button" type="submit">Add</button>
    </form>
  );
}



