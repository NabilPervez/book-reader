// Bottom navigation bar
import { useState, useEffect } from "react";

export default function BottomNav({ tab, setTab, hasBook = false }) {
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);
  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const tabs = [
    { id: "library",  label: "Library",  icon: "▤" },
    { id: "index",    label: "Contents", icon: "☰", needsBook: true },
    { id: "reader",   label: "Read",     icon: "✦", needsBook: true },
    { id: "journal",  label: "Notes",    icon: "✎" },
    { id: "settings", label: "Settings", icon: "⚙" },
  ];

  return (
    <nav
      style={isDesktop ? {
        position: "fixed",
        top: 0,
        bottom: 0,
        left: 0,
        width: 80,
        background: "var(--nav-bg, rgba(248,245,240,0.88))",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 200,
        borderRight: "1px solid var(--outline-ghost)",
      } : {
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        background: "var(--nav-bg, rgba(248,245,240,0.88))",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        display: "flex",
        justifyContent: "space-around",
        alignItems: "center",
        height: 72,
        zIndex: 200,
        borderTop: "1px solid var(--outline-ghost)",
      }}
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          id={`nav-${t.id}`}
          aria-label={t.label}
          onClick={() => setTab(t.id)}
          style={{
            flex: isDesktop ? "none" : 1,
            width: "100%",
            background: "none",
            border: "none",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
            padding: isDesktop ? "20px 0" : "10px 0",
            opacity: t.needsBook && !hasBook ? 0.35 : 1,
          }}
        >
          <span
            style={{
              fontSize: 18,
              color: tab === t.id ? "var(--primary)" : "var(--on-surface-var)",
              transition: "color 0.25s ease, transform 0.25s ease",
              transform: tab === t.id ? "scale(1.2)" : "scale(1)",
              display: "block",
              lineHeight: 1,
            }}
          >
            {t.icon}
          </span>
          <span
            style={{
              fontSize: 9,
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: tab === t.id ? "var(--primary)" : "var(--on-surface-var)",
              transition: "color 0.25s ease",
            }}
          >
            {t.label}
          </span>
        </button>
      ))}
    </nav>
  );
}
