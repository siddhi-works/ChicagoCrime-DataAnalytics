"""QA contact sheet (Python-only fallback visuals) and generated documentation tables."""
import json

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from config import EXPORT, REPORTS, DAY_ORDER, TOD_ORDER


def _load(cid):
    return json.loads((EXPORT / "charts" / f"{cid}.json").read_text(encoding="utf-8"))


def contact_sheet():
    REPORTS.mkdir(exist_ok=True)
    fig, axes = plt.subplots(5, 4, figsize=(22, 24))
    axes = axes.ravel()
    i = 0

    def nxt():
        nonlocal i
        a = axes[i]
        i += 1
        return a

    c = _load("q01"); a = nxt(); a.plot([r["month"] for r in c["data"]], [r["crimes"] for r in c["data"]], marker="o")
    a.set_title("Q1 " + c["title"], fontsize=9); a.tick_params(axis="x", rotation=90, labelsize=6)
    for cid, xk in (("q02", "day_of_week"), ("q03", "time_of_day"), ("q04", "season")):
        c = _load(cid); a = nxt(); a.bar([r[xk] for r in c["data"]], [r["crimes"] for r in c["data"]])
        a.set_title(cid.upper() + " " + c["title"], fontsize=9)
    c = _load("q05"); a = nxt(); a.pie([r["crimes"] for r in c["data"]], labels=[r["crime_category"] for r in c["data"]], wedgeprops=dict(width=0.45), autopct="%1.0f%%")
    a.set_title("Q5 " + c["title"], fontsize=9)
    c = _load("q06"); a = nxt(); a.bar([r["time_of_day"] for r in c["data"]], [r["arrest_rate_pct"] for r in c["data"]]); a.set_title("Q6 " + c["title"], fontsize=9)
    for cid in ("q07", "q08"):
        c = _load(cid); a = nxt(); d = c["data"][::-1]
        a.barh([r["Primary Type"] for r in d], [r["crimes"] for r in d]); a.set_title(cid.upper() + " " + c["title"], fontsize=9); a.tick_params(labelsize=6)
    c = _load("q09"); a = nxt(); d = c["data"]
    a.bar([str(r["District"]) for r in d], [r["crimes"] for r in d]); b = a.twinx(); b.plot([str(r["District"]) for r in d], [r["arrest_rate_pct"] for r in d], color="C3", marker="o")
    a.set_title("Q9 " + c["title"][:50], fontsize=9)
    c = _load("q10"); a = nxt()
    m = pd.DataFrame(c["data"]).pivot(index="day_of_week", columns="time_of_day", values="crimes").reindex(index=DAY_ORDER, columns=TOD_ORDER)
    a.imshow(m.values, cmap="YlOrRd"); a.set_xticks(range(4), TOD_ORDER); a.set_yticks(range(7), DAY_ORDER)
    for (y, x), v in np.ndenumerate(m.values):
        a.text(x, y, f"{v:,}", ha="center", va="center", fontsize=6)
    a.set_title("Q10 " + c["title"], fontsize=9)
    c = _load("x_hour_dow_heatmap"); a = nxt()
    m = pd.DataFrame(c["data"]).pivot(index="day_of_week", columns="hour", values="per_day").reindex(DAY_ORDER)
    a.imshow(m.values, cmap="YlOrRd", aspect="auto"); a.set_yticks(range(7), DAY_ORDER); a.set_title("x Weekday x hour (per day)", fontsize=9)
    c = _load("x_arrest_tod_standardised"); a = nxt(); d = c["data"]
    a.bar([r["time_of_day"] for r in d], [r["raw_rate_pct"] for r in d], alpha=.6, label="raw"); a.plot([r["time_of_day"] for r in d], [r["standardised_rate_pct"] for r in d], "k-o", label="standardised")
    a.legend(fontsize=7); a.set_title("x Arrest by time: raw vs mix-standardised", fontsize=9)
    c = _load("x_district_sir"); a = nxt(); d = c["data"]
    a.scatter([r["expected_rate_pct"] for r in d], [r["raw_rate_pct"] for r in d])
    for r in d:
        a.annotate(str(r["District"]), (r["expected_rate_pct"], r["raw_rate_pct"]), fontsize=7)
    lim = [0, max(r["raw_rate_pct"] for r in d) + 3]; a.plot(lim, lim, "k--", lw=.5); a.set_title("x District observed vs expected arrest %", fontsize=9)
    c = _load("x_month_per_day"); a = nxt(); a.bar([r["month"] for r in c["data"]], [r["mean"] for r in c["data"]]); a.set_title("x Crimes/day by month", fontsize=9)
    c = _load("x_season_types"); a = nxt(); d = c["data"][::-1]
    a.barh([r["crime_type"] for r in d], [r["summer_winter_ratio"] for r in d]); a.axvline(1, color="k", lw=.5); a.tick_params(labelsize=6); a.set_title("x Summer/winter ratio by type", fontsize=9)
    c = _load("x_daily_expected"); a = nxt(); d = c["data"]
    a.plot([r["date"] for r in d], [r["crimes"] for r in d], lw=.6); a.plot([r["date"] for r in d], [r["expected"] for r in d], lw=.8); a.set_xticks(range(0, len(d), 120)); a.tick_params(labelsize=6); a.set_title("x Daily crimes vs expected", fontsize=9)
    c = _load("x_arrest_importance"); a = nxt(); d = c["data"][::-1]
    a.barh([r["feature"] for r in d], [r["auc_drop"] for r in d]); a.set_title("x Permutation importance (AUC drop)", fontsize=9)
    c = _load("x_beat_lorenz"); a = nxt(); d = c["data"]
    a.plot([r["beat_share_pct"] for r in d], [r["crime_share_pct"] for r in d]); a.plot([0, 100], [0, 100], "k--", lw=.5); a.set_title("x Beat concentration (Lorenz)", fontsize=9)
    g = json.loads((EXPORT / "geo" / "grid_density.json").read_text(encoding="utf-8"))["rows"]
    a = nxt(); a.scatter([r["lon"] for r in g], [r["lat"] for r in g], c=np.log10([r["crimes"] for r in g]), s=4, cmap="inferno"); a.set_aspect(1.3); a.set_title("x Grid density (window A)", fontsize=9)
    for j in range(i, len(axes)):
        axes[j].axis("off")
    fig.suptitle("QA contact sheet - rendered from export/*.json (Python-only fallback)", fontsize=14)
    fig.tight_layout(rect=[0, 0, 1, 0.97])
    fig.savefig(REPORTS / "qa_contact_sheet.png", dpi=80)
    plt.close(fig)
