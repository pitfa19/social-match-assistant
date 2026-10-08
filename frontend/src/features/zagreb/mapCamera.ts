export type Camera = { x: number; y: number; scale: number };
export type Bounds = readonly number[];
export const OVERVIEW: Camera = { x: 0, y: 0, scale: 1 };

export function fitBounds(bounds: Bounds[]): Camera {
  if (!bounds.length) return { ...OVERVIEW };
  const left = Math.min(...bounds.map(b => b[0]));
  const top = Math.min(...bounds.map(b => b[1]));
  const right = Math.max(...bounds.map(b => b[2]));
  const bottom = Math.max(...bounds.map(b => b[3]));
  const scale = Math.min(10, 940 / Math.max(1, right - left), 730 / Math.max(1, bottom - top));
  return { scale, x: 600 - (left + right) / 2 * scale, y: 490 - (top + bottom) / 2 * scale };
}

/** Exact critically damped spring solution. Retargeting preserves position AND velocity. */
export function springStep(value: number, velocity: number, target: number, dt: number): [number, number] {
  if (dt <= 0) return [value, velocity];
  const omega = 20;
  const offset = value - target;
  const coefficient = velocity + omega * offset;
  const decay = Math.exp(-omega * Math.min(.064, Math.max(0, dt)));
  const time = Math.min(.064, Math.max(0, dt));
  return [target + (offset + coefficient * time) * decay, (velocity - omega * coefficient * time) * decay];
}
