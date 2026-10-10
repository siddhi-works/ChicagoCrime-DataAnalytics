"""Write everything Person 2 consumes into export/. All files validated against pydantic contracts."""
import gzip
import hashlib
import json
import math
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from config import EXPORT, ROOT, SOURCE_XLSX, CLEAN
from schema_models import ChartSpec, KPI, Insight, Manifest, ManifestEntry, Cube
from statlib import clean_records
from tsgen import schema_to_ts

DEFINITIONS = {
    "time_of_day": "Night 00:00-05:59, Morning 06:00-11:59, Afternoon 12:00-17:59, Evening 18:00-23:59 (hour of Date).",
    "season": "Winter Dec-Feb, Spring Mar-May, Summer Jun-Aug, Fall Sep-Nov (by month of Date).",
    "crime_category": "Violent: ASSAULT, BATTERY, ROBBERY, HOMICIDE, CRIM SEXUAL ASSAULT, CRIMINAL SEXUAL ASSAULT, KIDNAPPING. "
                      "Property: THEFT, BURGLARY, MOTOR VEHICLE THEFT, CRIMINAL DAMAGE, ARSON. Other: everything else.",
    "arrest_rate": "Arrest=TRUE rows / all rows in scope.",
}

COLUMN_DOC = {
    "ID": "Unique record id.", "Case Number": "CPD case number (13 repeated across distinct ids: kept).",
    "Date": "Incident timestamp. REPAIRED: Excel-converted cells had month/day swapped; swapped back.",
    "Block": "Partially redacted street block.", "IUCR": "Illinois Uniform Crime Reporting code.",
    "Primary Type": "Raw crime category (33 labels).", "Primary Type Harmonised": "Primary Type with CRIM SEXUAL ASSAULT merged into CRIMINAL SEXUAL ASSAULT (32 labels).",
    "Description": "Detailed offence description.", "Location Description": "Type of place; nulls filled 'UNKNOWN'.",
    "Arrest": "True if an arrest was made.", "Domestic": "True if domestic-related.", "Beat": "Police beat code.",
    "District": "Police district code.", "Ward": "City ward (nullable).", "Community Area": "Community area code (0 -> null).",
    "FBI Code": "FBI classification code.", "X Coordinate": "State-plane x (nulled if outside Chicago).",
    "Y Coordinate": "State-plane y.", "Year": "Year column from source (equals Date.year after repair).",
    "Latitude": "WGS84 latitude (nulled if outside Chicago bbox).", "Longitude": "WGS84 longitude.",
    "has_coords": "Derived: coordinates present.", "hour": "Derived: hour of Date.", "month": "Derived: calendar month.",
    "month_start": "Derived: first day of month (handout 'Month Start').", "day": "Derived: calendar date.",
    "day_of_week": "Derived: weekday name.", "dow": "Derived: 0=Monday.", "is_weekend": "Derived: Sat/Sun.",
    "time_of_day": DEFINITIONS["time_of_day"], "season": DEFINITIONS["season"], "crime_category": DEFINITIONS["crime_category"],
    "default_time": "Derived: timestamp is exactly 00:00 or 12:00 (frequently a placeholder for unknown time).",
}


def _san(o):
    if isinstance(o, dict):
        return {str(k): _san(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_san(v) for v in o]
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating, float)):
        o = float(o)
        return None if (math.isnan(o) or math.isinf(o)) else round(o, 6)
    if isinstance(o, (np.bool_,)):
        return bool(o)
    if isinstance(o, (pd.Timestamp, datetime)):
        return o.strftime("%Y-%m-%d")
    if isinstance(o, pd.DataFrame):
        return _san(clean_records(o))
    if o is pd.NA or o is pd.NaT:
        return None
    return o


def dump(path, obj, indent=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    txt = json.dumps(_san(obj), indent=indent, ensure_ascii=False, allow_nan=False, separators=(",", ":") if indent is None else None)
    path.write_text(txt, encoding="utf-8")
    return path


def sha(path):
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()[:16]


def write_all(R):
    ex = EXPORT
    entries = []

    def reg(path, id_, kind, title, **kw):
        entries.append(ManifestEntry(id=id_, file=str(path.relative_to(ex)).replace("\\", "/"), kind=kind, title=title,
                                     sha256=sha(path), **kw))

    # ---- kpis ----------------------------------------------------------------------------------
    kp = [KPI(**k).model_dump() for k in map(_san, R["kpis"])]
    p = dump(ex / "kpis.json", kp, indent=1)
    reg(p, "kpis", "kpis", "Handout KPI cards K1-K8", rows=len(kp))

    # ---- charts --------------------------------------------------------------------------------
    for cid, c in R["charts"].items():
        c = _san(c)
        spec = ChartSpec(**c).model_dump()
        p = dump(ex / "charts" / f"{cid}.json", spec)
        reg(p, cid, "chart", spec["title"], handout_ref=spec["handout_ref"], chart_type=spec["chart_type"], scope=spec["scope"],
            filterable_via_cube=spec["filterable_via_cube"], rows=len(spec["data"]))

    # ---- cube ----------------------------------------------------------------------------------
    cube = Cube(**R["cube"]).model_dump()
    p = dump(ex / "cube" / "cube.json", cube)
    with gzip.open(ex / "cube" / "cube.json.gz", "wb", compresslevel=9) as f:
        f.write(p.read_bytes())
    reg(p, "cube", "cube", "Filter cube (whole dataset, dictionary-coded)", rows=cube["rows"], filterable_via_cube=True)
    reg(ex / "cube" / "cube.json.gz", "cube_gz", "cube", "Gzipped copy of cube.json", rows=cube["rows"])
    pd.DataFrame(cube["columns"]).to_parquet(ex / "cube" / "cube.parquet", index=False)
    reg(ex / "cube" / "cube.parquet", "cube_parquet", "cube", "Cube as parquet (DuckDB-WASM/Arrow); dictionaries in cube.json lookups", rows=cube["rows"])

    # ---- geo -----------------------------------------------------------------------------------
    g = R["geo"]
    for name, df, title in (("grid_density", g["grid"], "~550 m grid cells with counts by category (window A)"),
                            ("district_centroids", g["centroids"], "District centroids = median incident coordinate (window A)"),
                            ("community_area_counts", g["community_areas"], "Crimes by community-area code (window A)")):
        p = dump(ex / "geo" / f"{name}.json", {"scope": "window_A", "coordinates_share": g["coords_share_A"],
                                              "note": "Derived only from coordinates in the dataset; window B has almost none.",
                                              "rows": clean_records(df)})
        reg(p, f"geo_{name}", "geo", title, rows=len(df), scope="window_A")

    # ---- insights ------------------------------------------------------------------------------
    ins = [Insight(**_san(i)).model_dump() for i in R["insights"]]
    p = dump(ex / "insights.json", ins, indent=1)
    reg(p, "insights", "insights", "Ranked, data-derived insights", rows=len(ins))

    # ---- meta ----------------------------------------------------------------------------------
    p = dump(ex / "cleaning_log.json", R["cleaning_log"], indent=1)
    reg(p, "cleaning_log", "meta", "Every cleaning action with counts")
    meth = {"definitions": DEFINITIONS, "windows": R["windows"], "dense_windows_detected": R["dense_windows_detected"],
            "records_outside_windows": R["records_outside_windows"],
            "source": {"file": SOURCE_XLSX.name, "sheet": "Crimes_-_2001_to_Present",
                       "provenance": "Provided by the competition organisers. Column layout matches the City of Chicago Data Portal dataset "
                                     "'Crimes - 2001 to Present' (Chicago Police Dept.); confirm before citing as such.",
                       "modified": False},
            "assumptions": [
                "Excel-converted Date cells were read day-first and are swapped back (month<->day).",
                "Handout KPIs use the whole dataset (ground rules); deeper analysis uses the two dense windows.",
                "CRIM SEXUAL ASSAULT and CRIMINAL SEXUAL ASSAULT are one offence under two labels; merged only in the harmonised column.",
                "Timestamps at exactly 00:00/12:00 are treated as possible placeholders in sensitivity analyses, never dropped from handout metrics.",
                "No population or area denominators exist in the data, so no per-capita statements are made.",
                "p-values are secondary: with n ~ 10^5-10^6 effect sizes and CIs are reported; multiple comparisons use Benjamini-Hochberg FDR."],
            "limitations": [
                "File is a truncated slice (Excel row limit); only two periods are dense.",
                "Window B has ~0% coordinates; arrest outcomes in recent months may be incomplete.",
                "Models describe association, not causation."],
            "models": R["models"], "glm": R["glm"], "seed": 42}
    p = dump(ex / "methodology.json", meth, indent=1)
    reg(p, "methodology", "meta", "Definitions, windows, assumptions, limitations, model metrics")
    df = R["frames"]["df"]
    dd = [{"column": c, "dtype": str(df[c].dtype), "null_count": int(df[c].isna().sum()),
           "description": COLUMN_DOC.get(c, ""), "derived": c not in ("ID", "Case Number", "Block", "IUCR", "Primary Type", "Description",
                                                                         "Location Description", "Arrest", "Domestic", "Beat", "District", "Ward", "Community Area",
                                                                         "FBI Code", "X Coordinate", "Y Coordinate", "Year", "Latitude", "Longitude", "Date")}
          for c in df.columns]
    p = dump(ex / "data_dictionary.json", dd, indent=1)
    reg(p, "data_dictionary", "meta", "Column dictionary for crimes_clean.parquet")

    # ---- processed data ------------------------------------------------------------------------
    CLEAN.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(CLEAN, index=False)
    df.sample(5000, random_state=42).sort_values("Date").to_csv(ROOT / "data" / "processed" / "crimes_clean_sample.csv.gz",
                                                                   index=False, compression="gzip")

    # ---- schemas + TS --------------------------------------------------------------------------
    sdir = ex / "schemas"
    ts = ["// AUTO-GENERATED by src/export.py from src/schema_models.py. Do not edit.\n"]
    for name, model in (("ChartSpec", ChartSpec), ("KPI", KPI), ("Insight", Insight), ("Cube", Cube), ("Manifest", Manifest)):
        sc = model.model_json_schema()
        dump(sdir / f"{name}.schema.json", sc, indent=1)
        ts.append(schema_to_ts(name, sc))
    (sdir / "types.ts").write_text("\n\n".join(ts) + "\n", encoding="utf-8")

    # ---- manifest ------------------------------------------------------------------------------
    man = Manifest(project="TECHVERSE - Chicago Crimes analysis layer", generated_utc=datetime.now(timezone.utc).isoformat(timespec="seconds"),
                   source=meth["source"], windows=R["windows"], entries=entries).model_dump()
    dump(ex / "manifest.json", man, indent=1)
    return man
