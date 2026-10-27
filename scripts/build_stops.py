"""
Build the STOPS data files from the raw downloads.

    python scripts/download.py       # first
    python scripts/build_stops.py

Reads:   data/raw/  (see download.py)
Writes:  data/processed/stops.geojson    one feature per active bus stop
         data/processed/counties.json    per-county summary
         data/processed/meta.json        when it was built and from what

The join key everywhere is the AtcoCode, the national stop number.
"""

import csv
import io
import json
import os
import zipfile
from datetime import datetime, timezone

import geopandas as gpd
import pandas as pd

RAW = "data/raw"
OUT = "data/processed"


def js_geojson(text):
    """PTIMS files are JavaScript ("var stops = {...}"), not plain JSON.
    Cut out the JSON object in the middle."""
    return json.loads(text[text.index("{"): text.rindex("}") + 1])


def flag(value):
    """PTIMS flags arrive as the strings "True" / "False"."""
    return str(value) == "True"


# ---------------------------------------------------------------------------
# Step 1. NaPTAN: the list of stops
# ---------------------------------------------------------------------------
print("Step 1. NaPTAN")
naptan = pd.read_csv(f"{RAW}/naptan_stop_points.csv", dtype=str, keep_default_na=False)
print("  rows:", len(naptan))

naptan = naptan[naptan["Status"] == "active"]
naptan = naptan[naptan["StopType"] == "BCT"]           # BCT = bus stop
naptan = naptan[(naptan["Latitude"] != "") & (naptan["Longitude"] != "")]
naptan = naptan[naptan["AtcoCode"] != ""]
naptan = naptan.drop_duplicates("AtcoCode")
print("  active bus stops with coordinates:", len(naptan))

# ---------------------------------------------------------------------------
# Step 2. PTIMS: what each stop has
# ---------------------------------------------------------------------------
print("Step 2. PTIMS")
ptims_zip = zipfile.ZipFile(f"{RAW}/ptims.zip")

# 2a. The stop survey. One record per stop, keyed by AtcoCode.
survey = {}
for feature in js_geojson(ptims_zip.read("stops.geojson").decode("utf-8"))["features"]:
    p = feature["properties"]
    code = p.get("AtcoCode") or ""
    if code == "":
        continue
    # If a stop appears twice, prefer the surveyed record.
    if code in survey and survey[code]["IsSurveyed"] == "1":
        continue
    survey[code] = p
print("  survey records:", len(survey))

# 2b. Shelters, real-time displays: count the active ones at each stop.
shelters = {}
shelter_light = {}
for feature in js_geojson(ptims_zip.read("shelters.geojson").decode("utf-8"))["features"]:
    p = feature["properties"]
    if flag(p.get("IsActive")) and p.get("AtcoCode"):
        shelters[p["AtcoCode"]] = shelters.get(p["AtcoCode"], 0) + 1
        if flag(p.get("Light")):
            shelter_light[p["AtcoCode"]] = True
print("  stops with an active shelter:", len(shelters))

rtpi = {}
for feature in js_geojson(ptims_zip.read("rtpi.geojson").decode("utf-8"))["features"]:
    p = feature["properties"]
    if flag(p.get("IsActive")) and p.get("AtcoCode"):
        rtpi[p["AtcoCode"]] = rtpi.get(p["AtcoCode"], 0) + 1
print("  stops with an active real-time display:", len(rtpi))

# ---------------------------------------------------------------------------
# Step 3. GTFS: routes and how many buses a day
# ---------------------------------------------------------------------------
print("Step 3. GTFS")
gtfs = zipfile.ZipFile(f"{RAW}/gtfs_all.zip")


def gtfs_table(name):
    return csv.DictReader(io.TextIOWrapper(gtfs.open(name), encoding="utf-8-sig"))


# Timetables overlap: the feed holds the current one and the next one.
# So we count buses for ONE reference week, the next full Monday-to-Friday
# inside the feed's dates, and ask each service which of those five days it
# runs on. calendar.txt gives the weekly pattern and the valid dates;
# calendar_dates.txt adds or removes single days (bank holidays etc.).
from datetime import date, timedelta

feed = next(gtfs_table("feed_info.txt"))
feed_start = datetime.strptime(feed["feed_start_date"], "%Y%m%d").date()
today = date.today()
monday = max(today, feed_start) + timedelta(days=(7 - max(today, feed_start).weekday()) % 7 or 7)
week = [monday + timedelta(days=i) for i in range(5)]
print("  reference week:", week[0], "to", week[-1])

DAY_COLUMNS = ["monday", "tuesday", "wednesday", "thursday", "friday"]
runs_on = {}  # service_id -> set of dates in the week it runs
for row in gtfs_table("calendar.txt"):
    start = datetime.strptime(row["start_date"], "%Y%m%d").date()
    end = datetime.strptime(row["end_date"], "%Y%m%d").date()
    days = set()
    for d, column in zip(week, DAY_COLUMNS):
        if row[column] == "1" and start <= d <= end:
            days.add(d)
    runs_on[row["service_id"]] = days
for row in gtfs_table("calendar_dates.txt"):
    d = datetime.strptime(row["date"], "%Y%m%d").date()
    if d not in week:
        continue
    days = runs_on.setdefault(row["service_id"], set())
    if row["exception_type"] == "1":
        days.add(d)        # extra day of service
    else:
        days.discard(d)    # day removed
weekdays = {service: len(days) for service, days in runs_on.items()}

route_names = {row["route_id"]: row["route_short_name"] for row in gtfs_table("routes.txt")}

# For each trip: its route name, and the weekday count of its service.
trip_route = {}
trip_weekdays = {}
for row in gtfs_table("trips.txt"):
    trip_route[row["trip_id"]] = route_names.get(row["route_id"], "")
    trip_weekdays[row["trip_id"]] = weekdays.get(row["service_id"], 0)
print("  trips:", len(trip_route))

# stop_times.txt is half a gigabyte, so read it in chunks rather than at once.
# Each row is one bus calling at one stop. We add up weekday-days per stop
# and divide by 5 to get departures on an average weekday.
departures = {}
routes_at = {}
rows = 0
for chunk in pd.read_csv(
    gtfs.open("stop_times.txt"),
    usecols=["trip_id", "stop_id", "pickup_type"],
    dtype=str,
    keep_default_na=False,
    chunksize=1_000_000,
):
    rows += len(chunk)
    chunk = chunk[chunk["pickup_type"] != "1"]  # 1 = no pick-up here (last stop)
    chunk["days"] = chunk["trip_id"].map(trip_weekdays).fillna(0)
    chunk["route"] = chunk["trip_id"].map(trip_route).fillna("")
    for stop_id, days in chunk.groupby("stop_id")["days"].sum().items():
        departures[stop_id] = departures.get(stop_id, 0) + days
    for stop_id, names in chunk.groupby("stop_id")["route"].unique().items():
        routes_at.setdefault(stop_id, set()).update(n for n in names if n)
    print(f"  stop_times rows read: {rows:,}", end="\r")
print()
print("  stops with timetable data:", len(departures))

# ---------------------------------------------------------------------------
# Step 4. Boundaries: which county, electoral area and urban area
# ---------------------------------------------------------------------------
print("Step 4. Boundaries")
points = gpd.GeoDataFrame(
    naptan[["AtcoCode"]],
    geometry=gpd.points_from_xy(naptan["Longitude"].astype(float), naptan["Latitude"].astype(float)),
    crs="EPSG:4326",
)


def tidy_council(name):
    """'DUBLIN CITY COUNCIL' -> 'Dublin City', 'CORK COUNTY COUNCIL' -> 'Cork',
    'LIMERICK CITY AND COUNTY COUNCIL' -> 'Limerick'."""
    name = name.upper()
    for suffix in [" CITY AND COUNTY COUNCIL", " COUNTY COUNCIL", " COUNCIL"]:
        if name.endswith(suffix):
            name = name[: -len(suffix)]
    return name.title().replace("Dun Laoghaire", "Dún Laoghaire")


def tidy_lea(name):
    """'BALLYBAY-CLONES LEA-5' -> 'Ballybay-Clones'."""
    return name.split(" LEA")[0].title()


def lookup(layer_file, column, tidy):
    """Point-in-polygon: for each stop, the name of the area it falls in."""
    areas = gpd.read_file(f"{RAW}/{layer_file}")[[column, "geometry"]].to_crs("EPSG:4326")
    joined = gpd.sjoin(points, areas, how="left", predicate="within")
    joined = joined[~joined.index.duplicated()]  # a point on a border: keep one
    return {code: (tidy(v) if isinstance(v, str) else None)
            for code, v in zip(joined["AtcoCode"], joined[column])}


county_of = lookup("admin_areas.geojson", "ENGLISH", tidy_council)
lea_of = lookup("leas.geojson", "ENGLISH", tidy_lea)
urban_of = lookup("urban_areas.geojson", "URBAN_AREA_NAME", lambda s: s)
print("  stops with a county:", sum(1 for v in county_of.values() if v))
print("  stops in an urban area:", sum(1 for v in urban_of.values() if v))

# ---------------------------------------------------------------------------
# Step 5. Put it together, one feature per stop
# ---------------------------------------------------------------------------
print("Step 5. Build features")


def yes_no_unknown(surveyed, value):
    if not surveyed:
        return "unknown"
    return "yes" if value else "no"


def text_or_none(value):
    return value if value not in ("", None) else None


features = []
for _, row in naptan.iterrows():
    code = row["AtcoCode"]
    s = survey.get(code)
    surveyed = s is not None and s.get("IsSurveyed") == "1"
    lon, lat = float(row["Longitude"]), float(row["Latitude"])

    def fac(key):
        return yes_no_unknown(surveyed, flag(s.get(key)) if s else False)

    props = {
        "id": code,
        "name": text_or_none(row["CommonName"]),
        "name_ga": text_or_none(row["CommonNameGA"]),
        "street": text_or_none(row["Street"]),
        "county": county_of.get(code),
        "lea": lea_of.get(code),
        "urban": urban_of.get(code) is not None,
        "surveyed": surveyed,
        "rating": (s.get("UD_Calculated") if surveyed and s else None),
        "routes": sorted(routes_at.get(code, [])),
        "departures_weekday": (round(departures[code] / 5) if code in departures else None),
        "modified": text_or_none(row["ModificationDateTime"]),
        # Shelter and real-time display come from their own PTIMS files, so
        # they are known even for unsurveyed stops when a unit is recorded.
        "shelter": "yes" if shelters.get(code) else yes_no_unknown(surveyed, False),
        "bench": fac("Bench"),
        "rtpi": "yes" if rtpi.get(code) else yes_no_unknown(surveyed, False),
        "wheelchair": fac("WheelchairAccessibility"),
        "footpath": fac("FootpathToStop"),
        "kerb": fac("CastleKerbing"),
        "step": fac("StepAtStop"),
        "bin": fac("Bin"),
        "bike_stand": fac("BikeStand"),
    }
    features.append({
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [round(lon, 5), round(lat, 5)]},
        "properties": props,
    })

os.makedirs(OUT, exist_ok=True)
with open(f"{OUT}/stops.geojson", "w", encoding="utf-8") as f:
    json.dump({"type": "FeatureCollection", "features": features}, f, ensure_ascii=False)
print(f"  wrote {len(features):,} stops to {OUT}/stops.geojson")

print()
for key in ["shelter", "bench", "rtpi", "wheelchair", "footpath", "kerb", "step", "bin", "bike_stand"]:
    yes = sum(1 for f in features if f["properties"][key] == "yes")
    no = sum(1 for f in features if f["properties"][key] == "no")
    unknown = sum(1 for f in features if f["properties"][key] == "unknown")
    print(f"  {key:11s} yes={yes:6d}  no={no:6d}  unknown={unknown:6d}")

# ---------------------------------------------------------------------------
# Step 6. County summary
# ---------------------------------------------------------------------------
print("Step 6. Counties")
FACILITY_KEYS = ["shelter", "bench", "rtpi", "wheelchair"]
counties = {}
for f in features:
    p = f["properties"]
    name = p["county"] or "Unknown"
    lon, lat = f["geometry"]["coordinates"]
    if name not in counties:
        counties[name] = {"county": name, "stops": 0, "surveyed": 0,
                          "bbox": [lon, lat, lon, lat], "busy_no_shelter": []}
        for key in FACILITY_KEYS:
            counties[name][key] = {"yes": 0, "no": 0}
    c = counties[name]
    c["stops"] += 1
    c["surveyed"] += 1 if p["surveyed"] else 0
    for key in FACILITY_KEYS:
        if p[key] in ("yes", "no"):
            c[key][p[key]] += 1
    c["bbox"] = [min(c["bbox"][0], lon), min(c["bbox"][1], lat),
                 max(c["bbox"][2], lon), max(c["bbox"][3], lat)]
    if p["shelter"] == "no" and p["departures_weekday"] is not None:
        c["busy_no_shelter"].append({"id": p["id"], "name": p["name"],
                                     "departures": p["departures_weekday"], "lng": lon, "lat": lat})
for c in counties.values():
    c["busy_no_shelter"].sort(key=lambda s: s["departures"], reverse=True)
    c["busy_no_shelter"] = c["busy_no_shelter"][:5]
county_list = sorted(counties.values(), key=lambda c: c["county"])
with open(f"{OUT}/counties.json", "w", encoding="utf-8") as f:
    json.dump(county_list, f, ensure_ascii=False, indent=1)
print("  wrote", len(county_list), "counties")

# ---------------------------------------------------------------------------
# Step 7. Meta: when, and from what
# ---------------------------------------------------------------------------
sources = {}
if os.path.exists(f"{RAW}/sources.json"):
    with open(f"{RAW}/sources.json", encoding="utf-8") as f:
        sources = json.load(f)
meta = {
    "built": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    "stops": len(features),
    "surveyed": sum(1 for f in features if f["properties"]["surveyed"]),
    "sources": {k: {"url": v.get("url"), "fetched": v.get("fetched"),
                    "last_modified": v.get("last_modified")} for k, v in sources.items()},
}
with open(f"{OUT}/meta.json", "w", encoding="utf-8") as f:
    json.dump(meta, f, indent=1)
print("  wrote", f"{OUT}/meta.json")
