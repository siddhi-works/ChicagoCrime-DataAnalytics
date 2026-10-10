# Chicago After Dark — interactive data story (React + TypeScript)

All 8 handout KPIs (K1–K8) and all 10 visuals (Q1–Q10) are present and tagged on screen; extra analysis cards are tagged "Extra".
Nothing is typed by hand: `scripts/sync-data.mjs` copies `../export/*` (produced by `python run_all.py`) into `public/data`.

```bash
npm install
npm run dev        # syncs data, starts http://localhost:5173
npm run verify     # proves the in-browser cube maths == the Python export for every KPI/chart
npm run build      # type-check + production build in dist/
```

* `src/lib/engine.ts` – cube engine (filters → every KPI/chart, handout definitions).
* `src/charts/` – hand-built SVG/canvas charts (tooltips, keyboard focus, table view per card).
* Filters (crime type, district, arrest, domestic) recompute everything; clicking Q7/Q8/Q9 marks also filters.
* Colour is semantic: violent red · property violet · other green · arrests amber · domestic magenta · volume/time blue (validated for colour-blind separation on the dark surface).
* Q9 uses a secondary axis because the handout mandates it.

## Tabs
* **Dashboard** – 8 KPIs + 10 required charts (Q1–Q10), filters.
* **Story** – deeper findings (When · Arrests · What & where · Then vs now).
* **Map** – district territories (each ~550 m cell takes its most common district; no boundaries are invented), metric switch, ranked list, district detail panel.
* **Data trust** – source, pipeline, metric definitions, methods, data quality + cleaning log, assumptions/limits.
* **Data assistant** (bottom-right) – grounded Q&A over the exported analysis plus live cube calculations (follows filters). It is rule-based, not a generative model.

## Look & feel
True-crime noir: animated night-city welcome (cursor flashlight, siren glow, drifting crime-scene tape), hazard stripe under the nav, "EXHIBIT"/"CLUE" evidence tags, faint fingerprint watermarks. Assistant is **Detective Dot** (rotating questions, compare/fun-fact/chart-help handlers, varied phrasing).
