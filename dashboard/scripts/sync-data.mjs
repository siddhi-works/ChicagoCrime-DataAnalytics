// Copies the analysis output the website needs from ../export into public/data.
// The site never contains hand-typed numbers: everything it shows comes from these files.
import { cpSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../../export");
const dst = resolve(here, "../public/data");

// Only what src/lib/data.ts and scripts/verify.mjs actually load.
const files = [
  "kpis.json",
  "insights.json",
  "methodology.json",
  "cleaning_log.json",
  "geo/grid_density.json",
  "geo/district_centroids.json",
  "cube/cube.json.gz",
  ...["q01", "q02", "q03", "q04", "q05", "q06", "q07", "q08", "q09", "q10"].map((q) => `charts/${q}.json`),
  ...["x_coverage_grid", "x_hour_dow_heatmap", "x_arrest_tod_standardised", "x_district_sir", "x_season_types", "x_era_change", "x_dow_index"].map((c) => `charts/${c}.json`),
];

if (!existsSync(src)) {
  // On a hosted build (e.g. Vercel) ../export is not there, but public/data is already committed.
  if (existsSync(dst)) {
    console.log("export/ not found; using the committed public/data");
    process.exit(0);
  }
  throw new Error(`Run "python run_all.py" first: ${src} not found`);
}

rmSync(dst, { recursive: true, force: true });
mkdirSync(dst, { recursive: true });
for (const f of files) {
  const from = resolve(src, f);
  if (!existsSync(from)) throw new Error(`Missing export file: ${f}`);
  mkdirSync(dirname(resolve(dst, f)), { recursive: true });
  cpSync(from, resolve(dst, f));
}
console.log(`synced ${files.length} files -> ${dst}`);
