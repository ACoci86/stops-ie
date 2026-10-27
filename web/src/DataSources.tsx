// A small modal listing where the data comes from.

import { useEffect, useRef } from "react";

interface Props {
  onClose: () => void;
}

export default function DataSources({ onClose }: Props) {
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
          </li>
          <li>
            <a href="https://data.gov.ie/dataset/public-transport-infrastructure-management-system-ptims" target="_blank" rel="noreferrer">PTIMS</a>
            : shelters, seating, kerbs, accessibility and the NTA's A to C rating.
          </li>
          <li>
            <a href="https://data.gov.ie/dataset/nta-gtfs" target="_blank" rel="noreferrer">GTFS</a>
            : routes and departure counts.
          </li>
          <li>
            Combined by{" "}
            <a href="https://projects.bibby.ie/naptimfs/" target="_blank" rel="noreferrer">NaPTIMFS</a>
            , an independent project by Thomas Bibby.
          </li>
        </ul>
        <p>
          Base map by{" "}
          <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a>{" "}
          from OpenStreetMap data.
        </p>
        <p className="modal-note">
          A record says what the NTA has on file. It is not a guarantee of what is on
          the ground today. Stops marked "unknown" have not been surveyed.
        </p>
      </div>
    </div>
  );
}
