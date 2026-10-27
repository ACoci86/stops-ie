"""
Safety check before publishing a new data build.

    python scripts/check_build.py

Compares data/processed/stops.geojson (new) with web/public/data/stops.geojson
(what the site currently shows). Fails, with exit code 1, if the new file
looks broken: far fewer stops, or far fewer surveyed stops. A bad upstream
file must not wipe the map.
"""

import json
import sys

NEW = "data/processed/stops.geojson"
CURRENT = "web/public/data/stops.geojson"
TOLERANCE = 0.10  # allow a 10% drop


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)["features"]


new = load(NEW)
current = load(CURRENT)

checks = [
    ("stops", len(new), len(current)),
    ("surveyed stops",
     sum(1 for f in new if f["properties"]["surveyed"]),
     sum(1 for f in current if f["properties"]["surveyed"])),
    ("stops with a shelter",
     sum(1 for f in new if f["properties"]["shelter"] == "yes"),
     sum(1 for f in current if f["properties"]["shelter"] == "yes")),
    ("stops with timetable data",
     sum(1 for f in new if f["properties"]["departures_weekday"] is not None),
     sum(1 for f in current if f["properties"]["departures_weekday"] is not None)),
]

ok = True
for label, n, c in checks:
    floor = c * (1 - TOLERANCE)
    status = "ok" if n >= floor else "FAIL"
    if n < floor:
        ok = False
    print(f"{status:4s} {label}: new {n:,} vs current {c:,}")

if not ok:
    print("New build rejected: a count dropped by more than 10%.")
    sys.exit(1)
print("New build accepted.")
