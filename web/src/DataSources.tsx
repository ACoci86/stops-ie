// A small modal listing where the data comes from.

import { useEffect, useRef } from "react";
import type { Meta } from "./types";

interface Props {
  meta: Meta | null;
  onClose: () => void;
}

function day(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" });
}

export default function DataSources({ meta, onClose }: Props) {
  const src = meta?.sources ?? {};
  const published = (file: string) => day(src[file]?.last_modified) ?? day(src[file]?.fetched);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Move keyboard focus into the modal, close on Escape, and put focus back
  // where it was when the modal goes away.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="sources-title">
        <button className="modal-close" onClick={onClose} aria-label="Close" ref={closeRef}>
          ×
        </button>
        <h2 id="sources-title">Data sources</h2>
        <p>
          All stop data is published by the National Transport Authority (NTA) under
          the Creative Commons Attribution 4.0 licence.
        </p>
        <ul>
          <li>
            <a href="https://data.gov.ie/dataset/national-public-transport-access-nodes-naptan" target="_blank" rel="noreferrer">NaPTAN</a>
            : stop names, numbers and locations.
            {published("naptan_stop_points.csv") && <span className="muted"> Published {published("naptan_stop_points.csv")}.</span>}
          </li>
          <li>
            <a href="https://data.gov.ie/dataset/public-transport-infrastructure-management-system-ptims" target="_blank" rel="noreferrer">PTIMS</a>
            : shelters, seating, kerbs, accessibility and the NTA's A to C rating.
            {published("ptims.zip") && <span className="muted"> Published {published("ptims.zip")}.</span>}
          </li>
          <li>
            <a href="https://data.gov.ie/dataset/nta-gtfs" target="_blank" rel="noreferrer">GTFS</a>
            : routes and departures, counted over one reference week.
            {published("gtfs_all.zip") && <span className="muted"> Published {published("gtfs_all.zip")}.</span>}
          </li>
        </ul>
        <p>
          County, electoral area and urban area come from{" "}
          <a href="https://data.gov.ie/organization/tailte-eireann" target="_blank" rel="noreferrer">Tailte Éireann</a>{" "}
          and CSO boundaries, CC BY 4.0. Base map by{" "}
          <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a>{" "}
          from OpenStreetMap data.
        </p>
        {meta && (
          <p>
            This site's data was built on <strong>{day(meta.built)}</strong> from those files, by an
            open pipeline you can read on GitHub. It refreshes every week.
          </p>
        )}
        <p className="modal-note">
          A record says what the NTA has on file. It is not a guarantee of what is on
          the ground today. Stops marked "unknown" have not been surveyed.
        </p>
      </div>
    </div>
  );
}
