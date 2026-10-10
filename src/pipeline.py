"""Orchestrates analyses and assembles chart specs + results dict R (consumed by insights.py / export.py)."""
import warnings

import numpy as np
import pandas as pd

import stats_arrest as sa
import stats_geo as sg
import stats_time as st
from charts import build_handout_charts
from clean import clean
from config import DAY_ORDER, TOD_ORDER, SEASON_ORDER
from features import add_features
from kpis import compute_kpis
from load import load_raw
from statlib import clean_records
from windows import dense_windows

warnings.filterwarnings("ignore")

CUBE_FILTERS = ["primary_type", "district", "month", "day_of_week", "time_of_day", "arrest", "domestic"]


def ax(field, label, typ="quantitative"):
    return {"field": field, "label": label, "type": typ}


def spec(id_, title, ctype, x, y, data, scope, subtitle=None, order=None, series=None, note=None, window=None,
         caveats=None, row_field=None, handout_ref=None, filterable=False):
    if isinstance(data, pd.DataFrame):
        data = clean_records(data)
    return dict(id=id_, handout_ref=handout_ref, title=title, subtitle=subtitle, chart_type=ctype, x=x, y=y,
                series=series, order=order, row_field=row_field, note=note, window=window, scope=scope,
                filterable_via_cube=filterable, caveats=caveats or [], data=data)


def build_cube(df):
    keys = ["Primary Type", "District", "ym", "dow", "time_of_day", "Arrest", "Domestic"]
    d = df.assign(ym=df["Date"].dt.strftime("%Y-%m"))
    g = d.groupby(keys, observed=True).size().rename("crimes").reset_index()
    types = sorted(df["Primary Type"].unique())
    districts = sorted(int(x) for x in df["District"].unique())
    yms = sorted(d["ym"].unique())
    cat = df.drop_duplicates("Primary Type").set_index("Primary Type")["crime_category"].to_dict()
    cols = {
        "primary_type": g["Primary Type"].map({t: i for i, t in enumerate(types)}).astype(int).tolist(),
        "district": g["District"].map({t: i for i, t in enumerate(districts)}).astype(int).tolist(),
        "month": g["ym"].map({t: i for i, t in enumerate(yms)}).astype(int).tolist(),
        "day_of_week": g["dow"].astype(int).tolist(),
        "time_of_day": g["time_of_day"].map({t: i for i, t in enumerate(TOD_ORDER)}).astype(int).tolist(),
        "arrest": g["Arrest"].astype(int).tolist(),
        "domestic": g["Domestic"].astype(int).tolist(),
        "crimes": g["crimes"].astype(int).tolist()}
    season = lambda m: "Winter" if m in (12, 1, 2) else "Spring" if m in (3, 4, 5) else "Summer" if m in (6, 7, 8) else "Fall"
    lookups = {"primary_type": types, "crime_category_of_type": [cat[t] for t in types], "district": districts,
               "month": yms, "year_of_month": [int(m[:4]) for m in yms],
               "season_of_month": [season(int(m[5:])) for m in yms], "day_of_week": DAY_ORDER,
               "time_of_day": TOD_ORDER, "arrest": [False, True], "domestic": [False, True]}
    return {"description": "Dictionary-coded columnar cube: one row per distinct combination of dims; `crimes` is the "
                           "row count. Filter by selecting dim indices, then sum `crimes` grouped by any dim. Season and "
                           "category are derived through lookups. Rows = whole dataset (handout ground rules).",
            "dims": CUBE_FILTERS, "lookups": lookups, "columns": cols, "rows": int(len(g)),
            "total_crimes": int(g["crimes"].sum())}


def run(load_force=False, bootstrap_reps=15):
    raw = load_raw(force=load_force)
    df, clog = clean(raw)
    df = add_features(df)
    R = {"cleaning_log": clog, "_total": int(len(df))}

    # ---- windows: found from the data -------------------------------------------------------------
    dw = dense_windows(df)
    R["dense_windows_detected"] = dw
    # analysis windows = whole calendar months fully inside the detected dense runs
    def whole_months(w):
        s = pd.Timestamp(w["start"])
        e = pd.Timestamp(w["end"])
        s = s if s.day == 1 else (s + pd.offsets.MonthBegin(1))
        e_next = (e + pd.Timedelta(days=1))
        e = e_next if e_next.day == 1 else e_next.replace(day=1)
        return s, e
    (aS, aE), (bS, bE) = whole_months(dw[0]), whole_months(dw[1])
    A = df[(df["Date"] >= aS) & (df["Date"] < aE)]
    B = df[(df["Date"] >= bS) & (df["Date"] < bE)]
    R["windows"] = {"A": {"start": str(aS.date()), "end_exclusive": str(aE.date()), "records": int(len(A)),
                          "months": int(A["month_start"].nunique())},
                    "B": {"start": str(bS.date()), "end_exclusive": str(bE.date()), "records": int(len(B)),
                          "months": int(B["month_start"].nunique())},
                    "method": "Contiguous runs of >=60 days with >=200 records/day (windows.dense_windows), trimmed to "
                              "whole calendar months. Outside these runs the file holds only 300-900 records/month."}
    wins = {"A": (str(aS.date()), str(aE.date())), "B": (str(bS.date()), str(bE.date()))}
    R["records_outside_windows"] = int(len(df) - len(A) - len(B))

    R["kpis"] = compute_kpis(df)
    charts = build_handout_charts(df)
    # tidy Q10 order, mark cube-filterable
    order = {d: i for i, d in enumerate(DAY_ORDER)}
    tod = {d: i for i, d in enumerate(TOD_ORDER)}
    charts["q10"]["data"] = sorted(charts["q10"]["data"], key=lambda r: (order[r["day_of_week"]], tod[r["time_of_day"]]))
    for k, c in charts.items():
        c["scope"] = "whole_dataset"
        c["filterable_via_cube"] = True
        c["caveats"] = []
        c["subtitle"] = None
    charts["q01"]["caveats"] = ["Handout window only. Outside Mar 2015-Aug 2017 and Oct 2025-Sep 2026 the file is sparse."]
    charts["q01"]["scope"] = "window_A"
    charts["q03"]["caveats"] = ["~41% of 00:00 and ~45% of 12:00 stamps are placeholders; see K7 sensitivity value."]
    charts["q06"]["caveats"] = ["Raw rates are confounded by crime-type mix; see x_arrest_tod_standardised."]
    charts["q09"]["caveats"] = ["Raw rates are confounded by crime-type mix; see x_district_sir."]
    charts["q10"]["caveats"] = ["Includes placeholder-time records (00:00/12:00)."]
    charts["q04"]["caveats"] = ["Only 2016, per handout. 2016 is fully inside window A."]
    ch = dict(charts)

    # ---- coverage --------------------------------------------------------------------------------
    cov = st.coverage(df, wins)
    R["coverage"] = {k: v for k, v in cov.items() if k != "coverage_grid"}
    ch["x_coverage_grid"] = spec("x_coverage_grid", "Records per month: where the file is dense vs sparse", "heatmap",
                                 ax("month", "Month", "ordinal"), ax("records", "Records"), cov["coverage_grid"], "whole_dataset",
                                 order={"rows": list(range(2001, 2027)), "columns": list(range(1, 13))}, row_field="year",
                                 caveats=["Only two periods are near-complete; use these windows for trend claims."])

    # ---- temporal (window A) --------------------------------------------------------------------
    dow, dow_m = st.day_of_week_index(A)
    R["dow"] = dow_m
    R["dow_table"] = dow
    ch["x_dow_index"] = spec("x_dow_index", "Crime per day by weekday vs average day (window A)", "column",
                             ax("day_of_week", "Day of week", "ordinal"), ax("index_vs_avg", "Index (1.00 = average day)"),
                             dow, "window_A", order=DAY_ORDER, window="2015-04..2017-07",
                             note="index = observed / expected given number of each weekday in the window; CI is exact Poisson.",
                             caveats=[f"Effect is small (Cohen's w = {dow_m['cohens_w']:.3f}); weekday matters far less than hour."])
    hp = st.hourly_profile(A)
    R["hourly"] = hp
    ch["x_hour_profile"] = spec("x_hour_profile", "Crimes by hour of day (window A)", "area", ax("hour", "Hour of day", "ordinal"),
                                ax("crimes_all", "Crimes"), hp, "window_A", window="2015-04..2017-07",
                                caveats=["`crimes_excl_placeholder` drops records stamped exactly 00:00/12:00 which are inflated by unknown times."])
    hd = st.hour_dow_matrix(A)
    ch["x_hour_dow_heatmap"] = spec("x_hour_dow_heatmap", "Crimes per day by weekday and hour (window A, placeholder times excluded)",
                                    "heatmap", ax("hour", "Hour", "ordinal"), ax("per_day", "Crimes per day"), hd, "window_A",
                                    order={"rows": DAY_ORDER, "columns": list(range(24))}, row_field="day_of_week",
                                    window="2015-04..2017-07")
    R["hour_dow"] = hd
    by_month, seas, seas_types = st.seasonality(A)
    R["season"] = seas
    R["season_types"] = seas_types
    ch["x_month_per_day"] = spec("x_month_per_day", "Average crimes per day by calendar month (window A)", "column",
                                 ax("month", "Calendar month", "ordinal"), ax("mean", "Crimes per day"), by_month, "window_A",
                                 note="Normalises for month length. Apr-Jul appear 3 times, other months 1-2 times in the window.")
    ch["x_season_types"] = spec("x_season_types", "Summer / winter crime-per-day ratio by crime type (window A)", "bar",
                                ax("crime_type", "Crime type", "nominal"), ax("summer_winter_ratio", "Summer / winter ratio"),
                                seas_types, "window_A", note="Bootstrap 95% CI over days; ratio 1.0 = no seasonality.")
    cl, clm = st.type_hour_clusters(A)
    R["clusters"] = {"rows": cl, **clm}
    ch["x_type_hour_clusters"] = spec("x_type_hour_clusters", "Crime types grouped by shape of their 24-hour profile", "table",
                                      ax("crime_type", "Crime type", "nominal"), ax("records", "Records"), cl, "window_A",
                                      note=f"k-means, k={clm['k']} chosen by silhouette ({clm['silhouette']:.2f}); `profile` = 24 hourly shares, placeholder times excluded.",
                                      caveats=["Silhouette < 0.5: groups are descriptive, not sharply separated."])
    dd, glm = st.daily_glm(A)
    R["glm"] = glm
    dd2 = dd.reset_index().rename(columns={"day": "date", "n": "crimes"})
    ch["x_daily_expected"] = spec("x_daily_expected", "Daily crimes vs model expectation (weekday + month + holiday)", "line",
                                  ax("date", "Date", "temporal"), ax("crimes", "Crimes"), dd2, "window_A",
                                  note="z = robust standardised residual (MAD). |z| > 4 flagged on the anomalies table.",
                                  caveats=[f"Hold-out MAPE {glm['mape_glm']*100:.1f}% (2017-01..07) vs {glm['mape_same_weekday_last_week']*100:.1f}% for 'same weekday last week'."])
    an = st.anomaly_table(dd, A)
    R["anomalies"] = an
    ch["x_anomalies"] = spec("x_anomalies", "Largest daily anomalies (window A)", "table", ax("date", "Date", "temporal"), ax("z", "Robust z"),
                             an, "window_A")
    fom, fom_m = st.first_of_month_artifact(A)
    R["first_of_month"] = {**fom_m, "table": fom}
    ch["x_first_of_month"] = spec("x_first_of_month", "Share of records dated on the 1st of the month, by crime type (window A)", "bar",
                                  ax("crime_type", "Crime type", "nominal"), ax("lift", "Lift vs 1/30.4"), fom, "window_A",
                                  note="If dates were uniform each type would have ~3.3% of records on the 1st.")
    era, era_m = st.era_comparison(A, B)
    R["era"] = era_m
    R["era_table"] = era
    ch["x_era_change"] = spec("x_era_change", "Crime per day: window B vs window A (seasonally matched months)", "bar",
                              ax("name", "Crime type", "nominal"), ax("change_pct", "Change in crimes/day (%)"),
                              era[era["level"] == "type"].sort_values("change_pct"), "both_windows",
                              caveats=["Two non-adjacent periods ~10 years apart; not a trend.",
                                       "Window B is recent: arrests recorded later are not yet reflected, so its arrest rate is likely understated.",
                                       "Window B has almost no coordinates; B may be less complete than A (file is a slice)."])
    ch["x_era_category"] = spec("x_era_category", "Violent / property / other per day: window A vs B", "column",
                                ax("name", "Category", "nominal"), ax("per_day_B", "Crimes per day"),
                                era[era["level"] == "category"], "both_windows", caveats=["See x_era_change caveats."])

    # ---- arrest ---------------------------------------------------------------------------------
    abt = sa.arrest_by_type(A)
    ch["x_arrest_by_type"] = spec("x_arrest_by_type", "Arrest rate by crime type with 95% Wilson CI (window A)", "bar",
                                  ax("Primary Type Harmonised", "Crime type", "nominal"), ax("arrest_rate_pct", "Arrest rate %"),
                                  abt, "window_A", window="2015-04..2017-07")
    R["arrest_type"] = abt
    ts = sa.tod_standardised(A)
    R["tod_std"] = ts
    ch["x_arrest_tod_standardised"] = spec("x_arrest_tod_standardised", "Arrest rate by time of day: raw vs crime-mix standardised (window A)",
                                           "column", ax("time_of_day", "Time of day", "ordinal"), ax("raw_rate_pct", "Arrest rate %"), ts,
                                           "window_A", order=TOD_ORDER,
                                           series=[{"field": "raw_rate_pct", "mark": "bar", "axis": "left"},
                                                   {"field": "standardised_rate_pct", "mark": "line", "axis": "left"}],
                                           note="Direct standardisation to the overall crime-type mix removes the effect of WHAT is reported at each time.")
    sir = sa.district_sir(A)
    R["sir"] = sir
    ch["x_district_sir"] = spec("x_district_sir", "District arrest rate vs expected from its crime-type mix (SIR, window A)", "scatter",
                                ax("expected_rate_pct", "Expected arrest rate %"), ax("raw_rate_pct", "Observed arrest rate %"), sir, "window_A",
                                note="SIR = observed / expected arrests; 95% exact Poisson CI; flag uses BH-FDR < 0.05 and CI excluding 1.",
                                caveats=["Screening tool: overdispersion and spatial correlation are ignored, so CIs are optimistic."])
    ors, imp, cal, mm = sa.arrest_models(A, n_boot=bootstrap_reps)
    ors["note"] = np.where(ors["term"].str.startswith("crime_type") & (ors["odds_ratio"] > 1000),
                           "near-separation: OR unstable; use arrest rate", None)
    R["models"] = mm
    R["importance"] = imp
    ch["x_arrest_odds_ratios"] = spec("x_arrest_odds_ratios", "Adjusted odds of arrest (logistic regression, window A)", "bar",
                                      ax("term", "Factor level", "nominal"), ax("odds_ratio", "Odds ratio"), ors.sort_values("odds_ratio"), "window_A",
                                      note="Reference = most common level of each factor; CIs are bootstrap percentiles.",
                                      caveats=[f"CIs from {bootstrap_ratio_reps(mm)} bootstrap reps: indicative. Odds ratios for near-100%-arrest types are unstable."])
    ch["x_arrest_importance"] = spec("x_arrest_importance", "What predicts arrest? Permutation importance (AUC drop, temporal hold-out)", "bar",
                                     ax("feature", "Feature", "nominal"), ax("auc_drop", "AUC drop when shuffled"), imp, "window_A",
                                     note=f"Gradient boosting AUC {mm['auc_gradient_boosting']:.3f}; logistic {mm['auc_logistic']:.3f}; trained <{mm['test_from']}, tested after.")
    ch["x_arrest_calibration"] = spec("x_arrest_calibration", "Calibration of arrest model on hold-out months", "scatter",
                                      ax("predicted_pct", "Predicted arrest %"), ax("observed_pct", "Observed arrest %"), cal, "window_A")
    dvn = sa.domestic_vs_nondomestic(A)
    ch["x_domestic_vs_non"] = spec("x_domestic_vs_non", "Arrest rate: domestic vs non-domestic, by crime type (window A)", "bar",
                                   ax("crime_type", "Crime type", "nominal"), ax("domestic_arrest_pct", "Arrest rate %"), dvn, "window_A")
    R["domestic_vs_non"] = dvn
    dh, dwk = sa.domestic_profile(A)
    R["domestic_hour"] = dh
    ch["x_domestic_by_hour"] = spec("x_domestic_by_hour", "Domestic share of crimes by hour (window A, placeholder times excluded)", "line",
                                    ax("hour", "Hour", "ordinal"), ax("domestic_share_pct", "Domestic share %"), dh, "window_A")
    locp, loct = sa.location_profile(A)
    R["location"] = locp
    ch["x_location_profile"] = spec("x_location_profile", "Top locations: volume, arrest rate and domestic share (window A)", "table",
                                    ax("Location Description", "Location", "nominal"), ax("crimes", "Crimes"), locp, "window_A")
    ch["x_location_by_type"] = spec("x_location_by_type", "Crime-type mix inside the top 8 locations (window A)", "heatmap",
                                    ax("crime_type", "Crime type", "nominal"), ax("share_pct", "Share of location's crimes %"), loct, "window_A",
                                    row_field="location")

    # ---- spatial (window A, where coordinates exist) ---------------------------------------------
    lq, lq_top = sg.location_quotients(A)
    R["lq_top"] = lq_top
    ch["x_district_lq"] = spec("x_district_lq", "What each district over-indexes on: location quotient by crime type (window A)", "heatmap",
                               ax("crime_type", "Crime type", "nominal"), ax("lq", "Location quotient (1 = citywide share)"), lq, "window_A", row_field="District",
                               note="LQ = district share of type / citywide share of type.")
    lor, conc = sg.concentration(A)
    R["concentration"] = conc
    ch["x_beat_lorenz"] = spec("x_beat_lorenz", "Concentration of crime across police beats (Lorenz curve, window A)", "line",
                               ax("beat_share_pct", "Cumulative share of beats %"), ax("crime_share_pct", "Cumulative share of crimes %"), lor, "window_A")
    ca = sg.community_areas(A)
    ch["x_community_areas"] = spec("x_community_areas", "Crimes by community-area code (window A)", "bar", ax("community_area", "Community area (code)", "nominal"),
                                   ax("crimes", "Crimes"), ca, "window_A", caveats=["Names/boundaries are not in the file; codes only."])
    R["geo"] = {"centroids": sg.district_centroids(A), "grid": sg.grid_density(A), "community_areas": ca,
                "coords_share_A": float(A["has_coords"].mean()), "coords_share_B": float(B["has_coords"].mean())}

    R["cube"] = build_cube(df)
    R["charts"] = ch
    R["frames"] = {"df": df, "A": A, "B": B}
    return R


def bootstrap_ratio_reps(mm):
    return mm["bootstrap_reps"]
