import test from "node:test";
import assert from "node:assert/strict";
import { project, visibleTiles, easeInOut } from "./geo.ts";
import { NEIGHBOURHOODS, CITY_VIEW } from "./neighbourhoods.ts";

test("project: Zagreb centre lands in expected z12 tile", () => {
  const p = project(45.8131, 15.9775, 12);
  assert.equal(Math.floor(p.x / 256), 2229);
  assert.equal(Math.floor(p.y / 256), 1460);
});

test("visibleTiles: covers viewport and centre tile is present", () => {
  const tiles = visibleTiles(CITY_VIEW.lat, CITY_VIEW.lng, 12, 800, 500);
  assert.ok(tiles.length >= 4);
  assert.ok(tiles.some((t) => t.x === 2229 && t.y === 1460));
  for (const t of tiles) assert.ok(t.left < 800 && t.top < 500 && t.left + t.size > 0 && t.top + t.size > 0);
});

test("neighbourhoods: unique ids and all inside greater Zagreb", () => {
  assert.equal(new Set(NEIGHBOURHOODS.map((n) => n.id)).size, NEIGHBOURHOODS.length);
  for (const n of NEIGHBOURHOODS) {
    assert.ok(n.lat > 45.7 && n.lat < 45.9 && n.lng > 15.85 && n.lng < 16.2, n.id);
  }
});

test("easeInOut endpoints", () => {
  assert.equal(easeInOut(0), 0);
  assert.equal(easeInOut(1), 1);
});
