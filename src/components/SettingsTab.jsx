import { useState } from "react";
import { dbGetAllReflections, dbGetAllEntries, dbClearAll } from "../lib/db.js";
import {
  pageWrap,
  pageTitle,
  pageSubtitle,
  settingsSection,
  settingsTitle,
  settingsDesc,
  ghostBtn,
} from "../lib/styles.js";
import { startFocusSession } from "./FocusTimer.jsx";
import { readingTime } from "../lib/library.js";

// ── Toggle button group ───────────────────────────────────────────────────────
function OptionGroup({ label: groupLabel, options, value, onChange }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--on-surface-var)",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        {groupLabel}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              padding: "8px 18px",
              borderRadius: 40,
              border: "1px solid",
              borderColor: value === o.value ? "var(--primary)" : "var(--outline-ghost)",
              background: value === o.value ? "var(--primary)" : "transparent",
              color: value === o.value ? "var(--on-primary)" : "var(--on-surface-var)",
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Settings Tab ──────────────────────────────────────────────────────────────
export default function SettingsTab({
  theme,
  setTheme,
  fontSize,
  setFontSize,
  fontFamily,
  setFontFamily,
  books,
  showToast,
}) {
  const titles = Object.fromEntries((books ?? []).map((b) => [b.id, b.title]));
  const where = (id) => {
    const [bookId, ch] = id.split(":");
    return `${titles[bookId] ?? bookId} — ${(ch ?? "").replace(/^\d+-/, "").replace(/-/g, " ")}`;
  };
  const [bionic, setBionic] = useState(() => {
    try { return localStorage.getItem("bionic") || "0"; } catch { return "0"; }
  });
  const changeBionic = (v) => {
    setBionic(v);
    try { localStorage.setItem("bionic", v); } catch {}
  };
  const [confirmClear, setConfirmClear] = useState(false);
  const [textScale, setTextScale] = useState(() => {
    try { return localStorage.getItem("textScale") || "1"; } catch { return "1"; }
  });
  const changeTextScale = (v) => {
    setTextScale(v);
    try { localStorage.setItem("textScale", v); } catch {}
  };

  // Export all reflections as JSON
  const handleExportJSON = async () => {
    try {
      const data = { chapterNotes: await dbGetAllReflections(), passageReflections: await dbGetAllEntries() };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `book-reader-notes-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Exported successfully ✓");
    } catch {
      showToast("Export failed", "error");
    }
  };

  // Export as Markdown
  const handleExportMD = async () => {
    try {
      const data = await dbGetAllReflections();
      const lines = ["# My Reading Notes\n"];
      if (data.length) lines.push("# Chapter summaries\n");
      data.forEach((r) => {
        lines.push(`## ${where(r.nameId)}\n_Updated: ${new Date(r.updatedAt).toLocaleDateString()}_\n`);
        if (r.notes?.trim()) lines.push(`### Key takeaways\n${r.notes.trim()}\n`);
        if (r.actionItems?.some((a) => a?.trim())) {
          lines.push(`### How I'll use it`);
          r.actionItems.filter((a) => a?.trim()).forEach((a) => lines.push(`- ${a}`));
          lines.push("");
        }
        if (r.questions?.trim()) lines.push(`### Questions\n${r.questions.trim()}\n`);
        lines.push("---\n");
      });
      const entries = await dbGetAllEntries();
      if (entries.length) lines.push("# Passage notes\n");
      entries.forEach((e) => {
        lines.push(`## ${where(e.nameId)}${e.tags?.length ? " · " + e.tags.join(", ") : ""}\n_${new Date(e.updatedAt).toLocaleDateString()}_\n`);
        if (e.quote) lines.push(`> ${e.quote}\n`);
        if (e.text) lines.push(`${e.text}\n`);
        lines.push("---\n");
      });
      const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `book-reader-notes-${Date.now()}.md`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Exported as Markdown ✓");
    } catch {
      showToast("Export failed", "error");
    }
  };

  const handleClearData = async () => {
    await dbClearAll();
    setConfirmClear(false);
    showToast("All notes cleared", "info");
  };

  return (
    <div style={pageWrap}>
      <h1 style={pageTitle}>Settings</h1>
      <p style={pageSubtitle}>Customize your reading experience</p>

      <div style={settingsSection}>
        <div style={settingsTitle}>Appearance</div>

        <OptionGroup
          label="Theme"
          value={theme}
          onChange={setTheme}
          options={[
            { value: "system", label: "System" },
            { value: "light",  label: "Light" },
            { value: "dark",   label: "Dark" },
            { value: "sepia",  label: "Sepia" },
          ]}
        />

        <OptionGroup
          label="Reading text size"
          value={textScale}
          onChange={changeTextScale}
          options={[
            { value: "0.9",  label: "Small" },
            { value: "1",    label: "Medium" },
            { value: "1.12", label: "Large" },
            { value: "1.25", label: "X-Large" },
            { value: "1.4",  label: "XX-Large" },
          ]}
        />
        <p
          style={{
            fontFamily: "'Merriweather', Georgia, serif", fontWeight: 300, lineHeight: 1.8,
            fontSize: `calc(18.5px * ${textScale})`, color: "var(--on-surface)", margin: "4px 0 0",
          }}
        >
          The quick brown fox jumps over the lazy dog, and the reader keeps going.
        </p>
      </div>

      <div style={settingsSection}>
        <div style={settingsTitle}>Focus</div>
        <div style={settingsDesc}>
          Tools that make it easier to stay on the page. Focus mode shows one passage at a time;
          use ← → or space to move, or swipe on a phone.
        </div>
        <OptionGroup
          label="Bionic reading (bold word starts)"
          value={bionic}
          onChange={changeBionic}
          options={[
            { value: "0", label: "Off" },
            { value: "1", label: "On" },
          ]}
        />
        <div style={{ ...settingsDesc, marginBottom: 8 }}>Focus session timer: a soft chime when time is up.</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[10, 15, 25, 45, 60].map((m) => (
            <button key={m} onClick={() => { startFocusSession(m); showToast(`${m}-minute focus session started`); }} style={{ ...ghostBtn, fontSize: 12, padding: "7px 16px" }}>
              {m} min
            </button>
          ))}
        </div>
      </div>

      <div style={settingsSection}>
        <div style={settingsTitle}>Library</div>
        <div style={settingsDesc}>
          To add a book, put the file (PDF, EPUB, DOCX, TXT, Markdown or HTML) in the <code>books/</code> folder
          and run <code>npm run import</code>, then refresh.
        </div>
        {(books ?? []).map((b) => (
          <div key={b.id} style={{ ...settingsDesc, marginBottom: 6 }}>
            <b>{b.title}</b>{b.author ? ` — ${b.author}` : ""} · {b.chapters} chapters · {readingTime(b.words)} · {b.format.toUpperCase()}
          </div>
        ))}
      </div>

      {/* Data */}
      <div style={settingsSection}>
        <div style={settingsTitle}>Your Data</div>
        <div style={settingsDesc}>
          Your notes, favourites and reading positions are stored privately on this device. Nothing is sent to any server. 
          You can export them at any time.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            id="export-json-btn"
            onClick={handleExportJSON}
            style={{ ...ghostBtn, fontSize: 12, padding: "7px 16px" }}
          >
            Export JSON
          </button>
          <button
            id="export-md-btn"
            onClick={handleExportMD}
            style={{ ...ghostBtn, fontSize: 12, padding: "7px 16px" }}
          >
            Export Markdown
          </button>
        </div>
      </div>

      {/* Danger zone */}
      <div style={{ ...settingsSection, borderColor: "rgba(185,28,28,0.15)" }}>
        <div style={{ ...settingsTitle, color: "#b91c1c" }}>Clear All Data</div>
        <div style={settingsDesc}>
          Permanently deletes all your notes and saved passages from this device. This cannot be undone.
        </div>
        {!confirmClear ? (
          <button
            onClick={() => setConfirmClear(true)}
            style={{ ...ghostBtn, fontSize: 12, padding: "7px 16px", borderColor: "#b91c1c", color: "#b91c1c" }}
          >
            Clear all notes
          </button>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleClearData}
              style={{
                ...ghostBtn,
                fontSize: 12,
                padding: "7px 16px",
                background: "#b91c1c",
                color: "#fff",
                border: "none",
              }}
            >
              Yes, delete everything
            </button>
            <button
              onClick={() => setConfirmClear(false)}
              style={{ ...ghostBtn, fontSize: 12, padding: "7px 16px" }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* About */}
      <div style={settingsSection}>
        <div style={settingsTitle}>About</div>
        <div style={settingsDesc}>
          Book Reader is a distraction-free reader built for focus. Books you import stay
          the property of their authors and publishers.
        </div>
        <div
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 11,
            color: "var(--on-surface-var)",
            letterSpacing: "0.04em",
          }}
        >
          Local-first · Offline-ready · Privacy-first
        </div>
      </div>
    </div>
  );
}
