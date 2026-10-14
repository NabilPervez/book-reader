// ── IndexedDB helpers (everything stays on this device) ──────────────────────
// Records are keyed by chapter id ("<bookId>:<chapterId>"), stored as `nameId`.
const DB_NAME = "BookReaderDB";
const DB_VERSION = 1;
const REFLECTIONS_STORE = "reflections";
const BOOKMARKS_STORE   = "bookmarks";
const ENTRIES_STORE     = "entries"; // paragraph reflections (quran-reflect style)

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(REFLECTIONS_STORE)) {
        const s = db.createObjectStore(REFLECTIONS_STORE, { keyPath: "nameId" });
        s.createIndex("updatedAt", "updatedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(BOOKMARKS_STORE)) {
        db.createObjectStore(BOOKMARKS_STORE, { keyPath: "nameId" });
      }
      if (!db.objectStoreNames.contains(ENTRIES_STORE)) {
        const s = db.createObjectStore(ENTRIES_STORE, { keyPath: "id", autoIncrement: true });
        s.createIndex("nameId", "nameId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror  = () => reject(req.error);
  });
}

// ── Reflections ───────────────────────────────────────────────────────────────

/** Get a single reflection by nameId. Returns null if not found. */
export async function dbGetReflection(nameId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(REFLECTIONS_STORE, "readonly");
    const req = tx.objectStore(REFLECTIONS_STORE).get(nameId);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror   = () => reject(req.error);
  });
}

/** Save (upsert) a reflection record. */
export async function dbSaveReflection(record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(REFLECTIONS_STORE, "readwrite");
    const req = tx.objectStore(REFLECTIONS_STORE).put({
      ...record,
      updatedAt: new Date().toISOString(),
    });
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

/** Get ALL reflections (for the journal view). */
export async function dbGetAllReflections() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(REFLECTIONS_STORE, "readonly");
    const req = tx.objectStore(REFLECTIONS_STORE).getAll();
    req.onsuccess = () =>
      resolve(req.result.sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1)));
    req.onerror = () => reject(req.error);
  });
}

/** Delete a reflection. */
export async function dbDeleteReflection(nameId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(REFLECTIONS_STORE, "readwrite");
    const req = tx.objectStore(REFLECTIONS_STORE).delete(nameId);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

/** Clear ALL reflections. */
export async function dbClearAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([REFLECTIONS_STORE, ENTRIES_STORE], "readwrite");
    tx.objectStore(REFLECTIONS_STORE).clear();
    tx.objectStore(ENTRIES_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

// ── Paragraph reflections ─────────────────────────────────────────────────────
// { id, nameId, block, quote, text, tags[], favorite, createdAt, updatedAt }

function entriesReq(mode, fn) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx  = db.transaction(ENTRIES_STORE, mode);
    const req = fn(tx.objectStore(ENTRIES_STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  }));
}

/** All entries for one chapter, in reading order. */
export async function dbGetEntries(nameId) {
  const rows = await entriesReq("readonly", (s) => s.index("nameId").getAll(nameId));
  return rows.sort((a, b) => a.block - b.block || (a.createdAt > b.createdAt ? 1 : -1));
}

/** Every entry, newest first (journal). */
export async function dbGetAllEntries() {
  const rows = await entriesReq("readonly", (s) => s.getAll());
  return rows.sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1));
}

/** Insert or update an entry; returns its id. */
export async function dbSaveEntry(entry) {
  const now = new Date().toISOString();
  const record = { createdAt: now, ...entry, updatedAt: now };
  if (record.id == null) delete record.id;
  return entriesReq("readwrite", (s) => s.put(record));
}

export async function dbDeleteEntry(id) {
  return entriesReq("readwrite", (s) => s.delete(id));
}

// ── Bookmarks ─────────────────────────────────────────────────────────────────

export async function dbGetAllBookmarks() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(BOOKMARKS_STORE, "readonly");
    const req = tx.objectStore(BOOKMARKS_STORE).getAll();
    req.onsuccess = () => resolve(req.result.map(r => r.nameId));
    req.onerror   = () => reject(req.error);
  });
}

export async function dbGetBookmark(nameId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(BOOKMARKS_STORE, "readonly");
    const req = tx.objectStore(BOOKMARKS_STORE).get(nameId);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror   = () => reject(req.error);
  });
}

export async function dbToggleBookmark(nameId, page = 0) {
  const db = await openDB();
  return new Promise(async (resolve, reject) => {
    const tx    = db.transaction(BOOKMARKS_STORE, "readwrite");
    const store = tx.objectStore(BOOKMARKS_STORE);
    const existing = await new Promise((r, e) => {
      const g = store.get(nameId);
      g.onsuccess = () => r(g.result);
      g.onerror   = () => e(g.error);
    });
    const req = existing ? store.delete(nameId) : store.put({ nameId, page });
    req.onsuccess = () => resolve(!existing);
    req.onerror   = () => reject(req.error);
  });
}

/** Update the saved page of an existing bookmark (does nothing if not bookmarked). */
export async function dbUpdateBookmarkPage(nameId, page) {
  const db = await openDB();
  return new Promise(async (resolve, reject) => {
    const tx    = db.transaction(BOOKMARKS_STORE, "readwrite");
    const store = tx.objectStore(BOOKMARKS_STORE);
    const existing = await new Promise((r, e) => {
      const g = store.get(nameId);
      g.onsuccess = () => r(g.result);
      g.onerror   = () => e(g.error);
    });
    if (!existing) { resolve(); return; }
    const req = store.put({ nameId, page });
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}
