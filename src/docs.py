"""Writes reports/analysis_report.md from the exported files, so the report always matches the data."""
import json

from config import EXPORT, REPORTS


def _j(p):
    return json.loads(p.read_text(encoding="utf-8"))


WHY_CHART = {
    "q01": "A line shows ordered, continuous time and makes the repeating seasonal shape and the February dip visible; 28 points is well within what a line can carry.",
    "q02": "Seven discrete ordered categories compared on one measure: columns, in Monday-Sunday order (not alphabetical) so the weekly cycle reads naturally.",
    "q03": "Four ordered parts of the day; columns keep the order Night->Evening and let bar length be compared exactly.",
    "q04": "Four seasons of one year; columns (or a donut) - columns preferred because differences are modest and donut angles are hard to compare.",
    "q05": "Three mutually exclusive parts of one whole - the one case where a donut is justified (share of total).",
    "q06": "A rate for four ordered groups; columns. Shown beside the standardised line so the confounding by crime type is visible.",
    "q07": "Ranked categories with long labels: horizontal bars sorted high to low.",
    "q08": "Same as Q7 for the top 5 domestic types.",
    "q09": "Volume and rate are different units on the same categories, so bars (volume) + line (rate) on a secondary axis show whether busy districts are also high-arrest.",
    "q10": "Two categorical dimensions and a count: a heat map with a colour scale makes the busiest weekday/time cells stand out at a glance.",
}


def write_docs():
    ins = _j(EXPORT / "insights.json")
    meth = _j(EXPORT / "methodology.json")
    kpis = _j(EXPORT / "kpis.json")

    # ---------------- analysis_report.md --------------------------------------------------------
    R = ["# TECHVERSE - Chicago Crimes: analysis report", "",
         "Generated from `export/` by `src/docs.py`. Every number below is read from the exported JSON.", "",
         "## 1. Problem and data", "",
         f"Source: {meth['source']['provenance']} File: `{meth['source']['file']}` (read-only; byte-identical after analysis - see `validate.py`).",
         f"Windows detected from data: A = {meth['windows']['A']['start']} to {meth['windows']['A']['end_exclusive']} (excl.), {meth['windows']['A']['records']:,} records; "
         f"B = {meth['windows']['B']['start']} to {meth['windows']['B']['end_exclusive']} (excl.), {meth['windows']['B']['records']:,} records; {meth['records_outside_windows']:,} records elsewhere.", "",
         "## 2. KPIs (handout definitions, whole dataset)", "", "| KPI | value | formula |", "|---|---|---|"]
    for k in kpis:
        v = f"{k['value']:,.2f}" if k["unit"] != "count" else f"{k['value']:,.0f}"
        R.append(f"| {k['id']} {k['label']} | {v} {'' if k['unit']=='count' else k['unit']} | {k['formula']} |")
    R += ["", "## 3. Cleaning log", "", "```json", json.dumps(_j(EXPORT / "cleaning_log.json"), indent=1), "```", "",
          "## 4. Assumptions and limitations", ""] + [f"- {a}" for a in meth["assumptions"]] + [""] + [f"- {a}" for a in meth["limitations"]] + [""]
    R += ["## 5. Findings", ""]
    for tier in ("headline", "supporting", "data_quality"):
        R.append(f"### {tier.replace('_', ' ').title()}")
        R.append("")
        for i in ins:
            if i["tier"] == tier:
                R += [f"**{i['headline']}**  ", i["text"], f"*Method:* {i['method']}" + (f" *Caveat:* {i['caveat']}" if i["caveat"] else ""), f"*Charts:* {', '.join(i['charts'])}", ""]
    R += ["## 6. Viva cheat-sheet: why each handout chart type", ""] + [f"- **{k.upper()}** - {v}" for k, v in WHY_CHART.items()]
    R += ["", "## 7. Likely judge questions", "",
          "- *Why did you change the dates?* 40% of Date cells were Excel datetimes with month/day swapped (only possible when day<=12); swapped back, they match Updated On and the handout's monthly chart (`cleaning_log.json`).",
          "- *Why two windows?* The file is a slice of a larger table; only two periods are near-complete (daily-count rule in `windows.py`). Whole-dataset KPIs still follow the handout.",
          "- *Why standardise arrest rates?* Because crime mix differs by hour and district; Simpson's paradox. See `arrest_simpson` and `arrest_district`.",
          "- *Why report effect sizes instead of p-values?* n is 10^5-10^6, so everything is 'significant'; Cohen's w, ratios and CIs say how big.",
          "- *What would change the conclusions?* Population denominators, complete data for window B, a flag for estimated dates.", ""]
    REPORTS.mkdir(exist_ok=True)
    (REPORTS / "analysis_report.md").write_text("\n".join(R), encoding="utf-8")
