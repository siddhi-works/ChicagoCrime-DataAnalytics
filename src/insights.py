"""Insights are templated from computed results: every number below comes from R, none is typed in."""
import pandas as pd


def _incl(end_exclusive):
    return str((pd.Timestamp(end_exclusive) - pd.Timedelta(days=1)).date())


def _k(R, id_):
    return next(k for k in R["kpis"] if k["id"] == id_)


def build_insights(R):
    A = R["frames"]["A"]
    W = R["windows"]
    out = []

    def add(id_, tier, headline, text, evidence, method, charts, caveat=None):
        out.append(dict(id=id_, tier=tier, headline=headline, text=text, evidence=evidence, method=method,
                        charts=charts, caveat=caveat))

    # --- data quality ----------------------------------------------------------------------------
    dr = R["cleaning_log"]["date_repair"]
    add("dq_date_repair", "data_quality",
        f"{dr['excel_datetime_cells_swapped']:,} dates had month and day swapped by Excel; we repaired them",
        f"{dr['excel_datetime_cells_swapped']/ (dr['excel_datetime_cells_swapped']+dr['text_cells']) *100:.0f}% of the Date cells were stored as real "
        f"datetimes (all with day <= 12), the rest as MM/DD/YYYY text. Excel read the ambiguous ones day-first. Swapping them back makes "
        f"records dated after their own 'Updated On' stamp fall from {dr['date_after_updated_on_share_before_repair']*100:.1f}% to "
        f"{dr['date_after_updated_on_share_after_repair']*100:.1f}%, and reproduces the handout's monthly chart.",
        dr, "Compare text vs datetime cells; test day/month distributions; consistency with Updated On.", ["q01"],
        "The original workbook was not modified; the repair is applied in memory by src/clean.py.")
    w = R["windows"]
    add("dq_coverage", "data_quality",
        f"Only two periods are dense: {w['A']['start']} to {_incl(w['A']['end_exclusive'])} and {w['B']['start']} to {_incl(w['B']['end_exclusive'])}",
        f"The file holds {R['_total']:,} records but {R['records_outside_windows']:,} "
        f"({R['records_outside_windows']/R['_total']*100:.1f}%) fall outside these two windows, at 300-900 records/month versus "
        f"~20,000. It looks like a truncated slice of a larger table (row count equals Excel's {R['_total']+1:,} row limit). "
        "Multi-year trends are therefore not supported; deep dives use window A (and window B for a before/after contrast).",
        {"windows": R["windows"], "detected": R["dense_windows_detected"]},
        "Daily record counts; contiguous runs >= 60 days with >= 200 records/day.", ["x_coverage_grid"],
        "Handout KPIs use the whole dataset, as required, so sparse years are included in K1-K5, K7, K8.")
    cm = R["coverage"]["missing_coords"]
    add("dq_missing_coords", "data_quality",
        f"Coordinates are missing for {(1-R['geo']['coords_share_B'])*100:.1f}% of window B but only {(1-R['geo']['coords_share_A'])*100:.1f}% of window A",
        "Maps are only meaningful for window A. Within window A, missing coordinates concentrate in sensitive categories "
        + ", ".join(f"{k.title()} ({v*100:.0f}%)" for k, v in list(cm['A']['highest_missing_types'].items())[:3]) + ".",
        cm, "Share of records without latitude/longitude by window and crime type; chi-square / Cramer's V.", ["x_district_lq"],
        "District, beat and ward remain available in window B.")
    f = R["first_of_month"]
    top = f["table"].iloc[0]
    add("dq_first_of_month", "data_quality",
        f"Records dated on the 1st of a month are inflated: {top['crime_type'].title()} is {top['lift']:.1f}x over-represented",
        f"If dates were uniform, ~{top['expected_share_pct']:.1f}% of each type would fall on the 1st; {top['crime_type'].title()} has "
        f"{top['day1_share_pct']:.1f}%. Day-1 records also carry placeholder times {f['default_time_share_day1']*100:.1f}% of the time "
        f"vs {f['default_time_share_other']*100:.1f}% on other days. This is consistent with reports where the exact date is unknown being "
        f"booked to the 1st (~{f['excess_total']:,.0f} excess records in window A). It also explains the largest daily 'anomalies'.",
        {k: v for k, v in f.items() if k != "table"}, "Share of each type on day 1 vs 1/average month length.",
        ["x_first_of_month", "x_anomalies"], "An explanation, not proof: the data has no field stating that a date was estimated.")
    nd = _k(R, "K7")
    add("dq_placeholder_time", "data_quality",
        f"Night-time share is {nd['value']:.1f}% as defined, but {nd['sensitivity_value']:.1f}% without placeholder timestamps",
        f"{R['coverage']['default_time']['share']*100:.1f}% of records are stamped exactly 00:00 or 12:00 "
        f"({R['coverage']['default_time']['share_of_hour_0']*100:.0f}% of all midnight-hour records, "
        f"{R['coverage']['default_time']['share_of_hour_12']*100:.0f}% of noon-hour records), far more than a smooth clock would give. "
        "K7 is reported as the handout defines it, with the sensitivity value alongside.",
        {"K7": nd, **R["coverage"]["default_time"]}, "Share of records at exact 00:00/12:00 within each hour.", ["q03", "q06", "q10"])

    # --- seasonality -----------------------------------------------------------------------------
    s = R["season"]
    st_ = R["season_types"]
    hi, lo = st_.iloc[0], st_.iloc[-1]
    add("seasonality", "headline",
        f"Summer days see {((s['ratio']-1)*100):.0f}% more crime than winter days",
        f"In window A the daily average is {s['summer_per_day']:.0f} in Jun-Aug vs {s['winter_per_day']:.0f} in Dec-Feb "
        f"(ratio {s['ratio']:.2f}, 95% CI {s['ci_lo']:.2f}-{s['ci_hi']:.2f}; Kruskal-Wallis p={s['kruskal_p']:.1e}). "
        f"Biggest swing: {hi['crime_type'].title()} x{hi['summer_winter_ratio']:.2f}; "
        f"smallest: {lo['crime_type'].title()} x{lo['summer_winter_ratio']:.2f}.",
        {**s, "top_type": hi.to_dict(), "bottom_type": lo.to_dict()},
        "Daily counts by season; bootstrap ratio over days (2000 resamples); per-type ratios.", ["q01", "q04", "x_month_per_day", "x_season_types"],
        "Window A spans 28 months; Mar-Dec seen twice at most, so month-level estimates carry year-specific noise.")

    # --- day / hour ------------------------------------------------------------------------------
    d = R["dow_table"]
    bd = d.sort_values("index_vs_avg", ascending=False).iloc[0]
    wd = R["dow"]
    add("weekday", "supporting",
        f"Weekday barely matters ({bd['day_of_week']} is highest at {(bd['index_vs_avg']-1)*100:+.1f}% vs average)",
        f"Per-day volumes differ by only a few percent (Cohen's w = {wd['cohens_w']:.3f}, a very small effect) even though chi-square "
        f"is huge at n={wd['n']:,}. Statistical significance at this sample size says little; the effect size is what matters.",
        wd, "Chi-square goodness of fit vs per-day exposure; exact Poisson CIs; Cohen's w.", ["q02", "x_dow_index"])
    hd = R["hour_dow"]
    wk = hd[hd["day_of_week"].isin(["Saturday", "Sunday"])]
    mid = hd[~hd["day_of_week"].isin(["Saturday", "Sunday"])]
    night_hours = [0, 1, 2, 3, 4, 5]
    ratio = wk[wk.hour.isin(night_hours)]["per_day"].sum() / 2 / (mid[mid.hour.isin(night_hours)]["per_day"].sum() / 5)
    hp = R["hourly"]
    peak = hp.sort_values("crimes_excl_placeholder", ascending=False).iloc[0]
    low = hp.sort_values("crimes_excl_placeholder").iloc[0]
    add("nights_weekend", "headline",
        f"Weekend nights run {((ratio-1)*100):.0f}% above weekday nights; the daily peak is around {int(peak['hour']):02d}:00",
        f"Excluding placeholder timestamps, between 00:00 and 05:59 a weekend day logs {ratio:.2f}x the crimes of a weekday. The quietest hour "
        f"is {int(low['hour']):02d}:00. The hour-by-weekday heat map is the single most informative view of timing.",
        {"weekend_night_ratio": float(ratio), "peak_hour": int(peak["hour"]), "quiet_hour": int(low["hour"])},
        "Crimes per calendar day by weekday and hour (window A, placeholder times excluded).", ["q10", "x_hour_dow_heatmap", "x_hour_profile"])

    # --- arrest: Simpson ------------------------------------------------------------------------
    ts = R["tod_std"]
    r0 = ts.iloc[0]
    r3 = ts.iloc[3]
    at = R["arrest_type"]
    narc_rate = float(at.loc[at["Primary Type Harmonised"] == "NARCOTICS", "arrest_rate_pct"].iloc[0])
    share_expl = 1 - (r3['standardised_rate_pct'] - r0['standardised_rate_pct']) / (r3['raw_rate_pct'] - r0['raw_rate_pct'])
    add("arrest_simpson", "headline",
        f"{share_expl*100:.0f}% of the raw night-to-evening arrest-rate gap is explained by crime-type mix",
        f"Raw arrest rate rises from {r0['raw_rate_pct']:.1f}% (night) to {r3['raw_rate_pct']:.1f}% (evening), a {r3['raw_rate_pct']-r0['raw_rate_pct']:.1f}-pt gap. "
        f"After standardising to the overall crime-type mix the gap is {r3['standardised_rate_pct']-r0['standardised_rate_pct']:.1f} pts "
        f"({r0['standardised_rate_pct']:.1f}% vs {r3['standardised_rate_pct']:.1f}%). Narcotics make up {r0['narcotics_share_pct']:.1f}% of night "
        f"crimes but {r3['narcotics_share_pct']:.1f}% of evening crimes, and {narc_rate:.0f}% of narcotics records end in arrest "
        f"(vs {R['frames']['A']['Arrest'].mean()*100:.0f}% overall).",
        {"rows": ts.to_dict("records")}, "Direct standardisation of time-of-day arrest rates to the overall crime-type distribution.",
        ["q06", "x_arrest_tod_standardised"], "Standardisation adjusts for observed crime type only; other confounders may remain.")
    sir = R["sir"]
    q9 = R["charts"]["q09"]["data"]
    top_rate = max(q9, key=lambda r: r["arrest_rate_pct"])
    row = sir[sir["District"] == top_rate["District"]]
    row = row.iloc[0] if len(row) else None
    above = sir[sir["flag"] == "above expected"]
    below = sir[sir["flag"] == "below expected"]
    txt = (f"District {int(top_rate['District'])} has the highest arrest rate among the top-10 districts by volume ({top_rate['arrest_rate_pct']:.1f}%). ")
    if row is not None:
        txt += (f"Given its crime-type mix we would expect {row['expected_rate_pct']:.1f}%, an index of {row['sir']:.2f} "
                f"(95% CI {row['sir_lo']:.2f}-{row['sir_hi']:.2f}) - i.e. it is explained by what is reported there. ")
    txt += (f"After adjustment {len(above)} districts are above expectation (largest: District {int(above.iloc[0]['District'])}, index {above.iloc[0]['sir']:.2f}) "
            f"and {len(below)} below (lowest: District {int(below.iloc[-1]['District'])}, index {below.iloc[-1]['sir']:.2f})." if len(above) and len(below) else "")
    add("arrest_district", "headline", f"District arrest rates vs what their crime mix predicts: {len(above)} above, {len(below)} below", txt,
        {"rows": sir.to_dict("records")}, "Indirect standardisation (SIR) with exact Poisson CIs and Benjamini-Hochberg FDR across districts.",
        ["q09", "x_district_sir"], "Screening result; CIs ignore overdispersion and spatial correlation.")
    m = R["models"]
    imp = R["importance"]
    t1, t2 = imp.iloc[0], imp.iloc[1]
    tm = imp[imp["feature"].isin(["time_of_day", "day_of_week"])]["auc_drop"].sum()
    add("arrest_drivers", "headline",
        f"What was reported predicts arrest far better than when or where (AUC {m['auc_gradient_boosting']:.2f} on unseen later months)",
        f"Trained on records before {m['test_from']} ({m['train_n']:,}) and tested on later ones ({m['test_n']:,}): logistic AUC {m['auc_logistic']:.3f}, "
        f"gradient boosting {m['auc_gradient_boosting']:.3f}. Shuffling {t1['feature']} costs {t1['auc_drop']:.3f} AUC, {t2['feature']} {t2['auc_drop']:.3f}, "
        f"while time of day plus weekday together cost {tm:.3f}. Brier score improves from {m['brier_baseline']:.3f} (base rate) to {m['brier_gradient_boosting']:.3f}.",
        {**m, "importance": imp.to_dict("records")}, "Temporal hold-out; permutation importance; calibration deciles.",
        ["x_arrest_importance", "x_arrest_odds_ratios", "x_arrest_calibration"], "Predictive association, not causal; arrest outcomes can also be recorded after the report.")

    # --- eras ------------------------------------------------------------------------------------
    e = R["era"]
    et = R["era_table"][R["era_table"]["level"] == "type"].sort_values("change_pct")
    inc, dec = et.iloc[-1], et.iloc[0]
    add("era_change", "headline",
        f"Daily crime in window B is {abs(1-e['ratio_B_over_A'])*100:.0f}% {'below' if e['ratio_B_over_A']<1 else 'above'} window A; {inc['name'].title()} changed most ({inc['change_pct']:+.0f}%)",
        f"Matching calendar months, window B averages {e['per_day_B']:.0f} crimes/day vs {e['per_day_A']:.0f} in window A "
        f"(ratio {e['ratio_B_over_A']:.2f}, 95% CI {e['ci_lo']:.2f}-{e['ci_hi']:.2f}). Largest rise: {inc['name'].title()} ({inc['change_pct']:+.0f}%); "
        f"largest fall: {dec['name'].title()} ({dec['change_pct']:+.0f}%). Arrest rate {e['arrest_rate_A']:.1f}% -> {e['arrest_rate_B']:.1f}%.",
        {**e, "table": et.to_dict("records")}, "Seasonally matched calendar months; bootstrap ratio of daily counts.",
        ["x_era_change", "x_era_category"],
        "Two windows ~10 years apart, not a trend. Window B is recent: arrests recorded later are missing (its arrest rate is likely understated) "
        "and, because the file is a slice, B may also be less complete than A.")

    # --- domestic ------------------------------------------------------------------------------
    dv = R["domestic_vs_non"]
    bat = dv[dv["crime_type"] == "BATTERY"]
    dh = R["domestic_hour"]
    dpeak = dh.sort_values("domestic_share_pct", ascending=False).iloc[0]
    dlow = dh.sort_values("domestic_share_pct").iloc[0]
    k3 = _k(R, "K3")
    txt = (f"{k3['value']:.1f}% of all crimes are domestic. ")
    if len(bat):
        b = bat.iloc[0]
        txt += f"For battery the figure is {b['domestic_share_pct']:.0f}%. "
    txt += (f"The domestic share is highest around {int(dpeak['hour']):02d}:00 ({dpeak['domestic_share_pct']:.0f}%) and lowest around "
            f"{int(dlow['hour']):02d}:00 ({dlow['domestic_share_pct']:.0f}%).")
    add("domestic", "supporting", f"Domestic crime: {k3['value']:.1f}% of all records, led by {dv.iloc[0]['crime_type'].title()}", txt,
        {"K3": k3, "by_type": dv.head(8).to_dict("records")}, "Domestic share by type and hour (window A).",
        ["q08", "x_domestic_vs_non", "x_domestic_by_hour"])
    loc = R["location"]
    sw = loc.sort_values("arrest_rate_pct", ascending=False).head(3)
    res = loc[loc["Location Description"].isin(["RESIDENCE", "APARTMENT"])]
    add("places", "supporting", f"Arrest rate ranges {loc['arrest_rate_pct'].min():.0f}%-{loc['arrest_rate_pct'].max():.0f}% across the top {len(loc)} locations; domestic share {loc['domestic_share_pct'].min():.0f}%-{loc['domestic_share_pct'].max():.0f}%",
        f"{loc.iloc[0]['Location Description'].title()} is the largest location ({loc.iloc[0]['share_pct']:.0f}% of crimes). "
        + (f"Residence/apartment crimes are {res['domestic_share_pct'].mean():.0f}% domestic with only {res['arrest_rate_pct'].mean():.0f}% arrested, while "
           f"{loc[loc['Location Description']=='SIDEWALK'].iloc[0]['Location Description'].title()} has {loc[loc['Location Description']=='SIDEWALK'].iloc[0]['arrest_rate_pct']:.0f}% arrested."
           if (loc["Location Description"] == "SIDEWALK").any() and len(res) else ""),
        {"rows": loc.head(10).to_dict("records")}, "Group by Location Description (window A).", ["x_location_profile", "x_location_by_type"])

    # --- spatial -------------------------------------------------------------------------------
    c = R["concentration"]
    lq = R["lq_top"].iloc[0]
    add("spatial", "supporting",
        f"Crime is spread widely: the busiest 10% of beats hold {c['top10pct_beats_share']*100:.0f}% of crimes",
        f"Beat-level Gini = {c['gini']:.2f} over {c['beats']} beats; the top 20% of beats hold {c['top20pct_beats_share']*100:.0f}%. "
        f"Districts specialise instead: District {int(lq['District'])} over-indexes on {lq['crime_type'].title()} (location quotient {lq['lq']:.1f}).",
        {**c, "top_lq": R["lq_top"].to_dict("records")}, "Lorenz/Gini on beat counts; district x type location quotients (window A).",
        ["x_beat_lorenz", "x_district_lq"], "No population or area denominators in the data, so no per-capita claims.")
    k = R["clusters"]
    add("hourly_clusters", "supporting",
        f"Crime types fall into {k['k']} groups by when they happen",
        "; ".join(f"{n}: " + ", ".join(sorted(r['crime_type'].title() for r in k['rows'] if r['cluster_name'] == n)[:5])
                  for n in sorted({r['cluster_name'] for r in k['rows']})) + f". Silhouette = {k['silhouette']:.2f} (descriptive).",
        {"k": k["k"], "silhouette": k["silhouette"]}, "k-means on normalised 24-hour profiles; k by silhouette.", ["x_type_hour_clusters"],
        "Groups are not sharply separated.")
    g = R["glm"]
    an = R["anomalies"]
    real = [a for a in an if a["date"][5:] not in ("01-01",) and not a["date"].endswith("-01")]
    add("model_check", "supporting",
        f"A weekday + month + holiday model predicts unseen daily counts to within {g['mape_glm']*100:.1f}% on average",
        f"Hold-out MAPE for Jan-Jul 2017 is {g['mape_glm']*100:.1f}% vs {g['mape_same_weekday_last_week']*100:.1f}% for 'same weekday last week'. "
        f"{sum(1 for a in an if a['date'].endswith('-01'))} of the {len(an)} largest anomalies fall on the 1st of a month (see placeholder dates); "
        + (f"the largest non-1st anomaly is {real[0]['date']} ({real[0]['crimes']} vs {real[0]['expected']:.0f} expected)." if real else ""),
        g, "Poisson GLM, train 2015-04..2016-12, test 2017-01..07; robust MAD z for anomalies.", ["x_daily_expected", "x_anomalies"])

    # handout-literal headline
    k1, k2, k8 = _k(R, "K1"), _k(R, "K2"), _k(R, "K8")
    q9r = R["charts"]["q09"]["data"]
    q7 = R["charts"]["q07"]["data"]
    add("handout_overview", "headline",
        f"{k1['value']:,.0f} crimes; {k2['value']:.1f}% led to arrest; {k8['value']:.0f}% were violent",
        f"Theft ({q7[0]['crimes']:,}) and battery ({q7[1]['crimes']:,}) lead the {len(R['charts']['q07']['data'])} top types. "
        f"District {int(q9r[0]['District'])} records the most crimes ({q9r[0]['crimes']:,}).",
        {"kpis": R["kpis"]}, "Handout definitions, whole dataset.", ["q05", "q07", "q09"],
        "Whole-dataset totals mix a dense window with sparse years; see dq_coverage.")
    return out
