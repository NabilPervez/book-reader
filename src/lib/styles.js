// ── Shared style objects ──────────────────────────────────────────────────────

export const card = {
  background: "var(--surface-lowest)",
  borderRadius: 16,
  padding: "20px 22px",
  marginBottom: 14,
  boxShadow: "0 2px 20px var(--shadow)",
  border: "1px solid var(--outline-ghost)",
};

export const pageWrap = {
  padding: "24px 20px 100px",
  maxWidth: 720,
  margin: "0 auto",
  animation: "pageFade 0.28s ease",
};

export const pageTitle = {
  fontFamily: "'Cormorant Garamond', serif",
  fontWeight: 700,
  color: "var(--on-surface)",
  fontSize: 28,
  marginBottom: 4,
  letterSpacing: "-0.02em",
};

export const pageSubtitle = {
  color: "var(--on-surface-var)",
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 13,
  marginBottom: 28,
  fontWeight: 400,
};

export const label = {
  display: "block",
  marginBottom: 8,
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--on-surface-var)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

export const textarea = {
  width: "100%",
  background: "transparent",
  border: "none",
  borderBottom: "2px solid var(--outline-ghost)",
  borderRadius: 0,
  padding: "10px 2px",
  color: "var(--on-surface)",
  fontSize: "inherit",
  fontFamily: "inherit",
  lineHeight: 1.75,
  transition: "border-color 0.25s ease",
  outline: "none",
};

export const primaryBtn = {
  padding: "10px 24px",
  borderRadius: 8,
  border: "none",
  background: "linear-gradient(135deg, var(--primary) 0%, var(--primary-dim) 100%)",
  color: "var(--on-primary)",
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 13,
  fontWeight: 600,
  boxShadow: "0 4px 16px var(--shadow)",
  transition: "transform 0.15s ease, box-shadow 0.15s ease",
};

export const ghostBtn = {
  padding: "9px 20px",
  borderRadius: 8,
  border: "1px solid var(--outline)",
  background: "transparent",
  color: "var(--on-surface-var)",
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 13,
  fontWeight: 500,
  transition: "background 0.15s ease",
};

export const chipBtn = {
  background: "var(--surface-low)",
  border: "none",
  borderRadius: 40,
  padding: "5px 14px",
  color: "var(--on-surface-var)",
  fontSize: 12,
  fontFamily: "'DM Sans', sans-serif",
  fontWeight: 500,
  transition: "background 0.15s ease",
};

export const settingsSection = {
  background: "var(--surface-lowest)",
  borderRadius: 16,
  padding: "20px 22px",
  marginBottom: 14,
  boxShadow: "0 2px 20px var(--shadow)",
  border: "1px solid var(--outline-ghost)",
};

export const settingsTitle = {
  fontFamily: "'DM Sans', sans-serif",
  fontWeight: 600,
  color: "var(--on-surface)",
  fontSize: 15,
  marginBottom: 4,
};

export const settingsDesc = {
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 13,
  color: "var(--on-surface-var)",
  lineHeight: 1.65,
  marginBottom: 14,
};

export function skeletonLine(pct) {
  return {
    height: 12,
    borderRadius: 6,
    marginBottom: 12,
    width: `${pct}%`,
    background:
      "linear-gradient(90deg, var(--shimmer-a) 25%, var(--shimmer-b) 50%, var(--shimmer-a) 75%)",
    backgroundSize: "600px 100%",
    animation: "shimmer 1.6s infinite linear",
  };
}
