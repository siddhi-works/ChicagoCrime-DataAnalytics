"""Read the source workbook (read-only) once and cache it as parquet. Source file is never written."""
import time
import openpyxl
import pandas as pd
from config import SOURCE_XLSX, CACHE


def fingerprint():
    import hashlib, os
    h = hashlib.sha256()
    with open(SOURCE_XLSX, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 24), b""):
            h.update(chunk)
    st = os.stat(SOURCE_XLSX)
    return {"sha256": h.hexdigest(), "size": st.st_size, "mtime": st.st_mtime}


def load_raw(force: bool = False) -> pd.DataFrame:
    fp_file = CACHE.parent / "source_fingerprint.json"
    if not fp_file.exists():                      # first contact: record the source's fingerprint (read-only)
        import json
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        fp_file.write_text(json.dumps(fingerprint()))
    if CACHE.exists() and not force:
        return pd.read_parquet(CACHE)
    t = time.time()
    wb = openpyxl.load_workbook(SOURCE_XLSX, read_only=True)   # read-only: source untouched
    ws = wb.worksheets[0]
    rows = ws.iter_rows(values_only=True)
    cols = next(rows)
    df = pd.DataFrame(list(rows), columns=cols)
    wb.close()
    # Date / Updated On are mixed str+datetime in the workbook: keep as object and tag the origin
    for c in ("Date", "Updated On"):
        df[c + "__src"] = df[c].map(lambda v: "datetime" if hasattr(v, "year") else "text")
        df[c] = df[c].map(lambda v: v.isoformat() if hasattr(v, "year") else v)
    # Excel stored some codes as numbers and some as text (e.g. FBI Code '08B' vs 14): normalise to str
    for c in df.columns[df.dtypes == object]:
        df[c] = df[c].map(lambda v: v if v is None or isinstance(v, str) else str(v))
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(CACHE, index=False)
    print(f"loaded {df.shape} from workbook in {time.time()-t:.0f}s -> {CACHE}")
    return df


if __name__ == "__main__":
    load_raw(force=True)
