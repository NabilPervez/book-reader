import { useState, useEffect, useCallback, useRef } from "react";
import {
  dbGetReflection,
  dbSaveReflection,
} from "../lib/db.js";
import { pageWrap, textarea, label, ghostBtn, skeletonLine } from "../lib/styles.js";
import { loadChapterText, setLastChapter } from "../lib/library.js";

import TextBody, { Composer, EntryCard } from './TextBody.jsx';
import { dbGetEntries, dbSaveEntry, dbDeleteEntry } from '../lib/db.js';

// ── Reflection panel ──────────────────────────────────────────────────────────
function ReflectionPanel({ chapter }) {
  const [notes,       setNotes]       = useState("");
  const [questions,        setQuestions]        = useState("");
  const [actionItems, setActionItems] = useState([""]);
  const [saving,      setSaving]      = useState(false);
  const [loaded,      setLoaded]      = useState(false);
  const debounceRef = useRef(null);

  // Load existing reflection
  useEffect(() => {
    setLoaded(false);
    dbGetReflection(chapter.id).then((r) => {
      if (r) {
        setNotes(r.notes ?? "");
        setQuestions(r.questions ?? "");
        setActionItems(r.actionItems?.length ? r.actionItems : [""]);
      } else {
        setNotes("");
        setQuestions("");
        setActionItems([""]);
      }
      setLoaded(true);
    });
  }, [chapter.id]);

  // Auto-save with 300ms debounce
  const save = useCallback(
    (n, d, ai) => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setSaving(true);
        try {
          await dbSaveReflection({ nameId: chapter.id, notes: n, questions: d, actionItems: ai });
        } finally {
          setSaving(false);
        }
      }, 300);
    },
    [chapter.id]
  );

  const handleNotes = (v) => { setNotes(v); save(v, questions, actionItems); };
  const handleQuestions  = (v) => { setQuestions(v);  save(notes, v, actionItems); };
  const handleActionItem = (idx, v) => {
    const next = [...actionItems];
    next[idx] = v;
    setActionItems(next);
    save(notes, questions, next);
  };
  const addActionItem = () => {
    const next = [...actionItems, ""];
    setActionItems(next);
    save(notes, questions, next);
  };
  const removeActionItem = (idx) => {
    const next = actionItems.filter((_, i) => i !== idx);
    setActionItems(next.length ? next : [""]);
    save(notes, questions, next.length ? next : [""]);
  };

  if (!loaded) {
    return (
      <div style={{ padding: "24px 0" }}>
        <div style={skeletonLine(60)} />
        <div style={{ ...skeletonLine(90), marginBottom: 8 }} />
        <div style={skeletonLine(75)} />
        <div style={skeletonLine(50)} />
      </div>
    );
  }

  const fieldStyle = {
    ...textarea,
    display: "block",
    width: "100%",
    minHeight: 100,
    marginBottom: 4,
    fontSize: "inherit",
  };

  return (
    <div style={{ paddingTop: 8 }}>
      {/* Auto-save indicator */}
      <div
        style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 11,
          color: "var(--on-surface-var)",
          marginBottom: 20,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: saving ? "var(--accent)" : "var(--primary)",
            display: "inline-block",
            transition: "background 0.3s ease",
          }}
        />
        {saving ? "Saving…" : "Auto-saved to your device"}
      </div>

      {/* Personal Notes */}
      <div style={{ marginBottom: 28 }}>
        <label style={label} htmlFor={`notes-${chapter.id}`}>
          ✦ Key takeaways
        </label>
        <textarea
          id={`notes-${chapter.id}`}
          value={notes}
          onChange={(e) => handleNotes(e.target.value)}
          placeholder="The ideas worth remembering from this chapter, in your own words."
          style={fieldStyle}
          rows={5}
          onFocus={(e) => (e.target.style.borderColor = "var(--primary)")}
          onBlur={(e)  => (e.target.style.borderColor = "var(--outline-ghost)")}
        />
      </div>

      {/* Action Items */}
      <div style={{ marginBottom: 28 }}>
        <label style={label}>✴ How I'll use it</label>
        <p
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 12,
            color: "var(--on-surface-var)",
            marginBottom: 12,
          }}
        >
          Small, concrete things you will try this week.
        </p>
        {actionItems.map((item, idx) => (
          <div
            key={idx}
            style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 10 }}
          >
            <span
              style={{
                marginTop: 12,
                fontSize: 14,
                color: "var(--primary)",
                flexShrink: 0,
              }}
            >
              ▸
            </span>
            <textarea
              value={item}
              onChange={(e) => handleActionItem(idx, e.target.value)}
              placeholder={`Action item ${idx + 1}…`}
              style={{ ...fieldStyle, minHeight: 48, marginBottom: 0, flex: 1 }}
              rows={2}
              onFocus={(e) => (e.target.style.borderColor = "var(--primary)")}
              onBlur={(e)  => (e.target.style.borderColor = "var(--outline-ghost)")}
            />
            {actionItems.length > 1 && (
              <button
                onClick={() => removeActionItem(idx)}
                style={{
                  marginTop: 10,
                  background: "none",
                  border: "none",
                  color: "var(--on-surface-var)",
                  fontSize: 16,
                  cursor: "pointer",
                  flexShrink: 0,
                  lineHeight: 1,
                  opacity: 0.5,
                }}
                aria-label="Remove action item"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        <button
          onClick={addActionItem}
          style={{
            ...ghostBtn,
            fontSize: 12,
            padding: "6px 14px",
            marginTop: 4,
          }}
        >
          + Add action item
        </button>
      </div>

      {/* Open questions */}
      <div style={{ marginBottom: 28 }}>
        <label style={label} htmlFor={`questions-${chapter.id}`}>
          ? Questions I still have
        </label>
        <p
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 12,
            color: "var(--on-surface-var)",
            marginBottom: 12,
          }}
        >
          Anything you disagree with, want to look up, or expect the book to answer later.
        </p>
        <textarea
          id={`questions-${chapter.id}`}
          value={questions}
          onChange={(e) => handleQuestions(e.target.value)}
          placeholder="I wonder whether…"
          style={{ ...fieldStyle, minHeight: 80 }}
          rows={4}
          onFocus={(e) => (e.target.style.borderColor = "var(--primary)")}
          onBlur={(e)  => (e.target.style.borderColor = "var(--outline-ghost)")}
        />
      </div>
    </div>
  );
}

// ── Notes view: everything you've written about this chapter ─────────────────
function ChapterReflections({ chapter, name, meaning, onJump, showToast }) {
  const [entries, setEntries] = useState(null);
  const [editing, setEditing] = useState(null);
  const reload = useCallback(() => dbGetEntries(chapter.id).then(setEntries).catch(() => setEntries([])), [chapter.id]);
  useEffect(() => { reload(); }, [reload]);

  const save = async ({ text, tags }) => {
    await dbSaveEntry({ ...editing, text, tags });
    setEditing(null); reload();
    showToast?.("Note updated ✦", "success");
  };
  const remove = async (e) => {
    if (!confirm("Delete this note?")) return;
    await dbDeleteEntry(e.id); reload();
  };

  const passages = entries?.filter((e) => e.block >= 0) ?? [];
  const older = entries?.filter((e) => e.block < 0) ?? []; // chapter-level entries
  const reflected = passages.filter((e) => e.text).length;
  const saved = passages.filter((e) => !e.text).length;

  return (
    <div className="rf">
      <header className="rf-head">
        <div className="tr-num">Chapter {chapter.number}</div>
        <h1>{name}</h1>
        {meaning && <div className="tr-meaning">{meaning}</div>}
        {entries && (
          <p className="rf-stats">
            {reflected} note{reflected === 1 ? "" : "s"} · {saved} saved passage{saved === 1 ? "" : "s"}
          </p>
        )}
      </header>

      <section className="rf-section">
        <div className="rf-h">Passages you wrote about</div>
        {entries && passages.length === 0 && (
          <div className="rf-empty-card">
            <p>As you read, tap <b>✎</b> on any passage to write a note about it, or <b>♡</b> to save it.</p>
            <p>Everything you write appears here, linked to its passage.</p>
            <button className="rf-new" onClick={() => onJump(null)}>Start reading</button>
          </div>
        )}
        {passages.map((e) =>
          editing?.id === e.id ? (
            <Composer key={e.id} initial={e} onSave={save} onCancel={() => setEditing(null)} />
          ) : (
            <EntryCard key={e.id} e={e} showQuote onOpen={() => onJump(e.block)} onEdit={() => setEditing(e)} onDelete={() => remove(e)} />
          )
        )}
      </section>

      <section className="rf-section">
        <div className="rf-h">Chapter summary</div>
        <p className="rf-lead">After reading, capture what stays with you: the key ideas, how you'll use them, and what you're still wondering about.</p>
        <ReflectionPanel chapter={chapter} />
        {older.map((e) =>
          editing?.id === e.id ? (
            <Composer key={e.id} initial={e} onSave={save} onCancel={() => setEditing(null)} />
          ) : (
            <EntryCard key={e.id} e={e} onEdit={() => setEditing(e)} onDelete={() => remove(e)} />
          )
        )}
      </section>
    </div>
  );
}

// ── Reader Tab ────────────────────────────────────────────────────────────────
export default function ReaderTab({ book, chapter, onBack, onNextChapter, showToast, initialView = "read", jumpBlock = null }) {
  const [activeView, setActiveView] = useState(initialView); // "read" | "reflect"
  const [jump, setJump] = useState({ block: jumpBlock, n: 0 });
  const [text, setText] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => { setActiveView(initialView); }, [chapter?.id, initialView]);
  useEffect(() => { setJump((j) => ({ block: jumpBlock, n: j.n + 1 })); }, [chapter?.id, jumpBlock]);

  useEffect(() => {
    if (!chapter) return;
    let alive = true;
    setText(null); setFailed(false);
    setLastChapter(chapter.bookId, chapter.id);
    loadChapterText(chapter)
      .then((t) => alive && setText(t))
      .catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [chapter?.id]);

  const view = (v) => { setActiveView(v); window.scrollTo(0, 0); };
  const jumpTo = (block) => { setJump((j) => ({ block, n: j.n + 1 })); view("read"); };

  if (!chapter) {
    return (
      <div style={{ ...pageWrap, paddingTop: 48 }}>
        <div className="rf-empty-card" style={{ textAlign: "center", marginTop: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✦</div>
          <p>Choose a chapter from the contents to start reading.</p>
          <button className="rf-new" onClick={onBack}>Open contents</button>
        </div>
      </div>
    );
  }

  const [name, meaning] = (text?.title ?? chapter.title)
    .replace(/\s*\(\d+(?:[–-]\d+)?\)\s*$/, "").split(/\s+–\s+/);

  return (
    <div style={pageWrap}>
      {activeView === "reflect" ? (
        <>
        <div className="rd-bar">
          <button className="rd-back" onClick={() => view("read")} aria-label="Back to reading">←</button>
          <div className="rd-title">My notes</div>
          <button className="rd-text-btn" onClick={() => view("read")}>Read</button>
        </div>
        <ChapterReflections chapter={chapter} name={name} meaning={meaning} onJump={jumpTo} showToast={showToast} />
        </>
      ) : text ? (
        <TextBody
          key={`${chapter.id}:${jump.n}`}
          book={book} chapter={chapter} text={text} jumpBlock={jump.block} onBack={onBack}
          onReflect={() => view("reflect")} onNextChapter={onNextChapter} showToast={showToast}
        />
      ) : (
        <>
          <div className="rd-bar">
            <button className="rd-back" onClick={onBack} aria-label="Back to contents">←</button>
            <div className="rd-title">{name}</div>
          </div>
          {failed ? (
            <div className="rf-empty-card" style={{ marginTop: 32 }}>
              <p>This chapter's text could not be loaded. Re-run <code>npm run import</code> and refresh.</p>
            </div>
          ) : (
            <div style={{ padding: "40px 0" }}>
              <div style={skeletonLine(60)} /><div style={skeletonLine(90)} /><div style={skeletonLine(75)} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
