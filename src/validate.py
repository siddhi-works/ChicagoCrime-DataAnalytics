"""Validation. Handout anchors are used only to CHECK our numbers; they are never copied into outputs."""
import gzip
import hashlib
import json

import numpy as np
import pandas as pd

from config import EXPORT, CLEAN, DAY_ORDER, TOD_ORDER, SEASON_ORDER, SOURCE_XLSX
from schema_models import ChartSpec, KPI, Insight, Manifest, Cube

# Values printed in the competition handout (Section 6 worked example). Used purely as external check values.
HANDOUT = {"total": 1_048_575, "arrests": 214_846, "q01_points": 28, "q01_min": (18_700, 18_800), "q01_max": (24_700, 24_900)}


def _load(p):
    return json.loads(p.read_text(encoding="utf-8"))


class Checker:
    def __init__(self):
        self.results = []

    def check(self, name, ok, detail=""):
        self.results.append((name, bool(ok), detail))
        return ok

    def failed(self):
        return [r for r in self.results if not r[1]]


def cube_frame(cube):
    L, c = cube["lookups"], cube["columns"]
    d = pd.DataFrame(c)
    d["type"] = d["primary_type"].map(dict(enumerate(L["primary_type"])))
    d["category"] = d["primary_type"].map(dict(enumerate(L["crime_category_of_type"])))
    d["district_code"] = d["district"].map(dict(enumerate(L["district"])))
    d["ym"] = d["month"].map(dict(enumerate(L["month"])))
    d["year"] = d["month"].map(dict(enumerate(L["year_of_month"])))
    d["season"] = d["month"].map(dict(enumerate(L["season_of_month"])))
    d["dow_name"] = d["day_of_week"].map(dict(enumerate(L["day_of_week"])))
    d["tod"] = d["time_of_day"].map(dict(enumerate(L["time_of_day"])))
    return d


def run_checks(deep=True):
    ck = Checker()
    ex = EXPORT
    man = Manifest(**_load(ex / "manifest.json"))
    ck.check("manifest parses", True)
    missing = [e.file for e in man.entries if not (ex / e.file).exists()]
    ck.check("every manifest file exists", not missing, str(missing))
    bad = [e.file for e in man.entries if hashlib.sha256((ex / e.file).read_bytes()).hexdigest()[:16] != e.sha256]
    ck.check("manifest hashes match files", not bad, str(bad))

    kpis = {k["id"]: KPI(**k) for k in _load(ex / "kpis.json")}
    charts = {}
    for e in man.entries:
        if e.kind == "chart":
            charts[e.id] = ChartSpec(**_load(ex / e.file))
    ck.check("all charts validate against ChartSpec", True, f"{len(charts)} charts")
    [Insight(**i) for i in _load(ex / "insights.json")]
    ck.check("insights validate", True)
    cube = Cube(**_load(ex / "cube" / "cube.json")).model_dump()
    with gzip.open(ex / "cube" / "cube.json.gz", "rb") as f:
        ck.check("cube.json.gz equals cube.json", json.loads(f.read()) == cube)

    # ---- handout anchors --------------------------------------------------------------------
    ck.check("K1 total rows", kpis["K1"].value == HANDOUT["total"], str(kpis["K1"].value))
    ck.check("K2 arrests", kpis["K2"].numerator == HANDOUT["arrests"], str(kpis["K2"].numerator))
    ck.check("K2 = 20.5%", round(kpis["K2"].value, 1) == 20.5)
    q1 = charts["q01"].data
    ck.check("Q1 has 28 points", len(q1) == HANDOUT["q01_points"], str(len(q1)))
    vals = [r["crimes"] for r in q1]
    ck.check("Q1 min ~18.7k and in Feb 2016", HANDOUT["q01_min"][0] <= min(vals) <= HANDOUT["q01_min"][1]
             and q1[vals.index(min(vals))]["month"] == "2016-02", f"{min(vals)}")
    ck.check("Q1 max ~24.8k in Aug", HANDOUT["q01_max"][0] <= max(vals) <= HANDOUT["q01_max"][1]
             and q1[vals.index(max(vals))]["month"].endswith("-08"), f"{max(vals)}")

    # ---- internal invariants ----------------------------------------------------------------
    n = kpis["K1"].value
    for cid in ("q02", "q03", "q05", "q10"):
        ck.check(f"{cid} sums to K1", sum(r["crimes"] for r in charts[cid].data) == n)
    ck.check("q04 sums to K5", sum(r["crimes"] for r in charts["q04"].data) == kpis["K5"].value)
    ck.check("q05 shares sum to 100", abs(sum(r["share_pct"] for r in charts["q05"].data) - 100) < 1e-6)
    ck.check("q02 order Mon..Sun", [r["day_of_week"] for r in charts["q02"].data] == DAY_ORDER)
    ck.check("q03 order", [r["time_of_day"] for r in charts["q03"].data] == TOD_ORDER)
    ck.check("q04 order", [r["season"] for r in charts["q04"].data] == SEASON_ORDER)
    for cid in ("q07", "q08", "q09"):
        v = [r["crimes"] for r in charts[cid].data]
        ck.check(f"{cid} sorted desc", v == sorted(v, reverse=True))
    ck.check("q07 has 10 / q08 has 5 / q09 has 10", len(charts["q07"].data) == 10 and len(charts["q08"].data) == 5 and len(charts["q09"].data) == 10)
    ck.check("q10 has 28 cells", len(charts["q10"].data) == 28)

    # ---- cube parity: cube must reproduce every handout number ------------------------------
    c = cube_frame(cube)
    ck.check("cube total = K1", c["crimes"].sum() == n)
    ck.check("cube arrests = K2 numerator", c.loc[c["arrest"] == 1, "crimes"].sum() == kpis["K2"].numerator)
    ck.check("cube domestic = K3 numerator", c.loc[c["domestic"] == 1, "crimes"].sum() == kpis["K3"].numerator)
    ck.check("cube night = K7 numerator", c.loc[c["tod"] == "Night", "crimes"].sum() == kpis["K7"].numerator)
    ck.check("cube violent = K8 numerator", c.loc[c["category"] == "Violent", "crimes"].sum() == kpis["K8"].numerator)
    ck.check("cube types = K4", c.loc[c["crimes"] > 0, "primary_type"].nunique() == kpis["K4"].value)
    ck.check("cube 2016 = K5", c.loc[c["year"] == 2016, "crimes"].sum() == kpis["K5"].value)
    m = c[(c["ym"] >= "2015-04") & (c["ym"] <= "2017-07")].groupby("ym")["crimes"].sum()
    ck.check("cube Q1 parity", [int(x) for x in m.values] == [r["crimes"] for r in charts["q01"].data])
    ck.check("cube K6 parity", abs(m.mean() - kpis["K6"].value) < 1e-4)
    q2 = c.groupby("dow_name")["crimes"].sum().reindex(DAY_ORDER)
    ck.check("cube Q2 parity", [int(x) for x in q2.values] == [r["crimes"] for r in charts["q02"].data])
    q4 = c[c["year"] == 2016].groupby("season")["crimes"].sum().reindex(SEASON_ORDER)
    ck.check("cube Q4 parity", [int(x) for x in q4.values] == [r["crimes"] for r in charts["q04"].data])
    q6 = c.groupby(["tod", "arrest"])["crimes"].sum().unstack().reindex(TOD_ORDER)
    ck.check("cube Q6 parity", np.allclose(q6[1] / q6.sum(axis=1) * 100, [r["arrest_rate_pct"] for r in charts["q06"].data]))
    q9 = c.groupby("district_code").apply(lambda g: pd.Series({"n": g["crimes"].sum(), "a": g.loc[g["arrest"] == 1, "crimes"].sum()}), include_groups=False)
    q9 = q9.sort_values("n", ascending=False).head(10)
    ck.check("cube Q9 parity", [int(x) for x in q9.index] == [r["District"] for r in charts["q09"].data]
             and [int(x) for x in q9["n"]] == [r["crimes"] for r in charts["q09"].data])
    q10 = c.groupby(["dow_name", "tod"])["crimes"].sum()
    ck.check("cube Q10 parity", all(q10[(r["day_of_week"], r["time_of_day"])] == r["crimes"] for r in charts["q10"].data))

    # ---- random filter parity cube vs cleaned data (proves cross-filtering is exact) --------
    if deep and CLEAN.exists():
        df = pd.read_parquet(CLEAN, columns=["Primary Type", "District", "Arrest", "Domestic", "time_of_day", "day_of_week", "Year", "Date", "Latitude", "has_coords"])
        rng = np.random.default_rng(0)
        types = df["Primary Type"].unique()
        ok = True
        for _ in range(25):
            t = list(rng.choice(types, size=rng.integers(1, 4), replace=False))
            dsel = list(rng.choice(sorted(df["District"].unique()), size=rng.integers(1, 6), replace=False))
            a = df[df["Primary Type"].isin(t) & df["District"].isin(dsel)]
            b = c[c["type"].isin(t) & c["district_code"].isin(dsel)]
            ok &= len(a) == b["crimes"].sum() and int(a["Arrest"].sum()) == b.loc[b["arrest"] == 1, "crimes"].sum()
        ck.check("25 random (type x district) filters: cube == raw rows", ok)
        ck.check("Date.year == Year for all rows", (df["Date"].dt.year == df["Year"]).all())
        ck.check("no null derived fields", df[["time_of_day", "day_of_week"]].notna().all().all())

    # ---- source file untouched (mtime/size are only read) -----------------------------------
    from load import fingerprint
    fp_file = EXPORT.parent / "data" / "cache" / "source_fingerprint.json"
    if fp_file.exists():
        saved = json.loads(fp_file.read_text())
        now = fingerprint()
        ck.check("source workbook byte-identical to when first read (sha256, size, mtime)", saved == now, f"{saved} vs {now}")
    return ck
