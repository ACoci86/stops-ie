// The map. One component that owns the MapLibre instance.
//
// It does not decide what is selected. The app tells it (via the `selected`
// prop) and it reports clicks back (via `onSelect`). That keeps all the state
// in one place, App.tsx.

import { useEffect, useRef } from "react";
import {
  GeolocateControl,
  MapLibreMap,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import type { FeatureCollection, Point } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import { normaliseProperties, type SelectedStop, type StopProperties } from "./types";

// MapLibre does its heavy lifting in a web worker, a separate script the
// browser runs in the background. It expects that script to sit next to its
// own main file, but Vite moves files around when bundling. So we import the
// worker as a URL (Vite's "?url" suffix) and hand that URL to MapLibre.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
setWorkerUrl(workerUrl);

// Free vector tiles, no API key. Positron is a light, quiet style.
const BASEMAP = "https://tiles.openfreemap.org/styles/positron";

// The island, west/south to east/north. The map starts fitted to this,
// which works on any screen size.
const IRELAND_BOUNDS: [[number, number], [number, number]] = [
  [-10.7, 51.35],
  [-5.4, 55.45],
];

// MapLibre cannot use an SVG file directly. We draw it onto a canvas at
// double size (for sharp retina screens) and hand MapLibre the pixels.
async function addSvgIcon(map: MapLibreMap, name: string, url: string, size: number) {
  const img = new Image(size * 2, size * 2);
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Could not load ${url}`));
    img.src = url;
  });
  const canvas = document.createElement("canvas");
  canvas.width = size * 2;
  canvas.height = size * 2;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, size * 2, size * 2);
  map.addImage(name, ctx.getImageData(0, 0, size * 2, size * 2), { pixelRatio: 2 });
}

function pinData(selected: SelectedStop | null): GeoJSON.FeatureCollection {
  if (!selected) return { type: "FeatureCollection", features: [] };
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [selected.lng, selected.lat] },
        properties: {},
      },
    ],
  };
}

interface Props {
  stops: FeatureCollection<Point, StopProperties>; // what to draw (already filtered)
  selected: SelectedStop | null;
  onSelect: (stop: SelectedStop) => void;
  fitBounds: [number, number, number, number] | null; // zoom to this area when it changes
  bottomPadding: number; // pixels covered by the phone bottom sheet
}

export default function StopsMap({ stops, selected, onSelect, fitBounds, bottomPadding }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const readyRef = useRef(false); // true once our layers exist

  // Refs that always hold the latest props, so the click handler we register
  // once on mount never reads stale values. They are updated in an effect,
  // after each render, because React forbids touching refs during render.
  const onSelectRef = useRef(onSelect);
  const selectedRef = useRef(selected);
  const stopsRef = useRef(stops);
  const paddingRef = useRef(bottomPadding);
  useEffect(() => {
    onSelectRef.current = onSelect;
    selectedRef.current = selected;
    stopsRef.current = stops;
    paddingRef.current = bottomPadding;
  });

  // Create the map once, when the component first appears.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: BASEMAP,
      bounds: IRELAND_BOUNDS,
      // On a phone, leave room for the top bar and the bottom sheet.
      fitBoundsOptions: {
        padding: {
          top: paddingRef.current > 0 ? 80 : 20,
          bottom: 20 + paddingRef.current,
          left: 20,
          right: 20,
        },
      },
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.addControl(new NavigationControl(), "top-left");
    map.addControl(
      new GeolocateControl({ positionOptions: { enableHighAccuracy: true } }),
      "top-left",
    );

    map.on("load", async () => {
      await addSvgIcon(map, "cluster-frame", "/icons/marker-cluster.svg", 48);
      await addSvgIcon(map, "stop-selected", "/icons/marker-stop-selected.svg", 48);

      // 1. All stops. The app hands us the data (so it is only downloaded
      //    once, and so filters can change it). MapLibre clusters it.
      map.addSource("stops", {
        type: "geojson",
        data: stopsRef.current,
        cluster: true,
        clusterMaxZoom: 11, // from zoom 12 on, show every stop as its own dot
        clusterRadius: 40,
      });

      // 2. Clusters: the brand frame icon with the stop count inside.
      map.addLayer({
        id: "clusters",
        type: "symbol",
        source: "stops",
        filter: ["has", "point_count"],
        layout: {
          "icon-image": "cluster-frame",
          "icon-size": ["step", ["get", "point_count"], 0.75, 50, 0.9, 200, 1.1],
          "icon-allow-overlap": true,
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Noto Sans Bold"],
          "text-size": ["step", ["get", "point_count"], 11, 50, 12, 200, 13],
          "text-allow-overlap": true,
        },
        paint: { "text-color": "#111111" },
      });

      // 3. Individual stops, coloured by shelter: yes / no / unknown.
      map.addLayer({
        id: "stops",
        type: "circle",
        source: "stops",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 4, 15, 7],
          "circle-color": [
            "match",
            ["get", "shelter"],
            "yes", "#009e73",
            "no", "#d1242f",
            "#9a9a9a",
          ],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
        },
      });

      // 4. The selected stop's pin.
      map.addSource("selected", { type: "geojson", data: pinData(selectedRef.current) });
      map.addLayer({
        id: "selected-stop",
        type: "symbol",
        source: "selected",
        layout: {
          "icon-image": "stop-selected",
          "icon-size": 0.9,
          "icon-anchor": "bottom",
          "icon-allow-overlap": true,
        },
      });
      readyRef.current = true;
      (map.getSource("stops") as GeoJSONSource).setData(stopsRef.current);

      // Click a cluster: zoom in on it.
      map.on("click", "clusters", async (e: MapLayerMouseEvent) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const source = map.getSource("stops") as GeoJSONSource;
        const zoom = await source.getClusterExpansionZoom(feature.properties.cluster_id);
        map.easeTo({ center: (feature.geometry as Point).coordinates as [number, number], zoom });
      });

      // Click a stop: tell the app.
      map.on("click", "stops", (e: MapLayerMouseEvent) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const [lng, lat] = (feature.geometry as Point).coordinates;
        onSelectRef.current({ props: normaliseProperties(feature.properties), lng, lat });
      });

      for (const layer of ["clusters", "stops"]) {
        map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
  }, []);

  // React to the selection changing: move the pin, and fly there if needed.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    (map.getSource("selected") as GeoJSONSource).setData(pinData(selected));
    if (!selected) return;

    // On a phone the bottom sheet covers part of the map, so we pad the
    // bottom and the stop lands in the visible part.
    const padding = { top: 0, left: 0, right: 0, bottom: paddingRef.current };
    const target: [number, number] = [selected.lng, selected.lat];
    const inView = map.getBounds().contains(target);
    if (!inView || map.getZoom() < 13 || padding.bottom > 0) {
      map.flyTo({ center: target, zoom: Math.max(map.getZoom(), 15), duration: 1200, padding });
    }
  }, [selected]);

  // When the app changes the data (filters), push it into the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    (map.getSource("stops") as GeoJSONSource).setData(stops);
  }, [stops]);

  // Zoom to an area, e.g. a county picked in the sidebar.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fitBounds) return;
    map.fitBounds(
      [
        [fitBounds[0], fitBounds[1]],
        [fitBounds[2], fitBounds[3]],
      ],
      { padding: { top: 40, left: 40, right: 40, bottom: 40 + paddingRef.current }, duration: 1000 },
    );
  }, [fitBounds]);

  return (
    <div
      ref={containerRef}
      className="map"
      role="region"
      aria-label="Map of bus stops. Use the search box to find a stop by name."
    />
  );
}
