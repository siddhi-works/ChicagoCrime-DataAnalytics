import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { animate, useInView } from "motion/react";

export const C = {
  violent: "#e66767", property: "#9085e9", other: "#199e70", arrest: "#c98500", arrestText: "#f0b43c",
  domestic: "#d55181", volume: "#3987e5", volume2: "#6da7ec", ink: "#f3f5f9", ink2: "#b4bac8", muted: "#7d8597",
  ramp: ["#0f1b33", "#104281", "#2a78d6", "#86b6ef", "#cde2fb"],
  categories: { Violent: "#e66767", Property: "#9085e9", Other: "#199e70" } as Record<string, string>,
};

export const fmt = (n: number, d = 0) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
export const pct = (n: number, d = 1) => `${fmt(n, d)}%`;
export const compact = (n: number) => (Math.abs(n) >= 1000 ? `${fmt(n / 1000, n >= 100000 ? 0 : 1)}k` : fmt(n));

/** Width of an element (responsive SVG charts). */
export function useWidth<T extends HTMLElement>(initial = 600): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(220, Math.floor(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Count-up number. Re-animates from the previous value when it changes (filters). */
export function Counter({ value, decimals = 0, duration = 1.4 }: { value: number; decimals?: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true, margin: "-10% 0px" });
  const prev = useRef(0);
  const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  useEffect(() => {
    if (!seen || !ref.current) return;
    const el = ref.current;
    if (reduce) { el.textContent = fmt(value, decimals); prev.current = value; return; }
    const c = animate(prev.current, value, {
      duration: prev.current === 0 ? duration : 0.7, ease: [0.2, 0.8, 0.2, 1],
      onUpdate: (v) => { el.textContent = fmt(v, decimals); },
    });
    prev.current = value;
    return () => c.stop();
  }, [value, seen, decimals, duration, reduce]);
  // Real value is the default text; the count-up is a progressive enhancement (never show a wrong number).
  return <span ref={ref}>{fmt(value, decimals)}</span>;
}

/* ───────── tooltip (one global layer; charts push content in) ───────── */
interface Tip { x: number; y: number; node: ReactNode | null }
let tip: Tip = { x: 0, y: 0, node: null };
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
export const showTip = (e: { clientX: number; clientY: number }, node: ReactNode) => { tip = { x: e.clientX, y: e.clientY, node }; emit(); };
export const hideTip = () => { if (tip.node) { tip = { ...tip, node: null }; emit(); } };
export function TooltipLayer() {
  const t = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => tip);
  if (!t.node) return null;
  const left = Math.min(t.x + 16, window.innerWidth - 290);
  const top = t.y + 18 > window.innerHeight - 120 ? t.y - 100 : t.y + 18;
  return <div className="tip" style={{ left: Math.max(8, left), top }} role="status">{t.node}</div>;
}
