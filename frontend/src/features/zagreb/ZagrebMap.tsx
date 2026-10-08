"use client";

import { useEffect, useId, useRef, useState } from "react";
import { findNeighbourhood, NEIGHBOURHOODS } from "./neighbourhoods";
import { fitBounds, OVERVIEW, springStep, type Camera } from "./mapCamera";
import geometry from "./data/regions.json";
import styles from "./Zagreb.module.css";

export type MapTarget = { lat: number; lng: number; zoom: number };
/** Kept as a compatible input. Radius is never drawn as an administrative boundary. */
export type MapHighlight = { lat: number; lng: number; label: string; radiusM: number };
const districts = geometry.regions.filter(r => r.kind === "district");
const localAreas = geometry.regions.filter(r => r.kind === "local_committee");
const byId = new Map(geometry.regions.map(r => [r.id, r]));

export function ZagrebMap({ target, selectedId, onSelect }: { target: MapTarget | null; selectedId: string; highlight?: MapHighlight | null; onSelect?: (id: string) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const layer = useRef<SVGGElement>(null);
  const labels = useRef<SVGGElement>(null);
  const camera = useRef<Camera>({ ...OVERVIEW });
  const velocity = useRef<Camera>({ x: 0, y: 0, scale: 0 });
  const [explored, setExplored] = useState(selectedId);
  const [overview, setOverview] = useState(false);
  const [level, setLevel] = useState(findNeighbourhood(selectedId)?.kind === "local_committee" ? "local_committee" : "district");
  const [hover, setHover] = useState("");
  const descriptionId = useId();
  const selectId = useId();
  const chosen = findNeighbourhood(explored);
  const ids = chosen?.kind === "colloquial_group" ? chosen.memberIds : chosen ? [chosen.id] : [];
  const selectedRegions = ids.flatMap(id => { const region = byId.get(id); return region ? [region] : []; });
  const signature = ids.join(",");

  useEffect(() => {
    setExplored(selectedId);
    setOverview(false);
    setLevel(findNeighbourhood(selectedId)?.kind === "local_committee" ? "local_committee" : "district");
  }, [selectedId]);

  useEffect(() => {
    const goal = overview ? { ...OVERVIEW } : fitBounds(selectedRegions.map(r => r.bounds));
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    let last = performance.now();
    const draw = () => {
      const { x, y, scale } = camera.current;
      if (layer.current) layer.current.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
      // Keep labels quiet and readable instead of magnifying them with the terrain.
      if (labels.current) {
        labels.current.style.fontSize = `${Math.min(16, 23 / scale)}px`;
        labels.current.style.strokeWidth = `${2 / scale}px`;
      }
      if (root.current) {
        root.current.dataset.camera = `${x.toFixed(2)},${y.toFixed(2)},${scale.toFixed(3)}`;
        root.current.dataset.zoom = (12.4 + Math.log2(scale)).toFixed(2);
      }
    };
    const snap = () => { cancelAnimationFrame(raf); camera.current = { ...goal }; velocity.current = { x: 0, y: 0, scale: 0 }; draw(); if(root.current) root.current.dataset.moving = "false"; };
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      let settled = true;
      for (const key of ["x", "y", "scale"] as const) {
        const [value, speed] = springStep(camera.current[key], velocity.current[key], goal[key], dt);
        camera.current[key] = value;
        velocity.current[key] = speed;
        const tolerance = key === "scale" ? .00015 : .08;
        if (Math.abs(value - goal[key]) > tolerance || Math.abs(speed) > tolerance * 10) settled = false;
      }
      draw();
      if (settled) snap(); else raf = requestAnimationFrame(step);
    };
    const changed = () => { if (motion.matches) snap(); };
    if (motion.matches) snap();
    else { if(root.current) root.current.dataset.moving = "true"; raf = requestAnimationFrame(step); }
    motion.addEventListener("change", changed);
    return () => { cancelAnimationFrame(raf); motion.removeEventListener("change", changed); };
    // Geometry is immutable. Retarget only on actual region or overview changes, not hover.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, overview]);

  const select = (id: string) => {
    const entry = findNeighbourhood(id);
    if (!entry) return;
    setExplored(entry.id);
    setOverview(false);
    setLevel(entry.kind === "local_committee" ? "local_committee" : "district");
    onSelect?.(entry.id);
  };
  const reset = () => { setOverview(true); setHover(""); };
  const regions = level === "local_committee" ? localAreas : districts;

  return <div ref={root} className={styles.map} data-testid="zagreb-map" data-selected={chosen?.id ?? ""} data-lat={(chosen?.lat ?? target?.lat ?? 45.8131).toFixed(4)} data-lng={(chosen?.lng ?? target?.lng ?? 15.9775).toFixed(4)} aria-label="Karta zagrebačkih područja">
    <div className={styles.mapToolbar}>
      <div className={styles.mapLevels} aria-label="Razina karte" role="group">
        <button type="button" aria-pressed={level === "district"} onClick={() => setLevel("district")}>Četvrti</button>
        <button type="button" aria-pressed={level === "local_committee"} onClick={() => setLevel("local_committee")}>Mjesni odbori</button>
      </div>
      <button type="button" className={styles.mapReset} onClick={reset}>Cijeli Zagreb <span aria-hidden="true">↗</span></button>
    </div>
    <div className={styles.mapViewport}>
      <svg className={styles.mapSvg} viewBox="0 0 1200 1000" aria-label="Područja Zagreba" aria-describedby={descriptionId}>
        <g ref={layer} style={{ transformOrigin: "0 0" }}>
          <g aria-hidden="true" className={styles.mapBase}>{districts.map(r => <path key={r.id} d={r.path} fillRule="evenodd" vectorEffect="non-scaling-stroke" />)}</g>
          <g>{regions.map(r => <path key={r.id} d={r.path} className={styles.mapRegion} fillRule="evenodd" vectorEffect="non-scaling-stroke"
            role="button" tabIndex={-1} aria-label={`${r.name}, ${r.kind === "district" ? "gradska četvrt" : "mjesni odbor"}`} aria-pressed={ids.includes(r.id)} data-region={r.id}
            onPointerMove={() => setHover(r.name)} onPointerLeave={() => setHover("")} onClick={() => select(r.id)}
            onKeyDown={event => { if(event.key === "Enter" || event.key === " ") { event.preventDefault(); select(r.id); } }}><title>{r.name}</title></path>)}</g>
          <path className={styles.river} d={geometry.riverPath} fill="none" vectorEffect="non-scaling-stroke" aria-label="Sava" pointerEvents="none" />
          <g data-testid={selectedRegions.length ? "map-highlight" : undefined} data-label={chosen?.name} className={styles.selectedBoundary} aria-hidden="true" pointerEvents="none">
            {selectedRegions.map(r => <path key={r.id} d={r.path} fillRule="evenodd" vectorEffect="non-scaling-stroke" />)}
          </g>
          <g ref={labels} className={styles.mapLabels} aria-hidden="true" pointerEvents="none">{districts.filter(r => overview || ids.includes(r.id) || chosen?.districtId === r.id).map(r => <text key={r.id} x={r.anchor[0]} y={r.anchor[1]}>{r.name}</text>)}</g>
        </g>
      </svg>
      <span className={styles.north} aria-hidden="true">N ↑</span>
      <span className={styles.mapHover} aria-hidden="true">{hover || (overview ? "Zagreb · 17 gradskih četvrti" : chosen?.name)}</span>
    </div>
    <label htmlFor={selectId} className={styles.mapSelectLabel}>Odaberi područje</label>
    <select id={selectId} className={styles.mapSelect} value={chosen?.id ?? ""} onChange={event => select(event.target.value)}>
      <option value="" disabled>Odaberi područje</option>
      {(["district", "local_committee", "colloquial_group"] as const).map(kind => <optgroup key={kind} label={kind === "district" ? "Gradske četvrti" : kind === "local_committee" ? "Mjesni odbori" : "Uvriježena područja (skup četvrti)"}>
        {NEIGHBOURHOODS.filter(n => n.kind === kind).map(n => <option key={n.id} value={n.id}>{n.name}{n.kind === "local_committee" ? ` · ${findNeighbourhood(n.districtId ?? "")?.name ?? ""}` : ""}</option>)}
      </optgroup>)}
    </select>
    <p id={descriptionId} className={styles.mapDisclaimer} role="status">{chosen?.kind === "colloquial_group" ? "Uvriježeno područje: prikazan skup službenih gradskih četvrti, ne zasebna upravna granica." : chosen ? `${chosen.kind === "local_committee" ? "Mjesni odbor" : "Gradska četvrt"} · ${chosen.name}. Pojednostavljene službene granice.` : "Granica za ovo područje nije dostupna. Odaberi službenu četvrt ili mjesni odbor."}</p>
    <div className={styles.mapCredits}><a className={styles.attribution} href={geometry.provenance.dataset} target="_blank" rel="noreferrer">Granice: Grad Zagreb · OD</a><a className={styles.attribution} href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">Sava: © OpenStreetMap · ODbL</a></div>
  </div>;
}
