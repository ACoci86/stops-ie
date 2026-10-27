"""
Clean the NaPTIMFS spreadsheet into a GeoJSON file of Irish bus stops.

Input:  data/raw/naptimfs.xlsx
Output: data/processed/stops.geojson

Run from the project root:
    python scripts/clean_stops.py
"""

import json
import os

import pandas as pd

INPUT_FILE = "data/raw/naptimfs.xlsx"
OUTPUT_FILE = "data/processed/stops.geojson"


# ---------------------------------------------------------------------------
# Step 1. Load the spreadsheet
# ---------------------------------------------------------------------------
print("Reading", INPUT_FILE)
df = pd.read_excel(INPUT_FILE, sheet_name="NaPTIMFS_Database")
print("Rows in spreadsheet:", len(df))


# ---------------------------------------------------------------------------
# Step 2. Keep only real, active bus stops
# ---------------------------------------------------------------------------
# Each line keeps the rows where the condition is true and throws away the rest.

df = df[df["Latitude"].notna()]          # must have coordinates
df = df[df["Status"] == "active"]        # must be in service
df = df[df["StopType"] == "BCT"]         # BCT = bus stop. Others are rail, ferry, taxi...
df = df[df["AtcoCode"].notna()]          # must have an ID
df = df.drop_duplicates("AtcoCode")      # one row per stop

print("Rows after filtering:", len(df))


# ---------------------------------------------------------------------------
# Step 3. Helper functions
# ---------------------------------------------------------------------------

def is_missing(value):
    """True if the cell is empty."""
    return pd.isna(value)


def text_or_none(value):
    """Return the text, or None if the cell is empty. JSON writes None as null."""
    if is_missing(value):
        return None
    return str(value)


def number_or_none(value):
    """Return a whole number, or None if the cell is empty."""
    if is_missing(value):
        return None
    return int(round(value))


def yes_no_unknown(row, column):
    """
    Turn a 0/1 facility flag into "yes", "no" or "unknown".

    Important: if the stop was never surveyed, every flag is 0.
    That means "nobody checked", not "absent". So we say "unknown".
    """
    if row["PTIMS_IsSurveyed"] != 1:
        return "unknown"
    if row[column] == 1:
        return "yes"
    return "no"


def split_routes(value):
    """Turn "30 | 32 | X1" into ["30", "32", "X1"]."""
    if is_missing(value):
        return []
    routes = []
    for part in str(value).split("|"):
        part = part.strip()          # remove spaces around each route
        if part != "":
            routes.append(part)
    return routes


# ---------------------------------------------------------------------------
# Step 4. Build one GeoJSON feature per stop
# ---------------------------------------------------------------------------
# GeoJSON is plain JSON in a fixed shape:
#   a FeatureCollection, holding a list of Features,
#   each with a geometry (the point) and properties (everything else).

features = []

for _, row in df.iterrows():

    surveyed = row["PTIMS_IsSurveyed"] == 1

    properties = {
        "id": row["AtcoCode"],
        "name": text_or_none(row["CommonName"]),
        "name_ga": text_or_none(row["CommonNameGA"]),
        "street": text_or_none(row["Street"]),
        "county": text_or_none(row["County"]),
        "lea": text_or_none(row["Local Electoral Area"]),
        "urban": not is_missing(row["Urban Area (Prioritized)"]),
        "surveyed": surveyed,
        "rating": text_or_none(row["PTIMS_UD_Calculated"]) if surveyed else None,
        "routes": split_routes(row["GTFS_Routes"]),
        "departures_weekday": number_or_none(row["Average weekday departures"]),
        "modified": text_or_none(row["ModificationDateTime"]),

        # Facilities. Each is "yes", "no" or "unknown".
        "shelter": yes_no_unknown(row, "PTIMS_hasShelter"),
        "bench": yes_no_unknown(row, "PTIMS_Bench"),
        "rtpi": yes_no_unknown(row, "PTIMS_hasRTPI"),            # real-time display
        "wheelchair": yes_no_unknown(row, "PTIMS_WheelchairAccessibility"),
        "footpath": yes_no_unknown(row, "PTIMS_FootpathToStop"),
        "kerb": yes_no_unknown(row, "PTIMS_CastleKerbing"),       # raised kerb
        "step": yes_no_unknown(row, "PTIMS_StepAtStop"),
        "bin": yes_no_unknown(row, "PTIMS_Bin"),
        "bike_stand": yes_no_unknown(row, "PTIMS_BikeStand"),
    }

    # County names arrive in capitals: "DUBLIN CITY". Make them "Dublin City".
    if properties["county"] is not None:
        properties["county"] = properties["county"].title()
    if properties["lea"] is not None:
        properties["lea"] = properties["lea"].title()

    feature = {
        "type": "Feature",
        "geometry": {
            "type": "Point",
            # GeoJSON order is [longitude, latitude]. 5 decimals is about 1 metre.
            "coordinates": [round(row["Longitude"], 5), round(row["Latitude"], 5)],
        },
        "properties": properties,
    }
    features.append(feature)


# ---------------------------------------------------------------------------
# Step 5. Write the file
# ---------------------------------------------------------------------------
collection = {"type": "FeatureCollection", "features": features}

os.makedirs("data/processed", exist_ok=True)
with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    json.dump(collection, f, ensure_ascii=False)

print("Wrote", len(features), "stops to", OUTPUT_FILE)


# ---------------------------------------------------------------------------
# Step 6. Print a summary so we can sanity-check each run
# ---------------------------------------------------------------------------
print()
for facility in ["shelter", "bench", "rtpi", "wheelchair", "footpath", "kerb", "step", "bin", "bike_stand"]:
    yes = sum(1 for f in features if f["properties"][facility] == "yes")
    no = sum(1 for f in features if f["properties"][facility] == "no")
    unknown = sum(1 for f in features if f["properties"][facility] == "unknown")
    print(f"{facility:11s} yes={yes:6d}  no={no:6d}  unknown={unknown:6d}")


# ---------------------------------------------------------------------------
# Step 7. County summary, for the "Counties" view on the website
# ---------------------------------------------------------------------------
# For each county: how many stops, how many surveyed, how many have each
# facility, the map area to zoom to, and the busiest stops with no shelter.

FACILITY_KEYS = ["shelter", "bench", "rtpi", "wheelchair"]
counties = {}

for f in features:
    p = f["properties"]
    name = p["county"] or "Unknown"
    lon, lat = f["geometry"]["coordinates"]

    if name not in counties:
        counties[name] = {
            "county": name,
            "stops": 0,
            "surveyed": 0,
            "bbox": [lon, lat, lon, lat],   # west, south, east, north
            "busy_no_shelter": [],
        }
        for key in FACILITY_KEYS:
            counties[name][key] = {"yes": 0, "no": 0}

    c = counties[name]
    c["stops"] += 1
    if p["surveyed"]:
        c["surveyed"] += 1
    for key in FACILITY_KEYS:
        if p[key] == "yes":
            c[key]["yes"] += 1
        elif p[key] == "no":
            c[key]["no"] += 1

    # grow the bounding box to include this stop
    c["bbox"][0] = min(c["bbox"][0], lon)
    c["bbox"][1] = min(c["bbox"][1], lat)
    c["bbox"][2] = max(c["bbox"][2], lon)
    c["bbox"][3] = max(c["bbox"][3], lat)

    if p["shelter"] == "no" and p["departures_weekday"] is not None:
        c["busy_no_shelter"].append({
            "id": p["id"],
            "name": p["name"],
            "departures": p["departures_weekday"],
            "lng": lon,
            "lat": lat,
        })

# keep only the five busiest shelterless stops per county
for c in counties.values():
    c["busy_no_shelter"].sort(key=lambda s: s["departures"], reverse=True)
    c["busy_no_shelter"] = c["busy_no_shelter"][:5]

county_list = sorted(counties.values(), key=lambda c: c["county"])

COUNTIES_FILE = "data/processed/counties.json"
with open(COUNTIES_FILE, "w", encoding="utf-8") as f:
    json.dump(county_list, f, ensure_ascii=False, indent=1)

print()
print("Wrote", len(county_list), "counties to", COUNTIES_FILE)
