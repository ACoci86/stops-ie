// Search stops by name or stop number. Works on the data already in memory,
// so there is no server and no network delay. Arrow keys move through the
// results, Enter picks one, Escape closes the list.

import { useMemo, useState } from "react";
import type { Feature, Point } from "geojson";
import type { SelectedStop, StopProperties } from "./types";

interface Props {
  stops: Feature<Point, StopProperties>[];
  onPick: (stop: SelectedStop) => void;
}

export default function SearchBox({ stops, onPick }: Props) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0); // which result is highlighted

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const out: Feature<Point, StopProperties>[] = [];
    for (const f of stops) {
      const p = f.properties;
      if (
        p.name?.toLowerCase().includes(q) ||
        p.name_ga?.toLowerCase().includes(q) ||
        p.id.toLowerCase().startsWith(q)
      ) {
        out.push(f);
        if (out.length === 8) break;
      }
    }
    return out;
  }, [query, stops]);

  function pick(f: Feature<Point, StopProperties>) {
    const [lng, lat] = f.geometry.coordinates;
    onPick({ props: f.properties, lng, lat });
    setQuery("");
    setActive(0);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(results[active]);
    } else if (e.key === "Escape") {
      setQuery("");
    }
  }

  return (
    <div className="search">
      <img src="/icons/icon-search.svg" alt="" className="search-icon" />
      <input
        type="search"
        placeholder={stops.length ? "Search a stop name or number" : "Loading stops…"}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        disabled={stops.length === 0}
        aria-label="Search stops"
        role="combobox"
        aria-expanded={results.length > 0}
        aria-controls="search-results"
        aria-autocomplete="list"
        aria-activedescendant={results.length ? `result-${active}` : undefined}
      />
      {results.length > 0 && (
        <ul className="search-results" id="search-results" role="listbox">
          {results.map((f, i) => (
            <li key={f.properties.id} id={`result-${i}`} role="option" aria-selected={i === active}>
              <button
                className={i === active ? "active" : undefined}
                onClick={() => pick(f)}
                onMouseEnter={() => setActive(i)}
                tabIndex={-1}
              >
                <span className="result-name">{f.properties.name}</span>
                <span className="result-sub">
                  {f.properties.county} · {f.properties.id}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
