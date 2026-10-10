// Copies the analysis export into public/data. The dashboard never contains hand-typed numbers.
import { cpSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../../export");
const dst = resolve(here, "../public/data");
if (!existsSync(src)) throw new Error(`Run python run_all.py first: ${src} not found`);
rmSync(dst, { recursive: true, force: true });
mkdirSync(dst, { recursive: true });
cpSync(src, dst, {
  recursive: true,
  // the 10 MB uncompressed cube and the parquet copy are not needed by the browser
  filter: (p) => !p.endsWith("cube.json") && !p.endsWith("cube.parquet") && !p.includes("schemas"),
});
console.log("synced export ->", dst);
