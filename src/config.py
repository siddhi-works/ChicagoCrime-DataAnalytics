"""Central paths and constants. The source workbook is NEVER modified: it is opened read-only."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_XLSX = ROOT.parent / "Crime Dataset.xlsx"
CACHE = ROOT / "data" / "cache" / "raw.parquet"
CLEAN = ROOT / "data" / "processed" / "crimes_clean.parquet"
EXPORT = ROOT / "export"
REPORTS = ROOT / "reports"

SEED = 42

# Handout definitions (Crimes Dashboard Competition Handout, sections 3-5)
TREND_START, TREND_END = "2015-04-01", "2017-07-01"   # monthly trend window (28 months)
VIOLENT = {"ASSAULT", "BATTERY", "ROBBERY", "HOMICIDE", "CRIM SEXUAL ASSAULT",
           "CRIMINAL SEXUAL ASSAULT", "KIDNAPPING"}
PROPERTY = {"THEFT", "BURGLARY", "MOTOR VEHICLE THEFT", "CRIMINAL DAMAGE", "ARSON"}
DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
TOD_ORDER = ["Night", "Morning", "Afternoon", "Evening"]
SEASON_ORDER = ["Winter", "Spring", "Summer", "Fall"]
CATEGORY_ORDER = ["Violent", "Property", "Other"]

# Chicago bounding box (generous) used only to flag impossible coordinates
LAT_RANGE, LON_RANGE = (41.6, 42.1), (-87.95, -87.5)
