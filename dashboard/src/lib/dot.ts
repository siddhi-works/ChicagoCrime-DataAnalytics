/**
 * Detective Dot — personality, rotating question pools and extra analytical handlers.
 * Every number is computed at answer time from the same cube/exports as the dashboard.
 */
import type { Answer, Ctx, TabId } from "./assistant";
import { NO_FILTERS } from "./engine";
import { fmt } from "./ui";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const title = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const pctOf = (a: number, n: number) => (n ? (a / n) * 100 : 0);
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TODS = ["Night (00–05)", "Morning (06–11)", "Afternoon (12–17)", "Evening (18–23)"];

/* ───────────── seeded helpers ───────────── */
export function mulberry(seed: number) { let a = seed >>> 0; return () => { a += 0x6d2b79f5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const pick = <T,>(arr: T[], r: () => number = Math.random) => arr[Math.floor(r() * arr.length)];
function shuffle<T>(arr: T[], r: () => number) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* ───────────── personality ───────────── */
export const DOT = { name: "Detective Dot", short: "Dot" };
const INTROS = ["On it! 🔎", "Let me check the case files…", "Good question, detective.", "Here’s what the evidence says:", "Dusting for data…", "Ooh, I like that one.", "Case notes coming right up:", "Magnifying glass out! 🔍", "Checking the clues…", ""];
const OUTROS = ["Want me to dig deeper?", "Ask me to compare two crime types — I love a good showdown.", "Click the buttons below to jump to the evidence.", "Try “tell me a fun fact” if you want a surprise.", "", "", ""];
export function flavour(text: string, r: () => number = Math.random): string {
  const a = pick(INTROS, r), z = pick(OUTROS, r);
  return `${a ? a + "\n" : ""}${text}${z ? "\n_" + z + "_" : ""}`;
}
export const GREETINGS = ["Hi, detective! I’m **Dot**, your case-file sidekick. I know this dashboard inside out: the KPIs, crime types, districts, timing, arrests, and how the data was cleaned. Pick a clue below or ask me anything.", "Hello! **Dot** reporting for duty 🔎 Ask me about any chart, district or crime type, or tap a suggestion.", "Hey there! I’m **Dot**. I answer from this project’s own analysis and the live data, so what you see is what I know."];

/* ───────────── rotating question pools ───────────── */
const POOLS: Record<string, string[]> = {
  dashboard: ["What do the 8 KPI cards show?", "Which month had the most crime?", "Which day and time is busiest?", "What are the top crime types?", "How do the filters work?", "What is the arrest rate?", "Compare theft and battery", "Tell me a fun fact", "Which crime type has the highest arrest rate?", "How many crimes happened in 2016?", "Weekend vs weekday — any difference?", "What’s the quietest time of day?", "What does Q9 show?", "Why is February so low?", "Which hour of the day is the busiest?", "Is it riskier at night?", "What does K7 mean?", "How is violent crime defined?"],
  time: ["Is crime higher in summer?", "When are weekend nights busiest?", "What is the weekday effect?", "Which hour is the busiest?", "Which crimes follow the sun?", "Tell me a fun fact"],
  arrests: ["Why does the evening arrest rate look higher?", "What predicts an arrest?", "Which districts beat expected arrest rates?", "Which crime type has the highest arrest rate?", "What does ‘standardised’ mean?", "How good is the arrest model?"],
  places: ["Which crimes are domestic?", "Where do crimes happen most?", "How concentrated is crime?", "Compare theft and robbery", "Which district has the most narcotics?", "Tell me a fun fact"],
  then: ["How did crime change between the two periods?", "Why can’t we call it a trend?", "What changed the most?", "Why might the recent arrest rate look lower?"],
  map: ["Which district has the most crime?", "Which district has the highest arrest rate?", "What do the map colours mean?", "Which district has the most narcotics?", "Which district is the most violent?", "Why is a district above or below expected?", "Why is there no map data for 2025–26?", "Compare District 11 and District 1", "Which district has the most domestic crime?", "Which district is quietest at night?", "Tell me a fun fact", "Tell me about District 8"],
  trust: ["Where does the data come from?", "What was cleaned or repaired?", "What methodology was used?", "What are the limitations?", "How was the arrest rate standardised?", "How was this calculated?", "Why were the dates swapped?", "Why only two time windows?", "What is a placeholder timestamp?", "How do you know the numbers are right?", "What assumptions did you make?", "What would change the conclusions?"],
};
export function pickChips(c: { tab: TabId; story: string; district: number | null }, n: number, seed: number): string[] {
  const r = mulberry(seed);
  const key = c.tab === "story" ? c.story : c.tab;
  const base = [...(POOLS[key] ?? POOLS.dashboard)];
  if (c.tab === "map" && c.district != null) base.unshift(`Tell me about District ${c.district}`, `How does District ${c.district} compare to the city?`);
  const general = ["What is this dashboard about?", "What are the main findings?", "What can you do?", "Who built this?"];
  const mixed = [...shuffle(base, r).slice(0, n - 1), pick(general, r)];
  return [...new Set(shuffle(mixed, r))].slice(0, n);
}

/* ───────────── detection helpers ───────────── */
function typesIn(q: string, c: Ctx): number[] {
  const names = c.b.engine.cube.lookups.primary_type.map((t, i) => ({ i, n: norm(t) })).sort((a, b) => b.n.length - a.n.length);
  let rest = ` ${q} `; const out: number[] = [];
  const alias: [RegExp, string][] = [[/vandal/, "criminal damage"], [/fraud|scam/, "deceptive practice"], [/car theft|auto theft/, "motor vehicle theft"], [/drug/, "narcotics"], [/break in|breaking in/, "burglary"], [/murder/, "homicide"], [/mugging/, "robbery"]];
  for (const [re, nm] of alias) if (re.test(q)) { const x = names.find((n) => n.n === nm); if (x && !out.includes(x.i)) out.push(x.i); }
  for (const x of names) if (rest.includes(` ${x.n} `)) { if (!out.includes(x.i)) out.push(x.i); rest = rest.replace(` ${x.n} `, " "); }
  return out;
}
const districtsIn = (q: string, c: Ctx) => [...q.matchAll(/\b(?:district|dist|d)\s*(\d{1,2})\b/g)].map((m) => +m[1]).filter((d) => c.b.engine.cube.lookups.district.includes(d));

const CHART_HELP: Record<number, string> = {
  1: "a **line** of monthly crime counts (Apr 2015–Jul 2017, 28 points). A line suits ordered time, and it shows the summer peaks and the February dip.",
  2: "**columns** for crimes by day of week, Monday → Sunday (not alphabetical). The days are very close, so weekday matters little.",
  3: "**columns** for the four parts of the day: Night 00–05, Morning 06–11, Afternoon 12–17, Evening 18–23.",
  4: "**columns** of crimes by season, **2016 only**. Winter = Dec–Feb, Spring = Mar–May, Summer = Jun–Aug, Fall = Sep–Nov.",
  5: "a **donut** for the share of Violent, Property and Other crimes — three parts of one whole, so a donut fits.",
  6: "**columns** of the arrest rate % for each time of day. On the Story tab we show it again standardised for crime mix.",
  7: "a sorted **bar** chart of the 10 most common crime types, coloured by category. Click a bar to filter everything.",
  8: "a sorted **bar** chart of the 5 crime types with the most domestic crimes.",
  9: "a **combo chart**: bars = crimes in the 10 busiest districts, line on a secondary axis = their arrest rate %. It answers “are busy districts also high-arrest?”.",
  10: "a **heat map** of weekday × time of day with a colour scale, so the busiest cells stand out.",
};

/* ───────────── fun facts (all computed live) ───────────── */
function funFacts(c: Ctx): string[] {
  const out: string[] = [];
  const eng = c.b.engine, base = NO_FILTERS();
  const r = c.base;
  const ts = eng.typeStats(base).filter((t) => t.crimes >= 1000);
  const hiArr = [...ts].sort((a, b) => pctOf(b.arrests, b.crimes) - pctOf(a.arrests, a.crimes))[0];
  const loArr = [...ts].sort((a, b) => pctOf(a.arrests, a.crimes) - pctOf(b.arrests, b.crimes))[0];
  if (hiArr && loArr) out.push(`Arrests are wildly uneven: **${title(hiArr.name)}** ends in arrest **${fmt(pctOf(hiArr.arrests, hiArr.crimes), 1)}%** of the time, but **${title(loArr.name)}** only **${fmt(pctOf(loArr.arrests, loArr.crimes), 1)}%** (overall: ${fmt(pctOf(r.arrests, r.total), 1)}%).`);
  let best = [0, 0, 0]; r.heat.forEach((row, d) => row.forEach((v, t) => { if (v > best[2]) best = [d, t, v]; }));
  out.push(`The single busiest slot of the whole week is **${DAYS[best[0]]} ${TODS[best[1]]}** with ${fmt(best[2])} crimes.`);
  const mo = [...r.monthly].sort((a, b) => b.crimes - a.crimes), hi = mo[0], lo = mo[mo.length - 1];
  out.push(`Between Apr 2015 and Jul 2017 the busiest month (**${hi.label}**, ${fmt(hi.crimes)}) had **${fmt((hi.crimes / lo.crimes - 1) * 100, 0)}% more** crimes than the quietest (**${lo.label}**, ${fmt(lo.crimes)}).`);
  const ds = eng.districtStats(base), narc = eng.cube.lookups.primary_type.indexOf("NARCOTICS");
  const nd = [...ds].filter((d) => d.crimes > 5000).sort((a, b) => pctOf(b.types[narc], b.crimes) - pctOf(a.types[narc], a.crimes))[0];
  if (nd) out.push(`In **District ${nd.code}**, ${fmt(pctOf(nd.types[narc], nd.crimes), 1)}% of all crimes are narcotics — the highest share of any large district.`);
  const fo = c.b.insights.dq_first_of_month; if (fo) out.push(`Data detective work: ${fo.headline}. ${fo.text.split(". ").slice(0, 2).join(". ")}.`);
  const se = c.b.insights.seasonality; if (se) out.push(`${se.headline}. ${se.text.split(". ")[0]}.`);
  const era = c.b.insights.era_change; if (era) out.push(`${era.headline}.`);
  const cl = c.b.insights.arrest_simpson; if (cl) out.push(`${cl.headline}.`);
  return out;
}

/* ───────────── extra handlers ───────────── */
export function extra(q: string, c: Ctx): Answer | null {
  const r = c.r;
  const sc = c.f.types.size + c.f.districts.size > 0 || c.f.arrest !== null || c.f.domestic !== null ? " _(for your current filters)_" : "";
  // chit-chat
  if (/^(hi|hello|hey|yo|hiya|good (morning|afternoon|evening))\b/.test(q)) return { text: pick(GREETINGS), sources: [] };
  if (/\b(thanks|thank you|thx|cheers)\b/.test(q)) return { text: pick(["You’re welcome, detective! 🕵️", "Anytime! Case closed… for now.", "Happy to help — any more clues to chase?"]), sources: [] };
  if (/\b(bye|goodbye|see you)\b/.test(q)) return { text: "Goodbye, detective — the case files will be here when you’re back. 👋", sources: [] };
  if (/(your name|who are you|what are you called|what s your name)/.test(q)) return { text: "I’m **Detective Dot** 🔎 — Team Moleculens’ case-file sidekick. I’m a rule-based analyst (not a free-form AI) that reads this project’s analysis and the live data, so I stay accurate and never invent numbers.", sources: [] };

  // fun fact
  if (/(fun fact|surprise me|something (interesting|surprising|cool|fun)|did you know|tell me something|random fact|trivia)/.test(q)) {
    const f = funFacts(c); return { text: `🎲 **Fun fact:** ${pick(f)}`, sources: ["cube.json (live)", "insights.json"], follow: ["Tell me another fun fact", "What are the main findings?"] };
  }

  // chart help  (Q1–Q10 / K1–K8 / exhibit)
  const qm = q.match(/\b(?:q|exhibit|chart|visual)\s?(\d{1,2})\b/);
  if (qm && CHART_HELP[+qm[1]]) {
    const n = +qm[1], chart = c.b.baseline["q" + String(n).padStart(2, "0")];
    return { text: `**Exhibit Q${n}** is ${CHART_HELP[n]}${chart?.caveats?.length ? `\n_Note: ${chart.caveats.join(" ").replace(/_/g, " ")}_` : ""}`, sources: ["handout · charts/q" + String(n).padStart(2, "0") + ".json"], go: [{ label: "Open Dashboard", tab: "dashboard" }] };
  }

  // february / dips
  if (/(february|feb)\b/.test(q) || /\bdip\b/.test(q)) {
    const days: Record<string, number> = {};
    const mo = r.monthly.map((m) => { const [y, mm] = m.month.split("-").map(Number); const d = new Date(y, mm, 0).getDate(); days[m.month] = d; return { ...m, perDay: m.crimes / d }; });
    const febs = mo.filter((m) => m.month.endsWith("-02")), avg = mo.reduce((s, m) => s + m.perDay, 0) / mo.length;
    if (febs.length) return { text: `February is the quietest month: ${febs.map((m) => `${m.label} had ${fmt(m.crimes)} crimes (${fmt(m.perDay, 0)}/day)`).join("; ")}.${sc}\nIt’s partly because it’s the **shortest month** — per day it’s ${fmt(febs[0].perDay, 0)} vs ${fmt(avg, 0)} on average — and partly winter: crime dips in cold months.`, sources: ["cube.json (live)"], go: [{ label: "Open Dashboard", tab: "dashboard" }] };
  }

  // compare two districts
  const ds = districtsIn(q, c);
  if (ds.length >= 2 && /(vs|versus|compare|compared|difference|and|or|than)/.test(q)) {
    const st = c.b.engine.districtStats(c.f), a = st.find((s) => s.code === ds[0])!, b = st.find((s) => s.code === ds[1])!;
    const row = (n: string, f: (s: typeof a) => string) => `• ${n}: **${f(a)}** vs **${f(b)}**`;
    return { text: `**District ${a.code} vs District ${b.code}**${sc}\n${row("Crimes", (s) => fmt(s.crimes))}\n${row("Arrest rate", (s) => fmt(pctOf(s.arrests, s.crimes), 1) + "%")}\n${row("Violent share", (s) => fmt(pctOf(s.violent, s.crimes), 1) + "%")}\n${row("Domestic share", (s) => fmt(pctOf(s.domestic, s.crimes), 1) + "%")}\n${row("Night share", (s) => fmt(pctOf(s.night, s.crimes), 1) + "%")}`, sources: ["cube.json (live)"], go: [{ label: "Open Map", tab: "map" }] };
  }
  // compare two crime types
  const ts = typesIn(q, c);
  if (ts.length >= 2 && /(vs|versus|compare|compared|difference|than|and|or)/.test(q)) {
    const all = c.b.engine.typeStats({ ...NO_FILTERS(), districts: c.f.districts, arrest: c.f.arrest, domestic: c.f.domestic });
    const a = all[ts[0]], b = all[ts[1]];
    const peak = (i: number) => { const f = NO_FILTERS(); f.types.add(i); const t = c.b.engine.compute(f); return `${DAYS[t.dow.indexOf(Math.max(...t.dow))]}, ${TODS[t.tod.indexOf(Math.max(...t.tod))]}`; };
    const row = (n: string, f: (s: typeof a) => string) => `• ${n}: **${f(a)}** vs **${f(b)}**`;
    return { text: `**${title(a.name)} vs ${title(b.name)}**${sc}\n${row("Crimes", (s) => fmt(s.crimes))}\n${row("Arrest rate", (s) => fmt(pctOf(s.arrests, s.crimes), 1) + "%")}\n${row("Domestic share", (s) => fmt(pctOf(s.domestic, s.crimes), 1) + "%")}\n${row("Night share", (s) => fmt(pctOf(s.night, s.crimes), 1) + "%")}\n${row("Peak slot", (s) => peak(s.idx))}`, sources: ["cube.json (live)"], go: [{ label: "Open Dashboard", tab: "dashboard" }] };
  }

  // crime-type rankings by rate
  if (!/district/.test(q) && /(highest|lowest|most|least|top|worst|best)/.test(q) && /(arrest|domestic|night)/.test(q) && /(type|crime|offen[cs]e|which|what)/.test(q)) {
    const key = /arrest/.test(q) ? "arrests" : /domestic/.test(q) ? "domestic" : "night";
    const low = /(lowest|least|worst)/.test(q) && key === "arrests" ? true : /(lowest|least)/.test(q);
    const all = c.b.engine.typeStats({ ...NO_FILTERS(), districts: c.f.districts, arrest: c.f.arrest, domestic: c.f.domestic }).filter((t) => t.crimes >= Math.max(500, c.r.total * 0.001));
    const sorted = all.sort((a, b) => (low ? 1 : -1) * (pctOf(a[key as "arrests"], a.crimes) - pctOf(b[key as "arrests"], b.crimes))).slice(0, 5);
    return { text: `**${low ? "Lowest" : "Highest"} ${key === "arrests" ? "arrest rate" : key + " share"} by crime type**${sc} _(types with enough crimes to be meaningful)_\n${sorted.map((t, i) => `${i + 1}. ${title(t.name)} – **${fmt(pctOf(t[key as "arrests"], t.crimes), 1)}%** of ${fmt(t.crimes)}`).join("\n")}`, sources: ["cube.json (live)"], go: [{ label: "Open Dashboard", tab: "dashboard" }] };
  }

  // district with most of a type
  if (/district/.test(q) && ts.length === 1 && /(most|highest|top|worst|biggest)/.test(q)) {
    const f = { ...c.f, types: new Set<number>([ts[0]]) }, st = c.b.engine.districtStats(f).sort((a, b) => b.crimes - a.crimes).slice(0, 5);
    return { text: `**Districts with the most ${title(c.b.engine.cube.lookups.primary_type[ts[0]])}**\n${st.map((s, i) => `${i + 1}. District ${s.code} – **${fmt(s.crimes)}**`).join("\n")}`, sources: ["cube.json (live)"], go: [{ label: "Open Map", tab: "map" }] };
  }

  // weekend vs weekday
  if (/weekend/.test(q) && /(vs|versus|weekday|compare|difference|more|less|busier)/.test(q)) {
    const wk = r.dow[5] + r.dow[6], wd = r.dow.slice(0, 5).reduce((s, v) => s + v, 0);
    return { text: `Per day, a weekend day averages **${fmt(Math.abs(wk / 2 / ((wd / 5) || 1) * 100 - 100), 1)}%** ${wk / 2 >= wd / 5 ? "more" : "fewer"} crimes than a weekday overall${sc}.\nBut the **timing** differs: weekend nights (00:00–05:59) are much busier than weekday nights — see the day × time heat map.`, sources: ["cube.json (live)"], go: [{ label: "Open Dashboard", tab: "dashboard" }] };
  }
  // quietest / safest time
  if (/(quietest|safest|least busy|calmest|lowest).*(time|hour|part)/.test(q) || /(time|hour).*(quietest|safest|least)/.test(q)) {
    const i = r.tod.indexOf(Math.min(...r.tod));
    return { text: `The quietest part of the day is **${TODS[i]}** with ${fmt(r.tod[i])} crimes (${fmt(pctOf(r.tod[i], r.total), 1)}%)${sc}. Per hour the early morning (around 05:00) is the lowest of all.\n_Remember: fewer reports ≠ guaranteed safety; this is reported crime only._`, sources: ["cube.json (live)"], go: [{ label: "Open Dashboard", tab: "dashboard" }] };
  }
  // which hour
  if (/(which|what) hour|busiest hour|peak hour/.test(q)) {
    const rows = c.b.charts.x_hour_dow_heatmap.data as { hour: number; per_day: number }[];
    const h = Array.from({ length: 24 }, (_, i) => rows.filter((x) => x.hour === i).reduce((s, x) => s + x.per_day, 0));
    const hi = h.indexOf(Math.max(...h)), lo = h.indexOf(Math.min(...h));
    return { text: `Across the week, the busiest hour is **${String(hi).padStart(2, "0")}:00** and the quietest is **${String(lo).padStart(2, "0")}:00** (Apr 2015–Jul 2017, placeholder timestamps removed so 00:00/12:00 aren’t inflated).`, sources: ["charts/x_hour_dow_heatmap.json"], go: [{ label: "Open Story", tab: "story" }] };
  }
  // is night riskier
  if (/(night|nighttime|late)/.test(q) && /(risk|danger|safe|worse|more)/.test(q)) {
    return { text: `Night (00:00–05:59) holds **${fmt(pctOf(r.night, r.total), 1)}%** of crimes${sc} — but it is only 6 of 24 hours, so per hour it’s actually quieter than the afternoon/evening on weekdays. The exception is **weekend nights**, which run far above weekday nights.`, sources: ["cube.json (live)", "insights.json › nights_weekend"], go: [{ label: "Open Story", tab: "story" }] };
  }
  // model quality
  if (/(model|auc).*(good|accurate|quality|well)|how good/.test(q) && /(arrest|model)/.test(q)) {
    const m = c.b.methodologyFull.models;
    return { text: `The arrest model (trained before ${m.test_from}, tested on later months) scores **AUC ${fmt(m.auc_gradient_boosting, 2)}** (logistic ${fmt(m.auc_logistic, 2)}). AUC 0.5 = guessing, 1.0 = perfect. Crime type does almost all the work; time of day and weekday add very little.`, sources: ["methodology.json"], go: [{ label: "Open Story", tab: "story" }] };
  }
  return null;
}
