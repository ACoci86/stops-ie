"""
Download the raw data STOPS is built from, straight from the publishers.

    python scripts/download.py            # everything
    python scripts/download.py --no-gtfs  # skip the big timetable file

Files land in data/raw/. A sources.json there records where each file came
from and when it was fetched, so the website can show a "data updated" date.

Sources (all open data, CC BY 4.0 unless noted):
  NaPTAN   National Transport Authority   stop register
  PTIMS    National Transport Authority   stop infrastructure
  GTFS     National Transport Authority   timetables
  Boundaries  Tailte Éireann / CSO        local authorities, electoral areas,
                                          urban areas (CC BY 4.0)
"""

import argparse
import json
import os
import urllib.parse
import urllib.request
from datetime import datetime, timezone

RAW_DIR = "data/raw"

NTA = "https://www.transportforireland.ie/transitData/Data"
FILES = {
    "naptan_stop_points.csv": f"{NTA}/NaPTAN_Stop_Points.csv",
    "ptims.zip": f"{NTA}/ptims.zip",
    "gtfs_all.zip": f"{NTA}/GTFS_All.zip",
}

# Boundary layers are served by ArcGIS feature services. We page through
# them 1,000 features at a time and save plain GeoJSON.
ARCGIS = "https://services-eu1.arcgis.com"
BOUNDARIES = {
    "admin_areas.geojson": (
        f"{ARCGIS}/FH5XCsx8rYXqnjF5/arcgis/rest/services/"
        "Administrative_Areas___OSi_National_Statutory_Boundaries___Generalised_20m/FeatureServer/0"
    ),
    "leas.geojson": (
        f"{ARCGIS}/FH5XCsx8rYXqnjF5/arcgis/rest/services/"
        "Local_Electoral_Areas___OSi_National_Statutory_Boundaries___Generalised_20m/FeatureServer/0"
    ),
    "urban_areas.geojson": (
        f"{ARCGIS}/BuS9rtTsYEV5C0xh/arcgis/rest/services/"
        "Urban_Areas_National_Statistical_Boundaries_2022_Generalised_20m/FeatureServer/5"
    ),
}


def download_file(url, path):
    """Fetch a URL to a file. Returns the server's Last-Modified header if any."""
    print("Downloading", url)
    request = urllib.request.Request(url, headers={"User-Agent": "stops-ie data pipeline"})
    with urllib.request.urlopen(request, timeout=600) as response, open(path, "wb") as out:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)
        last_modified = response.headers.get("Last-Modified")
    print("  saved", path, f"({os.path.getsize(path) / 1_000_000:.1f} MB)")
    return last_modified


def download_layer(service_url, path):
    """Page through an ArcGIS feature layer and save it as GeoJSON."""
    print("Downloading boundary layer", service_url)
    features = []
    offset = 0
    while True:
        query = urllib.parse.urlencode({
            "where": "1=1",
            "outFields": "*",
            "outSR": 4326,          # plain latitude/longitude
            "f": "geojson",
            "resultOffset": offset,
            "resultRecordCount": 1000,
        })
        with urllib.request.urlopen(f"{service_url}/query?{query}", timeout=300) as response:
            page = json.load(response)
        got = page.get("features", [])
        features += got
        more = page.get("properties", {}).get("exceededTransferLimit", False)
        if not more and len(got) < 1000:
            break
        offset += len(got)
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": features}, f)
    print("  saved", path, f"({len(features)} features)")


# ---------------------------------------------------------------------------
parser = argparse.ArgumentParser(description="Download raw data for STOPS.")
parser.add_argument("--no-gtfs", action="store_true", help="skip the 200 MB timetable file")
parser.add_argument("--no-boundaries", action="store_true", help="skip the boundary layers")
args = parser.parse_args()

os.makedirs(RAW_DIR, exist_ok=True)
sources = {}

for name, url in FILES.items():
    if args.no_gtfs and name == "gtfs_all.zip":
        continue
    path = os.path.join(RAW_DIR, name)
    last_modified = download_file(url, path)
    sources[name] = {
        "url": url,
        "fetched": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "last_modified": last_modified,
        "bytes": os.path.getsize(path),
    }

if not args.no_boundaries:
    for name, service_url in BOUNDARIES.items():
        path = os.path.join(RAW_DIR, name)
        download_layer(service_url, path)
        sources[name] = {
            "url": service_url,
            "fetched": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "bytes": os.path.getsize(path),
        }

# Merge with any earlier record, so a partial download keeps older entries.
sources_path = os.path.join(RAW_DIR, "sources.json")
if os.path.exists(sources_path):
    with open(sources_path, encoding="utf-8") as f:
        old = json.load(f)
    old.update(sources)
    sources = old
with open(sources_path, "w", encoding="utf-8") as f:
    json.dump(sources, f, indent=1)
print("Wrote", sources_path)
