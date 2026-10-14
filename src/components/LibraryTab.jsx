import { useMemo, useState } from "react";
import { pageWrap, pageTitle, pageSubtitle, skeletonLine } from "../lib/styles.js";
import { bookProgress, getLastOpened, readingTime } from "../lib/library.js";

// A generated cover: two hues picked from the title so every book looks distinct
function hueOf(s) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 360;
}

export function Cover({ book, size = "md" }) {
  const h = hueOf(book.title);
  return (
    <div
      className={`lb-cover lb-cover-${size}`}
      style={{ background: `linear-gradient(150deg, hsl(${h} 38% 30%), hsl(${(h + 40) % 360} 45% 18%))` }}
      aria-hidden="true"
    >
      <div className="lb-cover-title">{book.title}</div>
      {book.author && <div className="lb-cover-author">{book.author}</div>}
    </div>
  );
}

function BookCard({ book, onOpen }) {
  const p = bookProgress(book);
  const pct = Math.round(p.fraction * 100);
  return (
    <button className="lb-card" onClick={onOpen}>
      <Cover book={book} />
      <div className="lb-meta">
        <div className="lb-title">{book.title}</div>
        {book.author && <div className="lb-author">{book.author}</div>}
        <div className="lb-sub">
          {book.chapters} chapters · {readingTime(book.words)}
        </div>
        <div className="lb-bar" aria-label={`${pct}% finished`}><div style={{ width: `${pct}%` }} /></div>
        <div className="lb-sub">{p.started === 0 ? "Not started" : pct === 100 ? "Finished" : `${p.finished} of ${book.chapters} chapters done`}</div>
      </div>
    </button>
  );
}

export default function LibraryTab({ books, onOpenBook, onContinue }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("recent");

  const sorted = useMemo(() => {
    if (!books) return [];
    const list = books.filter((b) =>
      !q || `${b.title} ${b.author}`.toLowerCase().includes(q.toLowerCase()));
    if (sort === "title") return list.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === "added") return list.sort((a, b) => (b.addedAt ?? "").localeCompare(a.addedAt ?? ""));
    return list.sort((a, b) => getLastOpened(b.id) - getLastOpened(a.id) || (b.addedAt ?? "").localeCompare(a.addedAt ?? ""));
  }, [books, q, sort]);

  const current = useMemo(() => {
    if (!books?.length) return null;
    const recent = [...books].sort((a, b) => getLastOpened(b.id) - getLastOpened(a.id))[0];
    return getLastOpened(recent.id) ? recent : null;
  }, [books]);

  return (
    <div style={pageWrap}>
      <h1 style={{ ...pageTitle, fontSize: 32 }}>Library</h1>
      <p style={pageSubtitle}>
        {books == null ? "Loading…" : `${books.length} book${books.length === 1 ? "" : "s"}`}
      </p>

      {books == null && (
        <div style={{ padding: "24px 0" }}>
          <div style={skeletonLine(60)} /><div style={skeletonLine(80)} /><div style={skeletonLine(40)} />
        </div>
      )}

      {books?.length === 0 && (
        <div className="rf-empty-card lb-empty">
          <div style={{ fontSize: 40, marginBottom: 8 }}>📚</div>
          <p><b>Your library is empty.</b></p>
          <p>Put a PDF, EPUB, DOCX, TXT, Markdown or HTML file in the <code>books/</code> folder, then run:</p>
          <pre>npm run import</pre>
          <p>Refresh this page and the book appears here.</p>
        </div>
      )}

      {current && (
        <button className="lb-continue" onClick={() => onContinue(current)}>
          <Cover book={current} size="sm" />
          <span className="lb-continue-text">
            <span className="ix-continue-label">Continue reading</span>
            <span className="lb-continue-title">{current.title}</span>
          </span>
          <span className="ix-continue-go">→</span>
        </button>
      )}

      {books?.length > 3 && (
        <div className="lb-tools">
          <input type="search" placeholder="Search your books…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort books">
            <option value="recent">Recently read</option>
            <option value="added">Recently added</option>
            <option value="title">Title</option>
          </select>
        </div>
      )}

      <div className="lb-grid">
        {sorted.map((b) => <BookCard key={b.id} book={b} onOpen={() => onOpenBook(b)} />)}
      </div>
    </div>
  );
}
