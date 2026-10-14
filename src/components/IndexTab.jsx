import { useState, useEffect, useMemo } from "react";
import { dbGetAllReflections, dbGetAllEntries } from "../lib/db.js";
import { card, pageWrap, pageTitle, pageSubtitle, skeletonLine } from "../lib/styles.js";
import { readingTime, getLastChapter } from "../lib/library.js";
import { startFocusSession } from "./FocusTimer.jsx";

// ── Skeleton loader ───────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div style={{ ...card, marginBottom: 12 }}>
      <div style={skeletonLine(45)} />
      <div style={skeletonLine(25)} />
      <div style={{ ...skeletonLine(90), marginTop: 12 }} />
      <div style={skeletonLine(70)} />
    </div>
  );
}

// ── Chapter Card ─────────────────────────────────────────────────────────────────
function readProgress(id) {
  try { return JSON.parse(localStorage.getItem(`progress:${id}`) || "null"); } catch { return null; }
}

function progressLabel(p, count) {
  const bits = [];
  if (!p || p.max < 0) bits.push("Not started");
  else if (p.max >= p.total) bits.push("Finished");
  else bits.push(`${p.max + 1} of ${p.total} passages`);
  if (count) bits.push(`${count} note${count === 1 ? "" : "s"}`);
  return bits.join(" · ");
}

function ChapterCard({ chapter, hasReflection, reflectionCount = 0, onOpen }) {
  const progress = readProgress(chapter.id);
  const finished = progress && progress.max >= progress.total;
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...card,
        display: "flex",
        alignItems: "center",
        gap: 16,
        textAlign: "left",
        width: "100%",
        cursor: "pointer",
        border: "1px solid var(--outline-ghost)",
        transition: "transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease",
        transform: hovered ? "translateY(-1px)" : "translateY(0)",
        boxShadow: hovered ? "0 6px 28px var(--shadow)" : "0 2px 12px var(--shadow)",
        borderColor: hovered ? "var(--outline)" : "var(--outline-ghost)",
      }}
    >
      {/* Number badge */}
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          background: hasReflection || finished
            ? "linear-gradient(135deg, var(--primary) 0%, var(--primary-dim) 100%)"
            : "var(--surface-low)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 700,
          fontFamily: "'DM Sans', sans-serif",
          color: hasReflection || finished ? "var(--on-primary)" : "var(--on-surface-var)",
          flexShrink: 0,
          transition: "background 0.3s ease",
        }}
      >
        {String(chapter.number).padStart(2, "0")}
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {(() => {
          const parts = chapter.title.split(" – ");
          const name     = parts[0];
          const subtitle = parts.slice(1).join(" – ");
          return (
            <>
              <div
                style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontWeight: 600,
                  fontSize: 17,
                  color: "var(--on-surface)",
                  marginBottom: subtitle ? 1 : 2,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {name}
              </div>
              {subtitle && (
                <div
                  style={{
                    fontFamily: "'Cormorant Garamond', serif",
                    fontSize: 14,
                    fontWeight: 500,
                    color: "var(--on-surface-var)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    marginBottom: 2,
                  }}
                >
                  {subtitle}
                </div>
              )}
              <div
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 12,
                  color: "var(--on-surface-var)",
                  marginTop: 2,
                }}
              >
                {readingTime(chapter.words)} · {progressLabel(progress, reflectionCount)}
              </div>
            </>
          );
        })()}
      </div>

      {/* Status badges */}
      <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
        {(hasReflection || finished) && (
          <span
            style={{
              background: "var(--primary)",
              color: "var(--on-primary)",
              fontSize: 10,
              fontWeight: 700,
              fontFamily: "'DM Sans', sans-serif",
              padding: "2px 8px",
              borderRadius: 40,
              letterSpacing: "0.05em",
            }}
          >
            ✓
          </span>
        )}
        <span
          style={{
            fontSize: 16,
            color: "var(--on-surface-var)",
            opacity: 0.5,
          }}
        >
          ›
        </span>
      </div>
    </button>
  );
}

// ── Filter chips ──────────────────────────────────────────────────────────────
function FilterChip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 14px",
        borderRadius: 40,
        border: "1px solid",
        borderColor: active ? "var(--primary)" : "var(--outline-ghost)",
        background: active ? "var(--primary)" : "transparent",
        color: active ? "var(--on-primary)" : "var(--on-surface-var)",
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        transition: "all 0.2s ease",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

// ── Index Tab ─────────────────────────────────────────────────────────────────
export default function IndexTab({ book, chapters, onLibrary, onOpenChapter, onContinue }) {
  const [reflectedIds, setReflectedIds] = useState(new Set());
  const [counts, setCounts] = useState({});
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [filter, setFilter]     = useState("all"); // all | reflected | progress | unread

  useEffect(() => {
    Promise.all([dbGetAllReflections(), dbGetAllEntries()])
      .then(([refs, entries]) => {
        const hasContent = (r) =>
          (r.notes && r.notes.trim()) ||
          (r.questions && r.questions.trim()) ||
          (r.actionItems && r.actionItems.some((a) => a.trim()));
        const c = {};
        entries.filter((e) => e.text).forEach((e) => (c[e.nameId] = (c[e.nameId] ?? 0) + 1));
        setCounts(c);
        const mine = (id) => id.startsWith(`${book?.id}:`);
        setReflectedIds(new Set([...refs.filter(hasContent).map((r) => r.nameId), ...Object.keys(c)].filter(mine)));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [book?.id]);

  const filtered = useMemo(() => {
    if (!chapters) return [];
    return chapters.filter((ch) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        ch.title.toLowerCase().includes(q) ||
        ch.title.normalize("NFD").replace(/[̀-ͯ'‘’]/g, "").toLowerCase().includes(q.replace(/['‘’]/g, ""));

      const matchesFilter =
        filter === "all" ||
        (filter === "reflected" && reflectedIds.has(ch.id)) ||
        (filter === "unread"    && !reflectedIds.has(ch.id)) ||
        (filter === "progress" && (() => { const p = readProgress(ch.id); return p && p.max >= 0 && p.max < p.total; })());

      return matchesSearch && matchesFilter;
    });
  }, [chapters, search, filter, reflectedIds]);

  // "Continue reading" card: the chapter you read most recently
  const continueCard = useMemo(() => {
    if (!chapters) return null;
    const ch = chapters.find((c) => c.id === getLastChapter(book?.id));
    if (!ch) return null;
    return { ch, p: readProgress(ch.id) };
  }, [chapters, book?.id]);

  const reflectedCount = reflectedIds.size;
  const total          = chapters?.length ?? 0;

  return (
    <div style={pageWrap}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "var(--primary)",
            marginBottom: 6,
          }}
        >
          <button className="ix-lib-link" onClick={onLibrary}>← Library</button>
          {book?.author ? ` · ${book.author}` : ""}
        </div>
        <h1 style={{ ...pageTitle, fontSize: 32, marginBottom: 8 }}>
          {book?.title}
        </h1>
        <p style={pageSubtitle}>
          {loading ? "Loading progress…" : `${total} chapters · ${readingTime(book?.words)} · ${reflectedCount} with notes`}
        </p>

        {/* Progress bar */}
        {!loading && total > 0 && (
          <div
            style={{
              height: 3,
              background: "var(--outline-ghost)",
              borderRadius: 3,
              marginBottom: 20,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${(reflectedCount / total) * 100}%`,
                background: "linear-gradient(90deg, var(--primary), var(--accent))",
                borderRadius: 3,
                transition: "width 0.6s ease",
              }}
            />
          </div>
        )}
      </div>

      {continueCard && (
        <button className="ix-continue" onClick={() => onContinue(continueCard.ch)}>
          <span className="ix-continue-label">Continue reading</span>
          <span className="ix-continue-name">{continueCard.ch.title.split(" – ")[0]}</span>
          <span className="ix-continue-meta">
            {progressLabel(continueCard.p, counts[continueCard.ch.id])}
          </span>
          <span className="ix-continue-go">→</span>
        </button>
      )}

      <div className="ix-focus">
        <span>Start a focus session:</span>
        {[10, 25, 45].map((m) => (
          <button key={m} onClick={() => startFocusSession(m)}>{m} min</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ position: "relative", marginBottom: 14 }}>
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
          placeholder="Search chapters…"
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
            transition: "border-color 0.2s ease",
          }}
          onFocus={(e) => (e.target.style.borderColor = "var(--primary)")}
          onBlur={(e)  => (e.target.style.borderColor = "var(--outline-ghost)")}
        />
      </div>

      {/* Filter chips */}
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 22,
          overflowX: "auto",
          paddingBottom: 4,
        }}
      >
        {[
          { id: "all",        label: "All" },
          { id: "progress",   label: "In progress" },
          { id: "reflected",  label: `With notes (${reflectedCount})` },
          { id: "unread",     label: "No notes yet" },
        ].map((f) => (
          <FilterChip
            key={f.id}
            label={f.label}
            active={filter === f.id}
            onClick={() => setFilter(f.id)}
          />
        ))}
      </div>

      {/* Chapter list */}
      {loading ? (
        [1, 2, 3, 4, 5].map((k) => <SkeletonCard key={k} />)
      ) : filtered.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "60px 20px",
            color: "var(--on-surface-var)",
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 14,
          }}
        >
          <div style={{ fontSize: 36, marginBottom: 12 }}>⌕</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            No chapters match your search
          </div>
          <div style={{ fontSize: 12 }}>
            Try a different keyword or filter
          </div>
        </div>
      ) : (
        filtered.map((ch) => (
          <ChapterCard
            key={ch.id}
            chapter={ch}
            hasReflection={reflectedIds.has(ch.id)}
            reflectionCount={counts[ch.id] ?? 0}
            onOpen={() => onOpenChapter(ch)}
          />
        ))
      )}
    </div>
  );
}
