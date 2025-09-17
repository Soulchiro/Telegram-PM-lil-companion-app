import React, { useState } from "react";
export default function AddIdea({ onAdd }) {
  console.log("Mounting <AddIdea>", { onAddType: typeof onAdd });
  const [text, setText] = useState("");
  const submit = (e) => {
    e.preventDefault();
    const v = (text || "").trim();
    if (!v) return;
    if (typeof onAdd === "function") {
      try { onAdd(v); } catch (err) { console.error("AddIdea onAdd threw", err); }
    } else {
      console.warn("AddIdea missing onAdd or not a function");
    }
    setText("");
  };
  return (
    <form onSubmit={submit} className="row">
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Quick idea..." />
      <button className="add-button" type="submit">Add</button>
    </form>
  );
}
