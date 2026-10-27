// The detail view for one stop. Replaces the intro in the sidebar.

import { useEffect, useRef, useState } from "react";
import { CONTACT_EMAIL } from "./config";
import type { NearbyStop } from "./filterStops";
import type { SelectedStop, StopProperties, YesNoUnknown } from "./types";

interface Facility {
  key: keyof StopProperties;
  label: string;
  icon: string; // file in /public/icons/detail
  goodWhen: YesNoUnknown; // "yes" for a shelter, "no" for a step at the stop
}

const FACILITIES: Facility[] = [
  { key: "shelter", label: "Shelter", icon: "shelter", goodWhen: "yes" },
  { key: "bench", label: "Seating", icon: "seating", goodWhen: "yes" },
  { key: "rtpi", label: "Real-time display", icon: "realtime-display", goodWhen: "yes" },
  { key: "wheelchair", label: "Wheelchair accessible", icon: "wheelchair-accessible", goodWhen: "yes" },
  { key: "kerb", label: "Raised kerb", icon: "raised-kerb", goodWhen: "yes" },
  { key: "footpath", label: "Footpath to stop", icon: "footpath", goodWhen: "yes" },
  { key: "step", label: "Step at stop", icon: "step-at-stop", goodWhen: "no" },
  { key: "bin", label: "Bin", icon: "bin", goodWhen: "yes" },
  { key: "bike_stand", label: "Bike stand", icon: "bike-stand", goodWhen: "yes" },
];

// A small icon from the detail set, sized by CSS.
function Icon({ name }: { name: string }) {
  return <img src={`/icons/detail/${name}.svg`} alt="" className="icon" />;
}

function Mark({ value, goodWhen }: { value: YesNoUnknown; goodWhen: YesNoUnknown }) {
  if (value === "unknown") return <span className="mark mark-unknown">Unknown</span>;
  const good = value === goodWhen;
  return (
    <span className={good ? "mark mark-good" : "mark mark-bad"}>
      <Icon name={good ? "status-yes" : "status-no"} />
      {value === "yes" ? "Yes" : "No"}
    </span>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return "unknown";
  return new Date(iso).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" });
}

interface Props {
  stop: SelectedStop;
  nearby: NearbyStop[];
  onPick: (s: SelectedStop) => void;
  onBack: () => void;
}

// Tiny yes/no/unknown dot for the nearby list.
function MiniMark({ value, title }: { value: YesNoUnknown; title: string }) {
  return <i className={`mini mini-${value}`} title={`${title}: ${value}`} aria-label={`${title}: ${value}`} />;
}

export default function StopPanel({ stop, nearby, onPick, onBack }: Props) {
  const p = stop.props;
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link", shareUrl);
    }
  }

  // Put keyboard focus on the title when a stop opens, so screen-reader
  // users land on the new content instead of staying on the map.
  useEffect(() => {
    titleRef.current?.focus();
  }, [p.id]);

  const shareUrl = `${window.location.origin}${window.location.pathname}#stop=${p.id}`;
  const reportHref =
    `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`STOPS: problem with stop ${p.id}`)}` +
    `&body=${encodeURIComponent(
      `Stop: ${p.name ?? ""} (${p.id})\nLink: ${shareUrl}\n\nWhat is wrong or out of date?\n\n`,
    )}`;
  const place = [p.street, p.lea, p.county].filter((x) => x && x !== p.name).join(", ");

  return (
    <div className="panel">
      <button className="back" onClick={onBack}>
        <Icon name="arrow-back" />
        All stops
      </button>

      <h2 className="panel-title" ref={titleRef} tabIndex={-1}>
        {p.name ?? "Unnamed stop"}
      </h2>
      {p.name_ga && p.name_ga !== p.name && (
        <p className="panel-ga" lang="ga">
          {p.name_ga}
        </p>
      )}
      {place && <p className="panel-place">{place}</p>}

      <div className="rating">
        {p.surveyed ? (
          <>
            <span className="rating-badge">{p.rating ?? "–"}</span>
            <span className="rating-label">NTA accessibility rating</span>
          </>
        ) : (
          <span className="rating-none">Not yet surveyed by the NTA. Facilities below are unknown.</span>
        )}
      </div>

      <ul className="facilities">
        {FACILITIES.map((f) => (
          <li key={f.key} className="facility">
            <Icon name={f.icon} />
            <span className="facility-label">{f.label}</span>
            <Mark value={p[f.key] as YesNoUnknown} goodWhen={f.goodWhen} />
          </li>
        ))}
      </ul>

      <h3 className="panel-h3">Service</h3>
      <p className="panel-line">
        <Icon name="departures" />
        {p.departures_weekday != null
          ? `${p.departures_weekday} departures on an average weekday`
          : "No timetable data"}
      </p>
      {p.routes.length > 0 && (
        <div className="routes">
          {p.routes.map((r) => (
            <span key={r} className="route">
              {r}
            </span>
          ))}
        </div>
      )}

      {nearby.length > 0 && (
        <>
          <h3 className="panel-h3">Nearby stops</h3>
          <ul className="nearby">
            {nearby.map(({ feature, metres }) => {
              const q = feature.properties;
              const [lng, lat] = feature.geometry.coordinates;
              return (
                <li key={q.id}>
                  <button className="nearby-stop" onClick={() => onPick({ props: q, lng, lat })}>
                    <span className="nearby-name">
                      {q.name ?? q.id}
                      <small>{q.id}</small>
                    </span>
                    <span className="nearby-marks">
                      <MiniMark value={q.shelter} title="Shelter" />
                      <MiniMark value={q.bench} title="Seating" />
                      <MiniMark value={q.rtpi} title="Real-time display" />
                    </span>
                    <span className="nearby-dist">{metres} m</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="muted small">Dots: shelter, seating, real-time display.</p>
        </>
      )}

      <dl className="panel-meta">
        <dt><Icon name="stop-number" /> Stop number</dt>
        <dd>{p.id}</dd>
        <dt><Icon name={p.urban ? "setting-urban" : "setting-rural"} /> Setting</dt>
        <dd>{p.urban ? "Urban" : "Rural"}</dd>
        <dt><Icon name="record-updated" /> Record updated</dt>
        <dd>{formatDate(p.modified)}</dd>
        <dt><Icon name="source" /> Source</dt>
        <dd>National Transport Authority, NaPTAN and PTIMS</dd>
      </dl>

      <a
        className="directions"
        href={`https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}`}
        target="_blank"
        rel="noreferrer"
      >
        <Icon name="directions" />
        Directions to this stop
      </a>

      <div className="panel-actions">
        <button className="link" onClick={copyLink} title="Copy a link that opens this stop">
          <Icon name="copy-link" /> {copied ? "Link copied" : "Copy link to this stop"}
        </button>
        <a className="link" href={reportHref}>
          <img src="/icons/icon-report.svg" alt="" className="icon" /> Report a problem
        </a>
      </div>
    </div>
  );
}
