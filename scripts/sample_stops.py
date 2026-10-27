"""
Pick a sample of bus stops to check in person, and write them to a CSV.

Examples (run from the project root, with the venv active):

    # 50 stops within 3 km of a point (latitude, longitude)
    python scripts/sample_stops.py --near 53.3498,-6.2603 --km 3

    # 50 stops in a county
    python scripts/sample_stops.py --county "Galway City"

    # a different sample size
    python scripts/sample_stops.py --county Longford --n 30

Output: data/processed/field_check.csv
Open it in a spreadsheet, print it or keep it on your phone, and fill in the
"actual_" columns as you visit each stop.
"""

import argparse
import csv
import json
import math
import random

INPUT_FILE = "data/processed/stops.geojson"
OUTPUT_FILE = "data/processed/field_check.csv"

FACILITIES = ["shelter", "bench", "rtpi", "wheelchair", "kerb", "footpath", "step"]


def distance_km(lat1, lon1, lat2, lon2):
    """Straight-line distance between two points, in kilometres."""
    r = 6371
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


# ---------------------------------------------------------------------------
# Step 1. Read the arguments
# ---------------------------------------------------------------------------
parser = argparse.ArgumentParser(description="Pick bus stops for a field check.")
parser.add_argument("--near", help="latitude,longitude of a centre point")
parser.add_argument("--km", type=float, default=3.0, help="radius around --near, in km")
parser.add_argument("--county", help="county name, as shown on the site")
parser.add_argument("--n", type=int, default=50, help="how many stops to pick")
parser.add_argument("--seed", type=int, default=1, help="change to get a different sample")
args = parser.parse_args()

if not args.near and not args.county:
    parser.error("give --near LAT,LON or --county NAME")

# ---------------------------------------------------------------------------
# Step 2. Load the stops and keep the ones in the area
# ---------------------------------------------------------------------------
with open(INPUT_FILE, encoding="utf-8") as f:
    features = json.load(f)["features"]

candidates = []
for feature in features:
    p = feature["properties"]
    lon, lat = feature["geometry"]["coordinates"]

    if args.county and (p["county"] or "").lower() != args.county.lower():
        continue
    if args.near:
        clat, clon = (float(x) for x in args.near.split(","))
        if distance_km(clat, clon, lat, lon) > args.km:
            continue

    candidates.append((p, lat, lon))

print("Stops in the area:", len(candidates))
if not candidates:
    raise SystemExit("No stops found. Check the county spelling or widen --km.")

# ---------------------------------------------------------------------------
# Step 3. Pick a mix: half surveyed, half not, when both exist
# ---------------------------------------------------------------------------
random.seed(args.seed)
surveyed = [c for c in candidates if c[0]["surveyed"]]
unsurveyed = [c for c in candidates if not c[0]["surveyed"]]

half = args.n // 2
picked = random.sample(unsurveyed, min(half, len(unsurveyed)))
picked += random.sample(surveyed, min(args.n - len(picked), len(surveyed)))
if len(picked) < args.n:
    picked += random.sample(unsurveyed, min(args.n - len(picked), len(unsurveyed) - len([x for x in picked if not x[0]["surveyed"]])))

print("Picked:", len(picked), "(", sum(1 for c in picked if c[0]["surveyed"]), "surveyed )")

# ---------------------------------------------------------------------------
# Step 4. Write the CSV
# ---------------------------------------------------------------------------
columns = ["id", "name", "county", "lat", "lon", "map_link", "surveyed", "rating"]
columns += ["recorded_" + k for k in FACILITIES]
columns += ["actual_" + k for k in FACILITIES]
columns += ["visited_on", "notes"]

with open(OUTPUT_FILE, "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=columns)
    writer.writeheader()
    for p, lat, lon in sorted(picked, key=lambda c: (c[0]["county"] or "", c[0]["name"] or "")):
        row = {
            "id": p["id"],
            "name": p["name"],
            "county": p["county"],
            "lat": lat,
            "lon": lon,
            "map_link": f"https://www.google.com/maps?q={lat},{lon}",
            "surveyed": "yes" if p["surveyed"] else "no",
            "rating": p["rating"] or "",
        }
        for k in FACILITIES:
            row["recorded_" + k] = p[k]
            row["actual_" + k] = ""
        row["visited_on"] = ""
        row["notes"] = ""
        writer.writerow(row)

print("Wrote", OUTPUT_FILE)
