"""Handout visuals Q1-Q10 as tidy, pre-sorted records."""
import pandas as pd
from config import TREND_START, TREND_END, DAY_ORDER, TOD_ORDER, SEASON_ORDER, CATEGORY_ORDER

CRIMES_Y = {"field": "crimes", "label": "Number of crimes", "type": "quantitative"}


def _chart(id_, ref, title, ctype, x, y, data, series=None, order=None, note=None, window=None, **extra):
    d = dict(id=id_, handout_ref=ref, title=title, chart_type=ctype, x=x, y=y, series=series,
             order=order, note=note, window=window, data=data)
    d.update(extra)
    return d


def _recs(df):
    return df.to_dict("records")


def _count(df, key, order=None):
    s = df.groupby(key).size()
    if order is not None:
        s = s.reindex(order)
    return s.rename("crimes").reset_index()


def build_handout_charts(df: pd.DataFrame):
    out = {}
    w = df[(df["month_start"] >= TREND_START) & (df["month_start"] <= TREND_END)]
    m = _count(w, "month_start")
    m["month"] = m["month_start"].dt.strftime("%Y-%m")
    m["label"] = m["month_start"].dt.strftime("%b %Y")
    out["q01"] = _chart("q01", "Q1", "Monthly crime count, Apr 2015 - Jul 2017", "line",
                        {"field": "month", "label": "Month", "type": "temporal"}, CRIMES_Y,
                        _recs(m[["month", "label", "crimes"]]), window="2015-04..2017-07")
    out["q02"] = _chart("q02", "Q2", "Crimes by day of week", "column",
                        {"field": "day_of_week", "label": "Day of week", "type": "ordinal"}, CRIMES_Y,
                        _recs(_count(df, "day_of_week", DAY_ORDER)), order=DAY_ORDER)
    out["q03"] = _chart("q03", "Q3", "Crimes by time of day", "column",
                        {"field": "time_of_day", "label": "Time of day", "type": "ordinal"}, CRIMES_Y,
                        _recs(_count(df, "time_of_day", TOD_ORDER)), order=TOD_ORDER,
                        note="Night=00:00-05:59, Morning=06:00-11:59, Afternoon=12:00-17:59, Evening=18:00-23:59")
    out["q04"] = _chart("q04", "Q4", "Crimes by season, 2016", "column",
                        {"field": "season", "label": "Season", "type": "ordinal"}, CRIMES_Y,
                        _recs(_count(df[df["Year"] == 2016], "season", SEASON_ORDER)), order=SEASON_ORDER,
                        window="2016",
                        note="Season from month (Winter=Dec,Jan,Feb). Winter here = Jan, Feb, Dec of calendar 2016.")
    c = _count(df, "crime_category", CATEGORY_ORDER)
    c["share_pct"] = c["crimes"] / c["crimes"].sum() * 100
    out["q05"] = _chart("q05", "Q5", "Share of Violent / Property / Other crimes", "donut",
                        {"field": "crime_category", "label": "Category", "type": "nominal"}, CRIMES_Y,
                        _recs(c), order=CATEGORY_ORDER)
    a = df.groupby("time_of_day")["Arrest"].agg(["sum", "size"]).reindex(TOD_ORDER)
    a = a.rename(columns={"sum": "arrests", "size": "crimes"}).reset_index()
    a["arrest_rate_pct"] = a["arrests"] / a["crimes"] * 100
    out["q06"] = _chart("q06", "Q6", "Arrest rate % by time of day", "column",
                        {"field": "time_of_day", "label": "Time of day", "type": "ordinal"},
                        {"field": "arrest_rate_pct", "label": "Arrest rate %", "type": "quantitative"},
                        _recs(a), order=TOD_ORDER)
    p = _count(df, "Primary Type").sort_values("crimes", ascending=False).head(10)
    out["q07"] = _chart("q07", "Q7", "Top 10 crime types", "bar",
                        {"field": "Primary Type", "label": "Crime type", "type": "nominal"}, CRIMES_Y, _recs(p))
    p = _count(df[df["Domestic"]], "Primary Type").sort_values("crimes", ascending=False).head(5)
    out["q08"] = _chart("q08", "Q8", "Top 5 crime types by domestic crimes", "bar",
                        {"field": "Primary Type", "label": "Crime type", "type": "nominal"},
                        {"field": "crimes", "label": "Domestic crimes", "type": "quantitative"}, _recs(p))
    g = df.groupby("District")["Arrest"].agg(["sum", "size"]).rename(columns={"sum": "arrests", "size": "crimes"})
    g = g.sort_values("crimes", ascending=False).head(10).reset_index()
    g["arrest_rate_pct"] = g["arrests"] / g["crimes"] * 100
    out["q09"] = _chart("q09", "Q9", "Top 10 districts: crimes (bars) and arrest rate % (line, secondary axis)",
                        "combo", {"field": "District", "label": "Police district", "type": "nominal"}, CRIMES_Y,
                        _recs(g), series=[{"field": "crimes", "mark": "bar", "axis": "left"},
                                          {"field": "arrest_rate_pct", "mark": "line", "axis": "right"}])
    out["q10"] = _chart("q10", "Q10", "Crimes by day of week and time of day", "heatmap",
                        {"field": "time_of_day", "label": "Time of day", "type": "ordinal"}, CRIMES_Y,
                        _recs(_count(df, ["day_of_week", "time_of_day"])),
                        order={"rows": DAY_ORDER, "columns": TOD_ORDER}, row_field="day_of_week")
    return out
