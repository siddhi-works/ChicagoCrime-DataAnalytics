import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { answer, type Answer, type Ctx, type TabId } from "../lib/assistant";
import { DOT, GREETINGS, flavour, pick, pickChips } from "../lib/dot";

interface Msg { role: "user" | "bot"; text: string; sources?: string[]; go?: Answer["go"]; follow?: string[] }

/** Tiny markdown: **bold**, _italic_, "• " bullets, numbered lines. No HTML injection (React nodes only). */
function rich(t: string): ReactNode {
  return t.split("\n").map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).map((p, j) =>
      p.startsWith("**") ? <b key={j}>{p.slice(2, -2)}</b> : p.startsWith("_") && p.endsWith("_") && p.length > 2 ? <em key={j}>{p.slice(1, -1)}</em> : <Fragment key={j}>{p}</Fragment>);
    return <p key={i} className={/^(•|\d+\.)/.test(line) ? "li" : undefined}>{parts}</p>;
  });
}

/** Dot: a cute magnifying-glass detective with blinking eyes. */
function Dot({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <circle cx="17" cy="17" r="12" fill="#fff" stroke="#0a0c12" strokeWidth="3.2" />
      <g className="dot-eyes"><ellipse cx="13" cy="16" rx="2" ry="2.6" fill="#0a0c12" /><ellipse cx="21" cy="16" rx="2" ry="2.6" fill="#0a0c12" /></g>
      <path d="M12.5 21.5q4.5 3.6 9 0" stroke="#0a0c12" strokeWidth="2" strokeLinecap="round" fill="none" />
      <circle cx="10" cy="20" r="1.8" fill="#ff8aa0" opacity=".8" /><circle cx="24" cy="20" r="1.8" fill="#ff8aa0" opacity=".8" />
      <path d="M26 26l9 9" stroke="#0a0c12" strokeWidth="5.4" strokeLinecap="round" /><path d="M26 26l9 9" stroke="#f5c518" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function Chat({ ctx, goTab }: { ctx: Ctx; goTab: (t: TabId) => void }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  useEffect(() => setSeed(Math.floor(Math.random() * 1e9)), [ctx.tab, ctx.story, ctx.district]);
  const chips = useMemo(() => pickChips({ tab: ctx.tab, story: ctx.story, district: ctx.district }, 5, seed), [ctx.tab, ctx.story, ctx.district, seed]);

  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, typing, open]);
  useEffect(() => {
    if (open && msgs.length === 0)
      setMsgs([{ role: "bot", text: pick(GREETINGS), sources: [] }]);
    if (open) setTimeout(() => inputRef.current?.focus(), 250);
  }, [open]); // eslint-disable-line
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false); addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, []);

  const ask = (q: string) => {
    q = q.trim();
    if (!q || typing) return;
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setInput(""); setTyping(true);
    setTimeout(() => {
      let a: Answer;
      try { a = answer(q, ctx); } catch { a = { text: "Something went wrong answering that. Please try rephrasing.", sources: [] }; }
      const chat = /^(🎲|I’m \*\*Detective|Hi|Hello|Hey|You’re welcome|Goodbye)/.test(a.text) || a.sources.length === 0;
      setMsgs((m) => [...m, { role: "bot", ...a, text: chat ? a.text : flavour(a.text) }]);
      setTyping(false);
    }, 450 + Math.min(500, q.length * 8));
  };

  return (
    <>
      <AnimatePresence>
        {!open && (
          <motion.button className="chat-fab" onClick={() => setOpen(true)} aria-label="Ask Detective Dot" initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.94 }}>
            <span className="fab-ring" /><Dot size={30} /><span className="fab-label">Ask Dot</span>
          </motion.button>)}
      </AnimatePresence>
      <AnimatePresence>
        {open && (
          <motion.aside className="chat" role="dialog" aria-label="Detective Dot" initial={{ opacity: 0, y: 30, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 24, scale: 0.95 }} transition={{ type: "spring", stiffness: 300, damping: 28 }}>
            <header className="chat-head">
              <div className="chat-av"><Dot size={26} /></div>
              <div><b>{DOT.name}</b><span>Your case-file sidekick · answers from this project’s data, not a free-form AI</span></div>
              <button className="tbtn" onClick={() => setMsgs([])} title="Clear conversation">Clear</button>
              <button className="chat-x" onClick={() => setOpen(false)} aria-label="Close assistant">✕</button>
            </header>
            <div className="chat-body" aria-live="polite">
              {msgs.map((m, i) => (
                <motion.div key={i} className={`msg ${m.role}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                  <div className="bubble">{rich(m.text)}</div>
                  {m.role === "bot" && m.sources && m.sources.length > 0 && <div className="src">Source: {m.sources.join(" · ")}</div>}
                  {m.role === "bot" && m.go && m.go.length > 0 && <div className="acts">{m.go.map((g) => <button key={g.label} onClick={() => { goTab(g.tab); }}>{g.label} →</button>)}</div>}
                  {m.role === "bot" && m.follow && i === msgs.length - 1 && <div className="acts f">{m.follow.map((f) => <button key={f} onClick={() => ask(f)}>{f}</button>)}</div>}
                </motion.div>))}
              {typing && <div className="msg bot"><div className="bubble typing"><i /><i /><i /></div></div>}
              <div ref={end} />
            </div>
            <div className="chips" aria-label="Suggested questions">
              {chips.map((c) => <button key={c} onClick={() => ask(c)}>{c}</button>)}
              <button className="shuffle" onClick={() => setSeed(Math.floor(Math.random() * 1e9))} title="Show different questions">↻ New ideas</button>
            </div>
            <form className="chat-in" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
              <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask Dot anything about the case…" aria-label="Ask a question" maxLength={240} />
              <button type="submit" disabled={!input.trim() || typing} aria-label="Send">➤</button>
            </form>
          </motion.aside>)}
      </AnimatePresence>
    </>
  );
}
