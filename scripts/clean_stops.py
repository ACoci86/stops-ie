"""
Clean the NaPTIMFS spreadsheet into a GeoJSON file of Irish bus stops.

Input:  data/raw/naptimfs.xlsx   (downloaded from projects.bibby.ie/naptimfs)
Output: data/processed/stops.geojson

Run from the project root:
    python scripts/clean_stops.py
"""

import json
from pathlib import Path

import pandas as pd

# ---------------------------------------------------------------------------
# 1. Paths
# ---------------------------------------------------------------------------
# Path(__file__) is this script. .parent.parent walks up to the project root,
# so the script works no matter which folder you run it from.
ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "naptimfs.xlsx"
OUT = ROOT / "data" / "processed" / "stops.geojson"

# ---------------------------------------------------------------------------
# 2. Load
# ---------------------------------------------------------------------------
print(f"Reading {RAW.name} ...")
df = pd.read_excel(RAW, sheet_name="NaPTIMFS_Database")
print(f"  {len(df):,} rows in the spreadsheet")

# ---------------------------------------------------------------------------
# 3. Filter down to real, active, mappable bus stops
# ---------------------------------------------------------------------------
# Rows with no coordinates are PTIMS records with no matching stop. Drop them.
df = df[df["Latitude"].notna() & df["Longitude"].notna()]
print(f"  {len(df):,} rows have coordinates")

# Only active stops. 'pending' and 'inactive' are not in service.
df = df[df["Status"] == "active"]
print(f"  {len(df):,} rows are active")

# BCT is the NaPTAN code for a bus stop. Everything else is rail, ferry, taxi...
df = df[df["StopType"] == "BCT"]
print(f"  {len(df):,} rows are bus stops (BCT)")

# Every stop needs an ID. AtcoCode is the national stop identifier.
df = df[df["AtcoCode"].notna()]
df = df.drop_duplicates(subset="AtcoCode")
print(f"  {len(df):,} rows have a unique AtcoCode")

# ---------------------------------------------------------------------------
# 4. Turn 0/1 facility flags into yes / no / unknown
# ---------------------------------------------------------------------------
# The key finding from exploring the data: when a stop has not been surveyed,
# every facility is recorded as 0. That means "nobody checked", not "absent".
# So a facility is only a real "no" if the stop was surveyed.
surveyed = df["PTIMS_IsSurveyed"] == 1

def facility(column: str) -> pd.Series:
    """Map a PTIMS 0/1 column to 'yes', 'no' or 'unknown'."""
    flag = df[column]
    return pd.Series(
        # numpy-style nested where: surveyed & 1 -> yes, surveyed & 0 -> no, else unknown
        [
            "unknown" if not s or pd.isna(f) else ("yes" if f == 1 else "no")
            for s, f in zip(surveyed, flag)
        ],
        index=df.index,
    )

FACILITIES = {
    "shelter":    "PTIMS_hasShelter",
    "bench":      "PTIMS_Bench",
    "rtpi":       "PTIMS_hasRTPI",              # real-time passenger information display
    "wheelchair": "PTIMS_WheelchairAccessibility",
    "footpath":   "PTIMS_FootpathToStop",
    "kerb":       "PTIMS_CastleKerbing",         # raised kerb for level boarding
    "step":       "PTIMS_StepAtStop",
    "bin":        "PTIMS_Bin",
    "bike_stand": "PTIMS_BikeStand",
}
for key, column in FACILITIES.items():
    df[key] = facility(column)

# ---------------------------------------------------------------------------
# 5. Tidy the other fields we want on the map
# ---------------------------------------------------------------------------
# Routes come as "30|32|X1". Split into a list. Missing -> empty list.
df["routes"] = df["GTFS_Routes"].fillna("").apply(
    lambda s: [r.strip() for r in str(s).split("|") if r.strip()]
)

# Average weekday departures. Missing means the stop has no timetable data.
df["departures_weekday"] = df["Average weekday departures"].round().astype("Int64")

# NTA accessibility rating: A+, A, B or C. Only meaningful if surveyed.
df["rating"] = df["PTIMS_UD_Calculated"].where(surveyed)

# County names arrive in capitals: "DUBLIN CITY". Title-case them.
df["county"] = df["County"].fillna("").str.title().replace("", None)
df["lea"] = df["Local Electoral Area"].fillna("").str.title().replace("", None)

# Urban if the stop falls inside a CSO urban area, else rural.
df["urban"] = df["Urban Area (Prioritized)"].notna()

# Distance between the two coordinate sets. Large gaps mean a doubtful join.
df["coord_gap_m"] = df["Meters_Between_NaPTAN_PTIMS"].round().astype("Int64")

# ---------------------------------------------------------------------------
# 6. Build GeoJSON
# ---------------------------------------------------------------------------
# GeoJSON is just JSON in a fixed shape: a FeatureCollection holding Features,
# each with a geometry (the point) and properties (everything else).

def clean(value):
    """Convert pandas missing values to None so json can write them as null."""
    if value is pd.NA or (isinstance(value, float) and pd.isna(value)):
        return None
    return value

features = []
for _, row in df.iterrows():
    props = {
        "id": row["AtcoCode"],
        "name": clean(row["CommonName"]),
        "name_ga": clean(row["CommonNameGA"]),
        "street": clean(row["Street"]),
        "county": clean(row["county"]),
        "lea": clean(row["lea"]),
        "urban": bool(row["urban"]),
        "surveyed": bool(row["PTIMS_IsSurveyed"] == 1),
        "rating": clean(row["rating"]),
        "routes": row["routes"],
        "departures_weekday": clean(row["departures_weekday"]),
        "coord_gap_m": clean(row["coord_gap_m"]),
        "modified": clean(row["ModificationDateTime"]),
    }
    for key in FACILITIES:
        props[key] = row[key]

    # Int64 values need converting to plain int for json
    for k, v in props.items():
        if hasattr(v, "item"):
            props[k] = v.item()

    features.append({
        "type": "Feature",
        "geometry": {
            "type": "Point",
            # GeoJSON order is [longitude, latitude]. 5 decimals is about 1 metre.
            "coordinates": [round(row["Longitude"], 5), round(row["Latitude"], 5)],
        },
        "properties": props,
    })

collection = {"type": "FeatureCollection", "features": features}

OUT.parent.mkdir(parents=True, exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    # separators with no spaces keeps the file small
    json.dump(collection, f, ensure_ascii=False, separators=(",", ":"))

size_mb = OUT.stat().st_size / 1_000_000
print(f"\nWrote {len(features):,} stops to {OUT.relative_to(ROOT)} ({size_mb:.1f} MB)")

# ---------------------------------------------------------------------------
# 7. Quick summary so we can sanity-check every run
# ---------------------------------------------------------------------------
print("\nFacility counts:")
for key in FACILITIES:
    counts = df[key].value_counts()
    print(f"  {key:11s} yes={counts.get('yes', 0):6,}  no={counts.get('no', 0):6,}  unknown={counts.get('unknown', 0):6,}")

print(f"\nSurveyed: {surveyed.sum():,} of {len(df):,}")
print(f"Urban: {df['urban'].sum():,}   Rural: {(~df['urban']).sum():,}")
print(f"Coordinate gap over 300 m: {(df['coord_gap_m'] > 300).sum():,} stops")
