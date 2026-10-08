"use client";

import { useEffect, useRef, useState } from "react";
import { CITY_VIEW } from "./neighbourhoods";
import { easeInOut, visibleTiles } from "./geo";
import styles from "./Zagreb.module.css";

export type MapTarget = { lat: number; lng: number; zoom: number };

type View = MapTarget;

/** Minimal slippy map on public OpenStreetMap tiles, animated by rAF. */
export function ZagrebMap({ target, selectedId }: { target: MapTarget | null; selectedId: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>(CITY_VIEW);
  const viewRef = useRef<View>(CITY_VIEW);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const goal = target ?? CITY_VIEW;
    const from = { ...viewRef.current };
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduce ? 0 : 2200;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = duration === 0 ? 1 : Math.min(1, (now - t0) / duration);
      const e = easeInOut(t);
      const next = {
        lat: from.lat + (goal.lat - from.lat) * e,
        lng: from.lng + (goal.lng - from.lng) * e,
        zoom: from.zoom + (goal.zoom - from.zoom) * e,
      };
      viewRef.current = next;
      setView(next);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  const tiles = size.w ? visibleTiles(view.lat, view.lng, view.zoom, size.w, size.h) : [];

  return (
    <div ref={box} className={styles.map} data-testid="zagreb-map" data-zoom={view.zoom.toFixed(2)} data-lat={view.lat.toFixed(4)} data-lng={view.lng.toFixed(4)} data-selected={selectedId} role="img" aria-label="Karta Zagreba">
      {tiles.map((t) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={t.key}
          className={styles.tile}
          src={`https://tile.openstreetmap.org/${t.z}/${t.x}/${t.y}.png`}
          alt=""
          draggable={false}
          referrerPolicy="strict-origin-when-cross-origin"
          style={{ left: t.left, top: t.top, width: t.size + 0.5, height: t.size + 0.5 }}
        />
      ))}
      <a className={styles.attribution} href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
        © OpenStreetMap contributors
      </a>
    </div>
  );
}
