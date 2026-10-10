"""One command: load -> clean -> features -> analyses -> export -> validate.   python run_all.py [--reload]"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "src"))

import pipeline            # noqa: E402
import export              # noqa: E402
import insights            # noqa: E402
import validate            # noqa: E402
import reports             # noqa: E402
import docs                # noqa: E402


def main():
    t = time.time()
    R = pipeline.run(load_force="--reload" in sys.argv)
    R["insights"] = insights.build_insights(R)
    man = export.write_all(R)
    print(f"exported {len(man['entries'])} files in {time.time()-t:.0f}s")
    reports.contact_sheet()
    docs.write_docs()
    ck = validate.run_checks()
    for name, ok, detail in ck.results:
        print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail and not ok else ""))
    if ck.failed():
        raise SystemExit(f"{len(ck.failed())} validation check(s) failed")
    print("ALL VALIDATION CHECKS PASSED")


if __name__ == "__main__":
    main()
