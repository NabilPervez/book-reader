// ── Library data (written by scripts/import_books.py into public/library) ─────
// Chapter ids are namespaced "<bookId>:<chapterId>" so notes, favourites and
// reading positions never collide between books.

const cache = new Map();
const getJSON = (url) => {
  if (!cache.has(url)) {
    cache.set(url, fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${url}: ${r.status}`);
      return r.json();
    }).catch((e) => { cache.delete(url); throw e; }));
  }
  return cache.get(url);
};

export const WORDS_PER_MINUTE = 230;

export function readingTime(words = 0) {
  const m = Math.max(1, Math.round(words / WORDS_PER_MINUTE));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

export async function loadLibrary() {
  try {
    const books = await getJSON("/library/index.json");
    return Array.isArray(books) ? books : [];
  } catch {
    return [];
  }
}

export async function loadBook(bookId) {
  const book = await getJSON(`/library/${bookId}/book.json`);
  return {
    ...book,
    chapters: book.toc.map((c) => ({
      ...c,
      id: `${bookId}:${c.id}`,
      bookId,
      file: `/library/${bookId}/${c.id}.json`,
    })),
  };
}

export const loadChapterText = (chapter) => getJSON(chapter.file);

// ── progress (localStorage, written by the reader) ──────────────────────────────
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

export function chapterProgress(chapterId) {
  try { return JSON.parse(ls.get(`progress:${chapterId}`) || "null"); } catch { return null; }
}

/** Fraction of a book's chapters finished, plus the furthest-read chapter count. */
export function bookProgress(book) {
  let finished = 0, started = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(`progress:${book.id}:`)) continue;
      const p = JSON.parse(localStorage.getItem(k));
      if (p?.max >= 0) started++;
      if (p && p.max >= p.total) finished++;
    }
  } catch { /* ignore */ }
  return { finished, started, fraction: book.chapters ? finished / book.chapters : 0 };
}

export const getLastBook = () => ls.get("lastBook");
export const setLastBook = (id) => ls.set("lastBook", id);
export const getLastChapter = (bookId) => ls.get(`lastChapter:${bookId}`);
export const setLastChapter = (bookId, chapterId) => ls.set(`lastChapter:${bookId}`, chapterId);
export const getLastOpened = (bookId) => Number(ls.get(`lastOpened:${bookId}`) || 0);
export const touchBook = (bookId) => ls.set(`lastOpened:${bookId}`, String(Date.now()));
