"""Handout KPIs K1-K8. Whole dataset unless the question states a period. Includes a sensitivity variant for K7."""
import pandas as pd
from config import TREND_START, TREND_END


def _kpi(id_, label, value, unit, formula, num=None, den=None, **extra):
    d = {"id": id_, "label": label, "value": value, "unit": unit, "formula": formula,
         "numerator": num, "denominator": den}
    d.update(extra)
    return d


def compute_kpis(df: pd.DataFrame):
    n = len(df)
    arrests = int(df["Arrest"].sum())
    dom = int(df["Domestic"].sum())
    night = int((df["time_of_day"] == "Night").sum())
    viol = int((df["crime_category"] == "Violent").sum())
    w = df[(df["month_start"] >= TREND_START) & (df["month_start"] <= TREND_END)]
    months = int(w["month_start"].nunique())
    nd = df[~df["default_time"]]
    night_nd = int((nd["time_of_day"] == "Night").sum())
    return [
        _kpi("K1", "Total crimes", n, "count", "rows in dataset"),
        _kpi("K2", "Arrest rate", arrests / n * 100, "%", "Arrest=TRUE / total", arrests, n),
        _kpi("K3", "Domestic crime", dom / n * 100, "%", "Domestic=TRUE / total", dom, n),
        _kpi("K4", "Different crime types", int(df["Primary Type"].nunique()), "count",
             "distinct Primary Type (raw labels)", harmonised_value=int(df["Primary Type Harmonised"].nunique()),
             note="CRIM SEXUAL ASSAULT and CRIMINAL SEXUAL ASSAULT are separate raw labels (handout lists both)."),
        _kpi("K5", "Crimes in 2016", int((df["Year"] == 2016).sum()), "count", "rows with Year=2016"),
        _kpi("K6", "Avg crimes per month (Apr 2015-Jul 2017)", len(w) / months, "count/month",
             "rows in window / months in window", len(w), months),
        _kpi("K7", "Night-time crime (00:00-05:59)", night / n * 100, "%", "Time of Day=Night / total", night, n,
             sensitivity_value=night_nd / len(nd) * 100,
             sensitivity_note=f"Excluding {int(df['default_time'].sum()):,} records stamped exactly 00:00/12:00 "
                              "(placeholder-time artefact). Handout-literal value is `value`."),
        _kpi("K8", "Violent crime", viol / n * 100, "%", "Category=Violent / total", viol, n),
    ]
