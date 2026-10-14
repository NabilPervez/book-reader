// Toast notification component
import { useEffect, useState } from "react";

export default function Toast({ message, type = "success", onDone }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(onDone, 300);
    }, 2500);
    return () => clearTimeout(t);
  }, [onDone]);

  const colors = {
    success: { bg: "var(--primary)", text: "var(--on-primary)" },
    error:   { bg: "#c0392b",        text: "#fff" },
    info:    { bg: "var(--surface-lowest)", text: "var(--on-surface)" },
  };
  const c = colors[type] ?? colors.success;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 90,
        left: "50%",
        transform: "translateX(-50%)",
        background: c.bg,
        color: c.text,
        padding: "10px 22px",
        borderRadius: 40,
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 13,
        fontWeight: 500,
        zIndex: 9999,
        boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
        whiteSpace: "nowrap",
        transition: "opacity 0.3s ease",
        opacity: visible ? 1 : 0,
        animation: "toastIn 0.3s ease",
        pointerEvents: "none",
      }}
    >
      {message}
    </div>
  );
}
