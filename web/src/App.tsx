import { useCallback, useEffect, useMemo, useState } from "react";
import type { FeatureCollection, Point } from "geojson";
import StopsMap from "./StopsMap";
import StopPanel from "./StopPanel";
import SearchBox from "./SearchBox";
import Intro from "./Intro";
import Counties from "./Counties";
import DataSources from "./DataSources";
import Sheet, { type SheetState } from "./Sheet";
import { useIsMobile } from "./useIsMobile";
import { filterStops, nearbyStops, type StopFeature } from "./filterStops";
import { NO_FILTERS, type CountyStats, type Filters, type Meta, type SelectedStop, type StopProperties } from "./types";

type View = "intro" | "counties";

// Read "#stop=8220DB000060" from the address bar.
function stopIdFromHash(): string | null {
  const m = window.location.hash.match(/^#stop=([A-Za-z0-9]+)$/);
  return m ? m[1] : null;
}

export default function App() {
  // All the state lives here. Children get it as props.
  const [stops, setStops] = useState<StopFeature[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [counties, setCounties] = useState<CountyStats[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [selected, setSelected] = useState<SelectedStop | null>(null);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [view, setView] = useState<View>("intro");
  const [county, setCounty] = useState<string | null>(null);
  const [fitBounds, setFitBounds] = useState<[number, number, number, number] | null>(null);
  const [showSources, setShowSources] = useState(false);
  const isMobile = useIsMobile();
  const [sheet, setSheet] = useState<SheetState>("half");

  // Load the data once. The map gets it as a prop, so one download serves both.
  useEffect(() => {
    fetch("/data/stops.geojson")
      .then((r) => {
        if (!r.ok) throw new Error(`Server said ${r.status}`);
        return r.json();
      })
      .then((fc: FeatureCollection<Point, StopProperties>) => setStops(fc.features))
      .catch((err) => {
        console.error("Could not load stops", err);
        setLoadError("The stop data could not be loaded. Check your connection and reload.");
      });
    fetch("/data/counties.json")
      .then((r) => r.json())
      .then(setCounties)
      .catch((err) => console.error("Could not load counties", err));
    fetch("/data/meta.json")
      .then((r) => r.json())
      .then(setMeta)
      .catch((err) => console.error("Could not load meta", err));
  }, []);

  // Turn a stop number into a SelectedStop, or null if we do not know it.
  const stopById = useCallback(
    (id: string): SelectedStop | null => {
      const f = stops.find((s) => s.properties.id === id);
      if (!f) return null;
      const [lng, lat] = f.geometry.coordinates;
      return { props: f.properties, lng, lat };
    },
    [stops],
  );

  // Shareable links. On load (and when the hash changes), open the stop in
  // the URL. When a stop is picked, write it to the URL.
  useEffect(() => {
    if (stops.length === 0) return;
    const apply = () => {
      const id = stopIdFromHash();
      setSelected(id ? stopById(id) : null);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [stops, stopById]);

  function select(stop: SelectedStop | null) {
    setSelected(stop);
    if (stop) setSheet("half");
    const hash = stop ? `#stop=${stop.props.id}` : "";
    if (window.location.hash !== hash) {
      // replaceState changes the URL without adding a browser-history entry
      // and without firing hashchange, so we do not loop.
      history.replaceState(null, "", window.location.pathname + window.location.search + hash);
    }
  }

  // Apply the filters and the county choice.
  const visible = useMemo<FeatureCollection<Point, StopProperties>>(
    () => ({ type: "FeatureCollection", features: filterStops(stops, filters, county) }),
    [stops, filters, county],
  );

  // Other stops within walking distance of the selected one.
  const nearby = useMemo(
    () => (selected ? nearbyStops(stops, selected.lng, selected.lat, selected.props.id) : []),
    [stops, selected],
  );

  function pickCounty(c: CountyStats | null) {
    setCounty(c ? c.county : null);
    if (c) setFitBounds(c.bbox);
  }

  const loading = stops.length === 0 && !loadError;

  let summary = loading ? "Loading stops…" : `${stops.length.toLocaleString("en-IE")} bus stops`;
  if (loadError) summary = "Could not load stops";
  else if (selected) summary = selected.props.name ?? selected.props.id;
  else if (view === "counties") summary = county ?? "Counties";
  else if (visible.features.length !== stops.length)
    summary = `${visible.features.length.toLocaleString("en-IE")} stops match your filters`;

  let body;
  if (loadError) {
    body = (
      <p className="status status-error" role="alert">
        {loadError}
      </p>
    );
  } else if (selected) {
    body = <StopPanel stop={selected} nearby={nearby} onPick={select} onBack={() => select(null)} />;
  } else if (view === "counties") {
    body = (
      <Counties
        counties={counties}
        active={county}
        onPickCounty={pickCounty}
        onPickStop={select}
        onBack={() => {
          setView("intro");
          setCounty(null);
        }}
        stopById={stopById}
      />
    );
  } else {
    body = (
      <Intro
        loading={loading}
        total={stops.length}
        shown={visible.features.length}
        filters={filters}
        onFilters={setFilters}
        onCounties={() => setView("counties")}
      />
    );
  }

  return (
    <div className="layout">
      <header className="topbar">
        <a
          href="/"
          className="brand-link"
          onClick={(e) => {
            e.preventDefault();
            select(null);
            setView("intro");
            setCounty(null);
            setSheet("half");
          }}
        >
          <img src="/logo-header.svg" alt="STOPS, home" className="brand-logo" />
          <img src="/favicon.svg" alt="STOPS, home" className="brand-mark" />
        </a>
        <span className="brand-tag">Ireland's bus stops and what they have</span>
        <SearchBox stops={stops} onPick={select} />
      </header>

      {isMobile ? (
        <Sheet state={sheet} onChange={setSheet} summary={summary}>
          {body}
        </Sheet>
      ) : (
        <aside className="sidebar">
          <div className="sidebar-body">{body}</div>
        </aside>
      )}

      <main className="map-area">
        <StopsMap
          stops={visible}
          selected={selected}
          onSelect={select}
          fitBounds={fitBounds}
          bottomPadding={isMobile && sheet !== "peek" ? Math.round(window.innerHeight * 0.5) : 0}
        />
        <div className="map-buttons">
          <button
            className="pill"
            onClick={() => {
              select(null);
              setView("counties");
              setSheet("half");
            }}
          >
            Counties
          </button>
          <button className="pill" onClick={() => setShowSources(true)}>
            About
          </button>
        </div>
      </main>

      {showSources && <DataSources meta={meta} onClose={() => setShowSources(false)} />}
    </div>
  );
}
