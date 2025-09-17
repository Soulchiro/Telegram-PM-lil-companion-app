import React, { useEffect, useState } from "react";
export default function AddReflection({ onSubmit, initial = "" }) {
  console.log("Mounting <AddReflection>", { onSubmitType: typeof onSubmit, initial });
  const [text, setText] = useState(initial || "");
  useEffect(() => setText(initial || ""), [initial]);
  const save = () => {
    const v = (text || "").trim();
    if (typeof onSubmit === "function") {
      try { onSubmit(v); } catch (err) { console.error("AddReflection onSubmit threw", err); }
    } else {
      console.warn("AddReflection missing onSubmit or not a function");
    }
    setText("");
  };
  return (
    <div>
      <textarea rows="3" value={text} onChange={(e) => setText(e.target.value)} placeholder="What went well today?" />
      <div className="row">
        <button className="add-button" onClick={save}>Save</button>
      </div>
    </div>
  );
}
