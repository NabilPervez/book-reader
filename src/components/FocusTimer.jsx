import { useEffect, useState } from "react";

// A gentle reading-session timer. Start it from anywhere with startFocusSession(minutes);
// a small pill shows the time left and a soft chime plays when the session ends.

const KEY = "focusSessionEnd";

export function startFocusSession(minutes) {
  const end = Date.now() + minutes * 60_000;
  try { localStorage.setItem(KEY, String(end)); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent("focus-session", { detail: end }));
}

function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [523.25, 659.25, 783.99].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f;
      o.type = "sine";
      const t = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.15, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 1.3);
    });
  } catch { /* no audio */ }
  navigator.vibrate?.([120, 80, 120]);
}

export default function FocusTimer({ showToast }) {
  const [end, setEnd] = useState(() => {
    const v = Number(localStorage.getItem(KEY) || 0);
    return v > Date.now() ? v : 0;
  });
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const on = (e) => setEnd(e.detail);
    window.addEventListener("focus-session", on);
    return () => window.removeEventListener("focus-session", on);
  }, []);

  useEffect(() => {
    if (!end) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= end) {
        clearInterval(id);
        setEnd(0);
        try { localStorage.removeItem(KEY); } catch { /* ignore */ }
        chime();
        showToast?.("Focus session complete — nice work. Take a short break ✦", "success");
      }
    }, 1000);
    return () => clearInterval(id);
  }, [end, showToast]);

  if (!end) return null;
  const left = Math.max(0, Math.round((end - now) / 1000));
  const mm = Math.floor(left / 60), ss = String(left % 60).padStart(2, "0");
  const stop = () => {
    setEnd(0);
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  };

  return (
    <div className="ft-pill" role="timer" aria-label={`Focus session: ${mm} minutes ${ss} seconds left`}>
      <span className="ft-dot" />
      {mm}:{ss}
      <button onClick={stop} aria-label="End focus session">✕</button>
    </div>
  );
}
