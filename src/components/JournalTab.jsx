import { useState, useEffect, useMemo } from "react";
import { dbGetAllReflections, dbDeleteReflection, dbGetAllEntries, dbDeleteEntry } from "../lib/db.js";
import { EntryCard } from "./TextBody.jsx";
import { pageWrap, pageTitle, pageSubtitle, card, chipBtn, skeletonLine } from "../lib/styles.js";

function ReflectionCard({ reflection, chapter, bookTitle, onDelete, onGoToReflection }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const hasNotes   = reflection.notes?.trim();
  const hasQuestions    = reflection.questions?.trim();
  const hasActions = reflection.actionItems?.some((a) => a?.trim());

  const date = new Date(reflection.updatedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div style={card}>
      {/* Header row */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 12,
          gap: 10,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 17,
              fontWeight: 600,
              color: "var(--on-surface)",
              marginBottom: 2,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {chapter?.title ?? reflection.nameId.split(":").pop().replace(/^\d+-/, "").replace(/-/g, " ")}
          </div>
          <div
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 11,
              color: "var(--on-surface-var)",
            }}
          >
            {bookTitle ? `${bookTitle} · ` : ""}Updated {date}
          </div>
        </div>

        {/* Badges */}
        <div style={{ display: "flex", gap: 4, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {hasNotes   && <span style={{ fontSize: 10, background: "var(--surface-low)", borderRadius: 40, padding: "2px 8px", color: "var(--on-surface-var)", fontFamily: "'DM Sans',sans-serif", fontWeight: 600 }}>Notes</span>}
          {hasQuestions    && <span style={{ fontSize: 10, background: "var(--surface-low)", borderRadius: 40, padding: "2px 8px", color: "var(--on-surface-var)", fontFamily: "'DM Sans',sans-serif", fontWeight: 600 }}>Questions</span>}
          {hasActions && <span style={{ fontSize: 10, background: "var(--surface-low)", borderRadius: 40, padding: "2px 8px", color: "var(--on-surface-var)", fontFamily: "'DM Sans',sans-serif", fontWeight: 600 }}>Actions</span>}
        </div>
      </div>

      {/* Preview snippet */}
      {hasNotes && (
        <p
          style={{
            fontFamily: "'Merriweather', Georgia, serif",
            fontSize: 13,
            lineHeight: 1.7,
            color: "var(--on-surface-var)",
            marginBottom: 14,
          }}
        >
          "{reflection.notes.trim()}"
        </p>
      )}

      {/* Action items – show all */}
      {hasActions && (
        <div style={{ marginBottom: 14 }}>
          {reflection.actionItems
            .filter((a) => a?.trim())
            .map((a, idx) => (
              <div
                key={idx}
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 12,
                  color: "var(--on-surface-var)",
                  display: "flex",
                  gap: 6,
                  marginBottom: 4,
                }}
              >
                <span style={{ color: "var(--primary)", flexShrink: 0 }}>▸</span>
                <span>{a}</span>
              </div>
            ))}
        </div>
      )}

      {/* Questions */}
      {hasQuestions && (
        <div style={{ marginBottom: 14 }}>
          <div
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--primary)",
              marginBottom: 4,
            }}
          >
            ? Questions
          </div>
          <p
            style={{
              fontFamily: "'Merriweather', Georgia, serif",
              fontSize: 12,
              lineHeight: 1.7,
              color: "var(--on-surface-var)",
              margin: 0,
              fontStyle: "italic",
            }}
          >
            {reflection.questions.trim()}
          </p>
        </div>
      )}

      {/* Buttons */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={() => onGoToReflection(reflection.nameId)}
          style={{ ...chipBtn, background: "var(--primary)", color: "var(--on-primary)", fontWeight: 600 }}
        >
          Open & Edit →
        </button>

        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            style={{ ...chipBtn, color: "#b91c1c" }}
          >
            Delete
          </button>
        ) : (
          <>
            <button
              onClick={() => onDelete(reflection.nameId)}
              style={{ ...chipBtn, background: "#b91c1c", color: "#fff", fontWeight: 600 }}
            >
              Confirm delete
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              style={chipBtn}
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Journal Tab ───────────────────────────────────────────────────────────────
export default function JournalTab({ book, books, chapters, onGoToChapter, showToast }) {
  const [reflections, setReflections] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState("");
  const [filterHasActions, setFilterHasActions] = useState(false);
  const [entries, setEntries] = useState([]);
  const [show, setShow] = useState("all"); // all | reflections | favorites
  const [scope, setScope] = useState(book ? "book" : "all"); // book | all
  const inScope = (id) => scope === "all" || id?.startsWith(`${book?.id}:`);
  const bookTitles = useMemo(() => Object.fromEntries((books ?? []).map((b) => [b.id, b.title])), [books]);
  const titleOf = (id) => bookTitles[id?.split(":")[0]];
  const chapterName = (id) => (chapterMap[id]?.title ?? id.split(":").pop().replace(/^\d+-/, "").replace(/-/g, " ")).split(" – ")[0];
  const label = (id) => (scope === "all" ? `${titleOf(id) ?? ""} · ${chapterName(id)}` : chapterName(id));

  const load = () => {
    dbGetAllReflections().then((data) => {
      const hasContent = (r) =>
        (r.notes && r.notes.trim()) ||
        (r.questions && r.questions.trim()) ||
        (r.actionItems && r.actionItems.some((a) => a?.trim()));
      setReflections(data.filter(hasContent));
      setLoading(false);
    });
  };

  const loadEntries = () => dbGetAllEntries().then(setEntries).catch(() => {});
  useEffect(() => { load(); loadEntries(); }, []);

  const chapterMap = useMemo(() => {
    const m = {};
    if (chapters) chapters.forEach((c) => (m[c.id] = c));
    return m;
  }, [chapters]);

  const filtered = useMemo(() => {
    return reflections.filter((r) => {
      if (!inScope(r.nameId)) return false;
      const ch = chapterMap[r.nameId];
      const q  = search.toLowerCase();
      const matchesSearch =
        !q ||
        (ch?.title.toLowerCase().includes(q)) ||
        (r.notes?.toLowerCase().includes(q)) ||
        (r.questions?.toLowerCase().includes(q));
      const matchesAction =
        !filterHasActions ||
        r.actionItems?.some((a) => a?.trim());
      return matchesSearch && matchesAction;
    });
  }, [reflections, search, filterHasActions, chapterMap, scope, book?.id]);

  const filteredEntries = useMemo(() => {
    const q = search.toLowerCase();
    return entries.filter((e) => inScope(e.nameId)).filter((e) =>
      !q || e.text?.toLowerCase().includes(q) || e.quote?.toLowerCase().includes(q) ||
      e.tags?.some((t) => t.toLowerCase().includes(q)) || chapterMap[e.nameId]?.title.toLowerCase().includes(q));
  }, [entries, search, chapterMap, scope, book?.id]);

  const written = filteredEntries.filter((e) => e.text);
  const favs = filteredEntries.filter((e) => !e.text);

  const deleteEntry = async (id) => {
    if (!confirm("Delete this note?")) return;
    await dbDeleteEntry(id);
    showToast("Note deleted", "info");
    loadEntries();
  };

  const handleDelete = async (nameId) => {
    await dbDeleteReflection(nameId);
    showToast("Chapter summary deleted", "info");
    load();
  };

  return (
    <div style={pageWrap}>
      <h1 style={pageTitle}>My Notes</h1>
      <p style={pageSubtitle}>
        {loading
          ? "Loading…"
          : `${filteredEntries.filter((e) => e.text).length + filtered.length} notes · ${filteredEntries.filter((e) => !e.text).length} saved passages`}
      </p>

      {book && (
        <div className="jr-chips" role="tablist" aria-label="Which books">
          <button role="tab" aria-selected={scope === "book"} className={scope === "book" ? "on" : ""} onClick={() => setScope("book")}>{book.title}</button>
          <button role="tab" aria-selected={scope === "all"} className={scope === "all" ? "on" : ""} onClick={() => setScope("all")}>All books</button>
        </div>
      )}

      {/* Search */}
      <div style={{ position: "relative", marginBottom: 12 }}>
        <span
          style={{
            position: "absolute",
            left: 14,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--on-surface-var)",
            fontSize: 15,
            pointerEvents: "none",
          }}
        >
          ⌕
        </span>
        <input
          type="search"
          placeholder="Search your notes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%",
            background: "var(--surface-lowest)",
            border: "1px solid var(--outline-ghost)",
            borderRadius: 12,
            padding: "12px 14px 12px 40px",
            color: "var(--on-surface)",
            fontSize: 14,
            fontFamily: "'DM Sans', sans-serif",
            outline: "none",
          }}
        />
      </div>

      {/* Filter */}
      <div style={{ marginBottom: 22 }}>
        <button
          onClick={() => setFilterHasActions((v) => !v)}
          style={{
            padding: "6px 14px",
            borderRadius: 40,
            border: "1px solid",
            borderColor: filterHasActions ? "var(--primary)" : "var(--outline-ghost)",
            background: filterHasActions ? "var(--primary)" : "transparent",
            color: filterHasActions ? "var(--on-primary)" : "var(--on-surface-var)",
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
        >
          Has action items
        </button>
      </div>

      {/* Content */}
      <div className="jr-chips" role="tablist" aria-label="Show">
        {[
          ["all", "All"],
          ["reflections", `Notes (${written.length})`],
          ["favorites", `Favourites (${favs.length})`],
        ].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={show === id} className={show === id ? "on" : ""} onClick={() => setShow(id)}>
            {label}
          </button>
        ))}
      </div>

      {show !== "favorites" && written.length > 0 && (
        <div className="rf" style={{ marginBottom: 28 }}>
          <div className="rf-h">Passage notes</div>
          {written.map((e) => (
            <EntryCard
              key={e.id} e={e} showQuote
              chapterLabel={label(e.nameId)}
              onOpen={e.block >= 0 ? () => onGoToChapter(e.nameId, e.block) : undefined}
              onDelete={() => deleteEntry(e.id)}
            />
          ))}
          {filtered.length > 0 && <div className="rf-h" style={{ marginTop: 24 }}>Chapter summaries</div>}
        </div>
      )}

      {show === "favorites" ? null : loading ? (
        [1, 2, 3].map((k) => (
          <div key={k} style={{ ...card, marginBottom: 12 }}>
            <div style={skeletonLine(50)} />
            <div style={skeletonLine(25)} />
            <div style={{ ...skeletonLine(90), marginTop: 12 }} />
            <div style={skeletonLine(70)} />
          </div>
        ))
      ) : filtered.length === 0 && filteredEntries.length > 0 ? null : filtered.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "60px 20px",
            color: "var(--on-surface-var)",
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 14,
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 14 }}>
            {reflections.length === 0 ? "✦" : "⌕"}
          </div>
          <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 15, color: "var(--on-surface)" }}>
            {reflections.length === 0
              ? "No notes yet"
              : "No matching notes"}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.7, maxWidth: 260, margin: "0 auto" }}>
            {reflections.length === 0
              ? "While reading, tap ✎ on a passage to write a note or ♡ to save it. Everything shows up here."
              : "Try a different search term."}
          </div>
        </div>
      ) : (
        filtered.map((r) => (
          <ReflectionCard
            key={r.nameId}
            reflection={r}
            chapter={chapterMap[r.nameId]}
            bookTitle={scope === "all" ? titleOf(r.nameId) : null}
            onDelete={handleDelete}
            onGoToReflection={onGoToChapter}
          />
        ))
      )}

      {show !== "reflections" && favs.length > 0 && (
        <div className="rf" style={{ marginTop: 28 }}>
          <div className="rf-h">Favourite passages</div>
          {favs.map((e) => (
            <EntryCard
              key={e.id} e={e} showQuote
              chapterLabel={label(e.nameId)}
              onOpen={() => onGoToChapter(e.nameId, e.block)}
              onDelete={() => deleteEntry(e.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
