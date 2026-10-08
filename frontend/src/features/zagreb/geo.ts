// Web-Mercator helpers for a tiny dependency-free slippy map.
export const TILE = 256;

export function worldSize(zoom: number): number {
  return TILE * Math.pow(2, zoom);
}

export function project(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const size = worldSize(zoom);
  const sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * size,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size,
  };
}

export type TileSpec = { key: string; z: number; x: number; y: number; left: number; top: number; size: number };

/** Tiles covering a w x h viewport centred on lat/lng at fractional zoom. */
export function visibleTiles(lat: number, lng: number, zoom: number, w: number, h: number): TileSpec[] {
  const z = Math.min(18, Math.max(1, Math.round(zoom)));
  const scale = Math.pow(2, zoom - z);
  const c = project(lat, lng, z);
  const size = TILE * scale;
  const n = Math.pow(2, z);
  const minX = Math.floor((c.x - w / 2 / scale) / TILE);
  const maxX = Math.floor((c.x + w / 2 / scale) / TILE);
  const minY = Math.max(0, Math.floor((c.y - h / 2 / scale) / TILE));
  const maxY = Math.min(n - 1, Math.floor((c.y + h / 2 / scale) / TILE));
  const out: TileSpec[] = [];
  for (let ty = minY; ty <= maxY; ty++) {
    for (let tx = minX; tx <= maxX; tx++) {
      const wrapped = ((tx % n) + n) % n;
      out.push({
        key: `${z}/${tx}/${ty}`,
        z,
        x: wrapped,
        y: ty,
        left: (tx * TILE - c.x) * scale + w / 2,
        top: (ty * TILE - c.y) * scale + h / 2,
        size,
      });
    }
  }
  return out;
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
