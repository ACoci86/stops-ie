// The map. One component that owns the MapLibre instance.

import { useEffect, useRef, useState } from "react";
import {
  MapLibreMap,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import type { Point } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";

// MapLibre does its heavy lifting in a web worker, a separate script the
// browser runs in the background. It expects that script to sit next to its
// own main file, but Vite moves files around when bundling. So we import the
// worker as a URL (Vite's "?url" suffix) and hand that URL to MapLibre.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
setWorkerUrl(workerUrl);

// Free vector tiles, no API key. Positron is a light, quiet style.
const BASEMAP = "https://tiles.openfreemap.org/styles/positron";

// Roughly the centre of Ireland, and a zoom that shows the whole island.
const IRELAND_CENTER: [number, number] = [-7.9, 53.4];
const IRELAND_ZOOM = 6.5;

export default function StopsMap() {
  // A ref is a box React keeps between renders. We use one to hold the
  // <div> the map draws into, and another to hold the map object itself.
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [error, setError] = useState<string | null>(null);

  // useEffect runs after the component is on screen. That is the earliest
  // moment the <div> exists, which MapLibre needs before it can draw.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container: containerRef.current,
        style: BASEMAP,
        center: IRELAND_CENTER,
        zoom: IRELAND_ZOOM,
      });
    } catch (err) {
      // Deferred one tick: React's lint rule forbids setting state
      // synchronously inside an effect.
      queueMicrotask(() => setError(`Could not start the map: ${String(err)}`));
      return;
    }
    mapRef.current = map;

    // Any later failure (tiles, data file, style) lands here.
    map.on("error", (e) => {
      console.error("MapLibre error", e.error);
      setError(`Map error: ${e.error?.message ?? String(e.error)}`);
    });

    map.addControl(new NavigationControl(), "top-right");

    // Wait for the basemap to load before adding our own data on top.
    map.on("load", () => {
      // 1. The data source. MapLibre fetches the GeoJSON and does the
      //    clustering for us: nearby stops merge into one circle when zoomed out.
      map.addSource("stops", {
        type: "geojson",
        data: "/data/stops.geojson",
        cluster: true,
        clusterMaxZoom: 13, // stop clustering once zoomed in this far
        clusterRadius: 40, // pixels
      });

      // 2. Cluster circles. Size grows with the number of stops inside.
      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "stops",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#111111", // brand ink
          "circle-opacity": 0.85,
          "circle-radius": [
            "step",
            ["get", "point_count"],
            14, // up to 50 stops
            50, 18, // 50 to 200
            200, 24, // 200+
          ],
        },
      });

      // 3. The number inside each cluster circle.
      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "stops",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Noto Sans Bold"], // a font OpenFreeMap actually serves
          "text-size": 12,
        },
        paint: { "text-color": "#ffffff" },
      });

      // 4. Individual stops. Colour by shelter: yes / no / unknown.
      map.addLayer({
        id: "stops",
        type: "circle",
        source: "stops",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": 6,
          "circle-color": [
            "match",
            ["get", "shelter"],
            "yes", "#009e73", // brand green
            "no", "#d1242f",
            "#9a9a9a", // unknown
          ],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
        },
      });

      // Click a cluster: zoom in on it.
      map.on("click", "clusters", async (e: MapLayerMouseEvent) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const clusterId = feature.properties.cluster_id;
        const source = map.getSource("stops") as GeoJSONSource;
        const zoom = await source.getClusterExpansionZoom(clusterId);
        map.easeTo({
          center: (feature.geometry as Point).coordinates as [number, number],
          zoom,
        });
      });

      // Click a stop: show a small popup with its name and shelter status.
      map.on("click", "stops", (e: MapLayerMouseEvent) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const p = feature.properties;
        const coords = (feature.geometry as Point).coordinates as [number, number];
        new Popup()
          .setLngLat(coords)
          .setHTML(
            `<strong>${p.name ?? "Unnamed stop"}</strong><br/>` +
            `${p.county ?? ""}<br/>` +
            `Shelter: ${p.shelter}<br/>` +
            `Bench: ${p.bench}<br/>` +
            `Stop ID: ${p.id}`,
          )
          .addTo(map);
      });

      // Pointer cursor over clickable things.
      for (const layer of ["clusters", "stops"]) {
        map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
      }
    });

    // Cleanup: if the component is removed, destroy the map.
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div className="map-wrap">
      <div ref={containerRef} className="map" />
      {error && <div className="map-error">{error}</div>}
    </div>
  );
}
