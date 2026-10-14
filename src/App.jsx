import { useState, useEffect, Component } from "react";
import LibraryTab  from "./components/LibraryTab.jsx";
import IndexTab    from "./components/IndexTab.jsx";
import ReaderTab   from "./components/ReaderTab.jsx";
import JournalTab  from "./components/JournalTab.jsx";
import SettingsTab from "./components/SettingsTab.jsx";
import BottomNav   from "./components/BottomNav.jsx";
import Toast       from "./components/Toast.jsx";
import FocusTimer  from "./components/FocusTimer.jsx";
import {
  loadLibrary, loadBook, getLastBook, setLastBook, getLastChapter, touchBook,
} from "./lib/library.js";

// ── Error Boundary ────────────────────────────────────────────────────────────
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: "60px 24px",
            maxWidth: 480,
            margin: "0 auto",
            textAlign: "center",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
          <h2
            style={{
              color: "var(--on-surface)",
              marginBottom: 10,
              fontSize: 20,
              fontWeight: 600,
            }}
          >
            Something went wrong
          </h2>
          <p
            style={{
              color: "var(--on-surface-var)",
              fontSize: 14,
              lineHeight: 1.7,
              marginBottom: 24,
            }}
          >
            {this.state.error?.message ?? "An unexpected error occurred."}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: "10px 24px",
              borderRadius: 8,
              border: "none",
              background: "var(--primary)",
              color: "var(--on-primary)",
              cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Root App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [tab,        setTab]        = useState("library");
  const [books,      setBooks]      = useState(null);   // library index
  const [book,       setBook]       = useState(null);   // open book, with chapters
  const chapters = book?.chapters ?? null;
  const [activeChapter, setActiveChapter] = useState(null);
  const [readerInitialView, setReaderInitialView] = useState("read");
  const [jumpBlock, setJumpBlock] = useState(null);
  const [toast,      setToast]      = useState(null);
  const [isDesktop,  setIsDesktop]  = useState(window.innerWidth >= 768);

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Persistent settings
  const [theme,      setTheme]      = useState(() => localStorage.getItem("br_theme")      || "system");
  const [fontSize,   setFontSize]   = useState(() => localStorage.getItem("br_fontsize")   || "md");
  const [fontFamily, setFontFamily] = useState(() => localStorage.getItem("br_fontfamily") || "serif");

  // PWA install
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstall,    setShowInstall]    = useState(false);

  // ── Load the library, reopen the last book ──────────────────────────────────
  useEffect(() => {
    loadLibrary().then((list) => {
      setBooks(list);
      const last = list.find((b) => b.id === getLastBook()) ?? (list.length === 1 ? list[0] : null);
      if (last) loadBook(last.id).then(setBook).catch(() => {});
    });
  }, []);

  const openBook = async (entry, goTo = "index") => {
    try {
      const b = book?.id === entry.id ? book : await loadBook(entry.id);
      setBook(b);
      setLastBook(b.id);
      touchBook(b.id);
      if (activeChapter?.bookId !== b.id) setActiveChapter(null);
      if (goTo === "reader") {
        const ch = b.chapters.find((c) => c.id === getLastChapter(b.id)) ?? b.chapters[0];
        handleOpenChapter(ch);
      } else {
        setTab("index");
        window.scrollTo(0, 0);
      }
    } catch {
      showToast("Could not open that book. Try running npm run import again.", "error");
    }
  };

  // ── Apply theme & settings ──────────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem("br_theme",      theme);
    localStorage.setItem("br_fontsize",   fontSize);
    localStorage.setItem("br_fontfamily", fontFamily);

    const root = document.documentElement;

    // Theme
    root.removeAttribute("data-theme");
    if (theme === "dark")  root.setAttribute("data-theme", "dark");
    if (theme === "light") root.setAttribute("data-theme", "light");
    if (theme === "sepia") root.setAttribute("data-theme", "sepia");
    // System: let prefers-color-scheme handle it
    if (theme === "system") {
      const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (dark) root.setAttribute("data-theme", "dark");
    }

    // Font size
    root.setAttribute("data-font-size", fontSize);

    // Font family
    root.setAttribute("data-font-family", fontFamily);
  }, [theme, fontSize, fontFamily]);

  // ── PWA install prompt ──────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      if (localStorage.getItem("br_install_dismissed") !== "1") {
        setDeferredPrompt(e);
        setShowInstall(true);
      }
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setShowInstall(false);
  };

  const dismissInstall = () => {
    localStorage.setItem("br_install_dismissed", "1");
    setShowInstall(false);
  };

  // ── Navigation helpers ──────────────────────────────────────────────────────
  const handleOpenChapter = (ch, initialView = "read", block = null) => {
    setActiveChapter(ch);
    setReaderInitialView(initialView);
    setJumpBlock(block);
    setTab("reader");
    window.scrollTo(0, 0);
  };

  // The Read tab resumes the last chapter of the open book
  const selectTab = (t) => {
    if ((t === "reader" || t === "index") && !book) {
      setTab("library");
      return;
    }
    if (t === "reader" && !activeChapter && chapters) {
      const ch = chapters.find((c) => c.id === getLastChapter(book.id)) ?? chapters[0];
      return handleOpenChapter(ch);
    }
    if (t === "reader") setJumpBlock(null);
    setTab(t);
    window.scrollTo(0, 0);
  };

  // From the Journal: a passage reflection opens that paragraph; chapter notes open Reflect
  const goToChapterById = async (chapterId, block = null) => {
    const bookId = chapterId.split(":")[0];
    let b = book;
    if (b?.id !== bookId) {
      try { b = await loadBook(bookId); } catch { return; }
      setBook(b);
      setLastBook(b.id);
    }
    const ch = b.chapters.find((c) => c.id === chapterId);
    if (!ch) return;
    if (block != null && block >= 0) handleOpenChapter(ch, "read", block);
    else handleOpenChapter(ch, "reflect");
  };

  const showToast = (msg, type = "success") =>
    setToast({ msg, type, key: Date.now() });

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      <div
        style={{
          minHeight: "100dvh",
          background: "var(--surface)",
          maxWidth: 900,
          margin: "0 auto",
          position: "relative",
          paddingLeft: isDesktop ? 80 : 0,
          paddingBottom: isDesktop ? 0 : 72,
        }}
      >
        <div
          key={tab}
          style={{ animation: "pageFade 0.25s ease" }}
        >
          <ErrorBoundary key={`eb-${tab}`}>
            {tab === "library" && (
              <LibraryTab
                books={books}
                onOpenBook={(b) => openBook(b)}
                onContinue={(b) => openBook(b, "reader")}
              />
            )}
            {tab === "index" && (
              <IndexTab
                book={book}
                chapters={chapters}
                onLibrary={() => setTab("library")}
                onOpenChapter={handleOpenChapter}
                onContinue={(ch) => handleOpenChapter(ch)}
              />
            )}
            {tab === "reader" && (
              <ReaderTab
                book={book}
                chapter={activeChapter}
                initialView={readerInitialView}
                jumpBlock={jumpBlock}
                onBack={() => setTab("index")}
                onNextChapter={(() => {
                  const i = chapters?.findIndex((c) => c.id === activeChapter?.id) ?? -1;
                  const next = i >= 0 ? chapters[i + 1] : null;
                  return next ? () => handleOpenChapter(next) : null;
                })()}
                showToast={showToast}
              />
            )}
            {tab === "journal" && (
              <JournalTab
                book={book}
                books={books}
                chapters={chapters}
                onGoToChapter={goToChapterById}
                showToast={showToast}
              />
            )}
            {tab === "settings" && (
              <SettingsTab
                theme={theme}
                setTheme={setTheme}
                fontSize={fontSize}
                setFontSize={setFontSize}
                fontFamily={fontFamily}
                setFontFamily={setFontFamily}
                books={books}
                showToast={showToast}
              />
            )}
          </ErrorBoundary>
        </div>

        <BottomNav tab={tab} setTab={selectTab} hasBook={!!book} />
        <FocusTimer showToast={showToast} />
      </div>

      {/* PWA Install Prompt */}
      {showInstall && (
        <div
          style={{
            position: "fixed",
            top: 20,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--surface-lowest)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid var(--outline-ghost)",
            padding: "12px 16px",
            borderRadius: 14,
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 13,
            zIndex: 9999,
            boxShadow: "0 8px 32px var(--shadow)",
            animation: "fadeIn 0.4s ease",
            display: "flex",
            alignItems: "center",
            gap: 14,
            maxWidth: "calc(100vw - 32px)",
          }}
        >
          <div>
            <div
              style={{
                fontWeight: 600,
                color: "var(--on-surface)",
                marginBottom: 2,
              }}
            >
              Install Book Reader
            </div>
            <div style={{ color: "var(--on-surface-var)", fontSize: 11 }}>
              Add to Home Screen for offline access
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button
              onClick={dismissInstall}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--on-surface-var)",
                fontSize: 12,
                cursor: "pointer",
                fontWeight: 500,
                padding: "4px 8px",
              }}
            >
              Not now
            </button>
            <button
              onClick={handleInstall}
              style={{
                background: "var(--primary)",
                border: "none",
                color: "var(--on-primary)",
                fontSize: 12,
                cursor: "pointer",
                fontWeight: 600,
                padding: "7px 14px",
                borderRadius: 8,
              }}
            >
              Install
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <Toast
          key={toast.key}
          message={toast.msg}
          type={toast.type}
          onDone={() => setToast(null)}
        />
      )}
    </>
  );
}
