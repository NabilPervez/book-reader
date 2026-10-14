import { useState, useEffect, useRef, useCallback, Fragment } from "react";
import { dbGetEntries, dbSaveEntry, dbDeleteEntry } from "../lib/db.js";
import { WORDS_PER_MINUTE } from "../lib/library.js";

// ── Reflowable text reader for imported chapters (public/library/<book>/<chapter>.json) ──
// Two modes: "focus" (one passage at a time, notes per passage) and "page" (scroll).

export const PRESET_TAGS = ["Insight", "Question", "Action", "Quote", "Agree", "Disagree", "Revisit"];

const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, String(v)); } catch {} },
};

// Bionic reading: bold the first part of each word so the eye skims more easily
const bionicOn = () => store.get("bionic", "0") === "1";
function Bionic({ text }) {
  return text.split(/(\s+)/).map((w, i) => {
    const m = w.match(/^([^\p{L}\p{N}]*)([\p{L}\p{N}][\p{L}\p{N}'’-]*)(.*)$/u);
    if (!m) return <Fragment key={i}>{w}</Fragment>;
    const [, pre, word, post] = m;
    const n = word.length <= 3 ? 1 : Math.ceil(word.length * 0.45);
    return <Fragment key={i}>{pre}<b className="bio">{word.slice(0, n)}</b>{word.slice(n)}{post}</Fragment>;
  });
}

// **bold**, *italic*, and [12:3] / [Source] style references → muted
export function Inline({ text }) {
  const bio = bionicOn();
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\](?=[\s.,;:]|$))/g);
  const body = (t) => (bio ? <Bionic text={t} /> : t);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4)
      return <strong key={i}>{body(part.slice(2, -2))}</strong>;
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2)
      return <em key={i}>{body(part.slice(1, -1))}</em>;
    if (/^\[[^\]]+\]$/.test(part) && /\d+:\d+|^\[[A-Z]/.test(part))
      return <span key={i} className="tr-ref">{part}</span>;
    return <Fragment key={i}>{body(part)}</Fragment>;
  });
}

const plain = (t) => t.replace(/\*/g, "");

/** Group blocks: consecutive list items become one "ol"; each group remembers the
 *  heading it sits under. Groups are the units of Focus mode. */
export function toUnits(blocks) {
  const units = [];
  let h2 = null, h3 = null;
  blocks.forEach((b, i) => {
    if (b.t === "h2") { h2 = b.text; h3 = null; return; }
    if (b.t === "h3") { h3 = b.text; return; }
    const last = units[units.length - 1];
    if ((b.t === "li" || b.t === "bullet") && last?.t === "ol" && last.items[0].t === b.t) {
      last.items.push({ ...b, i });
      return;
    }
    const unit = b.t === "li" || b.t === "bullet"
      ? { t: "ol", page: b.page, start: b.n, items: [{ ...b, i }] }
      : { ...b };
    units.push({ ...unit, i, h2, h3 });
  });
  return units;
}

function UnitBody({ u }) {
  if (u.t === "quote") return <blockquote><Inline text={u.text} /></blockquote>;
  if (u.t === "ol") {
    const List = u.items[0].t === "bullet" ? "ul" : "ol";
    return (
      <List start={u.start}>
        {u.items.map((it) => <li key={it.i}><Inline text={it.text} /></li>)}
      </List>
    );
  }
  return <p><Inline text={u.text} /></p>;
}

const unitQuote = (u) => plain(u.t === "ol" ? u.items.map((x) => x.text).join(" ") : u.text);

// ── Reflection composer (quran-reflect style: free text + tags) ─────────────────
export function Composer({ initial, onSave, onCancel }) {
  const [text, setText] = useState(initial?.text ?? "");
  const [tags, setTags] = useState(initial?.tags?.filter((t) => t !== "Favorite") ?? []);
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const toggle = (t) => setTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t]);
  return (
    <div className="rf-composer">
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What stood out? What do you think about it? How might you use it?"
        rows={4}
      />
      <div className="rf-tags">
        {PRESET_TAGS.map((t) => (
          <button key={t} type="button" className={tags.includes(t) ? "on" : ""} onClick={() => toggle(t)}>{t}</button>
        ))}
      </div>
      <div className="rf-actions">
        {onCancel && <button type="button" className="ghost" onClick={onCancel}>Cancel</button>}
        <button type="button" disabled={!text.trim()} onClick={() => onSave({ text: text.trim(), tags })}>Save note</button>
      </div>
    </div>
  );
}

export function EntryCard({ e, onEdit, onDelete, onOpen, showQuote, chapterLabel }) {
  const quote = showQuote && e.quote && (
    <div className="rf-quote">“{e.quote.length > 180 ? e.quote.slice(0, 180) + "…" : e.quote}”</div>
  );
  return (
    <div className="rf-entry">
      {chapterLabel && <div className="rf-entry-chapter">{chapterLabel}</div>}
      {onOpen && quote ? (
        <button className="rf-open" onClick={onOpen} aria-label="Go to this passage">
          {quote}<span className="rf-go">Go to passage →</span>
        </button>
      ) : quote}
      {e.text && <div className="rf-text">{e.text}</div>}
      <div className="rf-meta">
        {e.tags?.map((t) => <span key={t} className="rf-tag">{t === "Favorite" ? "♥" : t}</span>)}
        <span className="rf-date">{new Date(e.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
        {onEdit && e.text && <button onClick={onEdit}>Edit</button>}
        {onDelete && <button onClick={onDelete}>Delete</button>}
      </div>
    </div>
  );
}

// Top bar: back + chapter name
function ReaderBar({ onBack, name, bookTitle }) {
  return (
    <div className="rd-bar">
      <button className="rd-back" onClick={onBack} aria-label="Back to contents">←</button>
      <div className="rd-title">{name}{bookTitle && <span className="rd-book">{bookTitle}</span>}</div>
    </div>
  );
}

// Pinned row above the arrows: ♡ · Focus|Page · ✎
function ActionRow({ mode, onMode, left, right }) {
  return (
    <div className="dk-actions">
      <div className="dk-slot">{left}</div>
      <div className="tr-seg rd-seg" role="tablist" aria-label="Reading mode">
        <button role="tab" aria-selected={mode === "focus"} className={mode === "focus" ? "on" : ""} onClick={() => onMode("focus")}>Focus</button>
        <button role="tab" aria-selected={mode === "page"} className={mode === "page" ? "on" : ""} onClick={() => onMode("page")}>Page</button>
      </div>
      <div className="dk-slot">{right}</div>
    </div>
  );
}

export default function TextBody({ book, chapter, text, jumpBlock = null, onBack, onReflect, onNextChapter, showToast }) {
  const scale = Number(store.get("textScale", 1)) || 1; // set in Settings
  const [mode, setMode] = useState(() => (jumpBlock != null ? "focus" : store.get("readMode", "focus")));
  const [entries, setEntries] = useState([]);

  const units = toUnits(text.blocks);
  const [name, meaning] = text.title.replace(/\s*\(\d+(?:[–-]\d+)?\)\s*$/, "").split(/\s+–\s+/);

  const reload = useCallback(() => dbGetEntries(chapter.id).then(setEntries).catch(() => {}), [chapter.id]);
  useEffect(() => { reload(); }, [reload]);

  const switchMode = (m) => { setMode(m); store.set("readMode", m); window.scrollTo(0, 0); };
  const bar = { onBack, name, bookTitle: book?.title, mode, onMode: switchMode };

  return (
    <div className="tr" style={{ "--tr-scale": scale }}>
      {mode === "focus" ? (
        <FocusReader
          chapter={chapter} units={units} name={name} meaning={meaning}
          entries={entries} reload={reload} jumpBlock={jumpBlock} bar={bar}
          onReflect={onReflect} onNextChapter={onNextChapter} showToast={showToast}
        />
      ) : (
        <PageReader chapter={chapter} text={text} name={name} meaning={meaning} onReflect={onReflect} onNextChapter={onNextChapter} bar={bar} />
      )}
    </div>
  );
}

// ── Focus mode: one paragraph per screen ────────────────────────────────────────
function FocusReader({ chapter, units, name, meaning, entries, reload, jumpBlock, bar, onReflect, onNextChapter, showToast }) {
  const posKey = `focusPos:${chapter.id}`;
  const total = units.length;
  // idx === -1 is the title card, idx === total is the "chapter complete" card
  const [idx, setIdx] = useState(() => {
    if (jumpBlock != null) {
      const j = units.findIndex((u) => u.i === jumpBlock || u.items?.some((it) => it.i === jumpBlock));
      if (j >= 0) return j;
    }
    return Math.min(total, Math.max(-1, Number(store.get(posKey, -1))));
  });
  // remember position + progress (the Index shows it)
  useEffect(() => {
    store.set(posKey, idx);
    const prev = (() => { try { return JSON.parse(store.get(`progress:${chapter.id}`, "{}")); } catch { return {}; } })();
    store.set(`progress:${chapter.id}`, JSON.stringify({ idx, total, max: Math.max(prev.max ?? -1, idx), at: Date.now() }));
  }, [idx, total, posKey, chapter.id]);
  const [composing, setComposing] = useState(null); // null | "new" | entry
  const [fade, setFade] = useState(0);
  const composerRef = useRef(null);
  useEffect(() => {
    if (composing) composerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [composing]);

  const go = useCallback((d) => {
    setIdx((cur) => {
      const next = Math.min(total, Math.max(-1, cur + d));
      if (next !== cur) { setFade((f) => f + 1); window.scrollTo(0, 0); }
      return next;
    });
    setComposing(null);
  }, [total, posKey]);

  // Keyboard ← → and swipe, ignored while typing
  useEffect(() => {
    const typing = () => /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName ?? "");
    const onKey = (e) => {
      if (typing()) return;
      if (e.key === "ArrowRight" || e.key === "j" || (e.key === " " && !e.shiftKey)) { e.preventDefault(); go(1); }
      if (e.key === "ArrowLeft" || e.key === "k" || (e.key === " " && e.shiftKey)) { e.preventDefault(); go(-1); }
    };
    let start = null;
    const onStart = (e) => { start = typing() || e.touches.length > 1 ? null : { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
    const onEnd = (e) => {
      if (!start) return;
      const dx = e.changedTouches[0].clientX - start.x, dy = Math.abs(e.changedTouches[0].clientY - start.y);
      if (Math.abs(dx) > 60 && dy < 50) go(dx < 0 ? 1 : -1);
      start = null;
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, [go]);

  const u = units[idx];
  const here = u ? entries.filter((e) => e.block === u.i) : [];
  const fav = here.find((e) => e.tags?.includes("Favorite") && !e.text);
  const reflections = here.filter((e) => e.text);
  const reflectedBlocks = new Set(entries.filter((e) => e.text).map((e) => e.block));

  const save = async ({ text, tags }) => {
    const base = composing && composing !== "new" ? composing : { nameId: chapter.id, block: u.i, quote: unitQuote(u) };
    await dbSaveEntry({ ...base, text, tags });
    setComposing(null);
    reload();
    showToast?.("Note saved ✦", "success");
  };
  const toggleFav = async () => {
    if (fav) await dbDeleteEntry(fav.id);
    else await dbSaveEntry({ nameId: chapter.id, block: u.i, quote: unitQuote(u), text: "", tags: ["Favorite"] });
    reload();
  };
  const remove = async (e) => {
    if (!confirm("Delete this note?")) return;
    await dbDeleteEntry(e.id); reload();
  };

  // time left in this chapter, from the words still ahead
  const wordsLeft = units.slice(Math.max(0, idx)).reduce((n, x) => n + unitQuote(x).split(/\s+/).length, 0);
  const minsLeft = Math.max(1, Math.round(wordsLeft / WORDS_PER_MINUTE));

  const progress = (idx + 1) / (total + 1);

  return (
    <div className="fx">
      <div className="tr-progress" aria-hidden="true"><div style={{ width: `${Math.max(0, progress) * 100}%` }} /></div>
      <ReaderBar {...bar} />

      <div className="fx-stage" key={fade}>
        {idx === -1 && (
          <div className="fx-title">
            <div className="tr-num">Chapter {chapter.number}</div>
            <h1>{name}</h1>
            {meaning && <div className="tr-meaning">{meaning}</div>}
            <p className="fx-hint">{total} passages · about {minsLeft} min · swipe, tap → or press space to begin</p>
            <p className="fx-hint">Tap ♡ to save a passage, ✎ to write a note on it.</p>
          </div>
        )}

        {u && (
          <>
            <div className="fx-context">
              <span>{u.h3 ? plain(u.h3) : u.h2 ? plain(u.h2) : name}</span>
              <span className="fx-count">{idx + 1} / {total} · {minsLeft} min left</span>
            </div>
            <article className="fx-text"><UnitBody u={u} /></article>

            {composing && (
              <div ref={composerRef}><Composer
                key={composing === "new" ? "new" : composing.id}
                initial={composing === "new" ? null : composing}
                onSave={save}
                onCancel={() => setComposing(null)}
              /></div>
            )}
            {!composing && reflections.map((e) => (
              <EntryCard key={e.id} e={e} onEdit={() => setComposing(e)} onDelete={() => remove(e)} />
            ))}
          </>
        )}

        {idx === total && (
          <div className="fx-done">
            <div className="tr-end-mark">✦</div>
            <h2>You finished {name}</h2>
            <p>{reflectedBlocks.size} of {total} passages have notes.</p>
            <div className="fx-done-btns">
              {onNextChapter && <button onClick={onNextChapter}>Next chapter →</button>}
              <button className="ghost" onClick={onReflect}>Summarise this chapter</button>
            </div>
          </div>
        )}
      </div>

      <div className="dock">
      <ActionRow
        mode={bar.mode} onMode={bar.onMode}
        left={u && (
          <button className={"rd-icon" + (fav ? " on" : "")} onClick={toggleFav} aria-label={fav ? "Remove from favourites" : "Add to favourites"}>
            {fav ? "♥" : "♡"}
          </button>
        )}
        right={u ? (
          <button className={"rd-icon rd-reflect" + (composing ? " active" : "")} onClick={() => setComposing(composing ? null : "new")} aria-label="Write a note on this passage">
            ✎{reflections.length ? <span className="rd-badge">{reflections.length}</span> : null}
          </button>
        ) : (
          <button className="rd-icon rd-reflect" onClick={onReflect} aria-label="My notes on this chapter">✎</button>
        )}
      />
      <nav className="fx-nav">
        <button onClick={() => go(-1)} disabled={idx <= -1} aria-label="Previous passage">←</button>
        <div className="fx-dots" aria-hidden="true">
          {units.map((x, i) => (
            <span key={x.i} className={(i === idx ? "cur " : "") + (reflectedBlocks.has(x.i) ? "done" : "")} />
          ))}
        </div>
        <button onClick={() => go(1)} disabled={idx >= total} aria-label="Next passage">→</button>
      </nav>
      </div>
    </div>
  );
}

// ── Page mode: the whole chapter as one scroll ──────────────────────────────────
function PageReader({ chapter, text, name, meaning, onReflect, onNextChapter, bar }) {
  const [progress, setProgress] = useState(0);
  const rootRef = useRef(null);
  const posKey = `textPos:${chapter.id}`;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const saved = Number(store.get(posKey, 0)) || 0;
    if (saved > 0) root.querySelector(`[data-b="${saved}"]`)?.scrollIntoView({ block: "start" });
    else window.scrollTo(0, 0);
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = root.getBoundingClientRect();
        setProgress(Math.min(1, Math.max(0, (window.innerHeight * 0.5 - r.top) / r.height)));
        let top = 0;
        for (const el of root.querySelectorAll("[data-b]")) {
          if (el.getBoundingClientRect().top > 90) break;
          top = Number(el.dataset.b);
        }
        store.set(posKey, top);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, [posKey, text]);

  let lastPage = null, lastSeenPage = null;
  const groups = [];
  text.blocks.forEach((b, i) => {
    const last = groups[groups.length - 1];
    const isItem = b.t === "li" || b.t === "bullet";
    if (b.page == null) b = { ...b, page: lastSeenPage }; else lastSeenPage = b.page;
    if (isItem && last?.t === "ol" && last.items[0].t === b.t) last.items.push({ ...b, i });
    else if (isItem) groups.push({ t: "ol", page: b.page, start: b.n, items: [{ ...b, i }] });
    else groups.push({ ...b, i });
  });

  return (
    <>
      <div className="tr-progress" aria-hidden="true"><div style={{ width: `${progress * 100}%` }} /></div>
      <ReaderBar {...bar} />
      <div className="dock">
        <ActionRow
          mode={bar.mode} onMode={bar.onMode}
          right={<button className="rd-icon rd-reflect" onClick={onReflect} aria-label="My notes on this chapter">✎</button>}
        />
      </div>
      <article ref={rootRef} className="pg-article">
        <header className="tr-head">
          <div className="tr-num">Chapter {chapter.number}</div>
          <h1>{name}</h1>
          {meaning && <div className="tr-meaning">{meaning}</div>}
        </header>
        {groups.map((g) => {
          const marker = g.page !== lastPage && lastPage !== null ? (
            <div className="tr-page" aria-hidden="true">p. {g.page}</div>
          ) : null;
          lastPage = g.page;
          const key = g.i ?? `ol${g.items[0].i}`;
          let el;
          if (g.t === "h2") el = <h2 data-b={g.i}><Inline text={g.text} /></h2>;
          else if (g.t === "h3") el = <h3 data-b={g.i}><Inline text={g.text} /></h3>;
          else if (g.t === "quote") el = <blockquote data-b={g.i}><Inline text={g.text} /></blockquote>;
          else if (g.t === "ol") {
            const List = g.items[0].t === "bullet" ? "ul" : "ol";
            el = <List start={g.start}>{g.items.map((it) => <li key={it.i} data-b={it.i}><Inline text={it.text} /></li>)}</List>;
          } else el = <p data-b={g.i}><Inline text={g.text} /></p>;
          return <Fragment key={key}>{marker}{el}</Fragment>;
        })}
        <div className="tr-end">
          <div className="tr-end-mark">✦</div>
          {onNextChapter ? <button onClick={onNextChapter}>Next chapter →</button> : <button onClick={onReflect}>Summarise {name} →</button>}
        </div>
      </article>
    </>
  );
}
