import React, { useState } from "react";
import Dashboard from "./components/Dashboard";
import Ideas from "./components/Ideas";
import History from "./components/History";
import Pomodoro from "./components/Pomodoro";
import "./styles.css";

export default function App() {
  const [activeTab, setActiveTab] = useState("today");

  const renderContent = () => {
    switch (activeTab) {
      case "today":
        return <Dashboard />;
      case "ideas":
        return <Ideas />;
      case "history":
        return <History />;
      case "pomodoro":
        return <Pomodoro />;
      default:
        return <Dashboard />;
    }
  };

  const tabs = [
    { id: "today", label: "Today", emoji: "🏠" },
    { id: "ideas", label: "Ideas", emoji: "💡" },
    { id: "history", label: "History", emoji: "📊" },
    { id: "pomodoro", label: "Pomodoro", emoji: "🍅" },
  ];

  return (
    <div className="app-container">
      <div className="content">{renderContent()}</div>

      <div className="tab-bar">
        <div className="tab-group" role="tablist" aria-label="Main tabs">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={activeTab === t.id}
              className={`tab-square ${activeTab === t.id ? "active" : ""}`}
              onClick={() => setActiveTab(t.id)}
              title={t.label}
            >
              <div className="tab-emoji">{t.emoji}</div>
              <div className="tab-label">{t.label}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
