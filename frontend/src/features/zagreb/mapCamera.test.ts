import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fitBounds, OVERVIEW, springStep } from "./mapCamera.ts";

const geometry = JSON.parse(readFileSync(new URL("./data/regions.json", import.meta.url), "utf8"));
const catalogue = JSON.parse(readFileSync(new URL("../../../../shared/zagreb-neighbourhoods.json", import.meta.url), "utf8"));
test("every official catalogue code has exactly one real polygon", () => {
  assert.equal(geometry.regions.length, 235);
  assert.equal(new Set(geometry.regions.map((r: { id: string }) => r.id)).size, 235);
  for (const entry of catalogue.entries) {
    if (entry.kind === "colloquial_group") {
      for (const id of entry.memberIds) assert.ok(geometry.regions.some((r: { id: string }) => r.id === id));
    } else {
      const region = geometry.regions.find((r: { id: string }) => r.id === entry.id);
      assert.equal(region?.officialCode, entry.officialCode);
      assert.match(region.path, /^M/);
      assert.ok(region.bounds.every(Number.isFinite));
      assert.ok(region.bounds[2] > region.bounds[0] && region.bounds[3] > region.bounds[1]);
    }
  }
});
test("unknown geometry returns overview instead of inventing a boundary", () => assert.deepEqual(fitBounds([]), OVERVIEW));
test("fit frames both constituent regions and caps tiny regions", () => {
  const c = fitBounds([[100, 100, 200, 200], [500, 400, 600, 500]]);
  assert.ok(c.scale > 1 && c.scale < 3);
  assert.equal(fitBounds([[1, 1, 2, 2]]).scale, 10);
});
test("critical spring settles without overshoot from rest", () => {
  let x = 0, v = 0;
  for (let i = 0; i < 90; i++) { [x,v] = springStep(x,v,100,1/60); assert.ok(x <= 100.000001); }
  assert.ok(Math.abs(x - 100) < .001);
});
test("retarget keeps current position and velocity, then reaches new target", () => {
  let x = 0, v = 0;
  for (let i = 0; i < 6; i++) [x,v] = springStep(x,v,100,1/60);
  assert.deepEqual(springStep(x,v,-50,0),[x,v]);
  for (let i = 0; i < 90; i++) [x,v] = springStep(x,v,-50,1/60);
  assert.ok(Math.abs(x + 50) < .001);
});
test("sources are pinned, attributed and river is sourced", () => {
  assert.equal(geometry.provenance.license,"Otvorena dozvola (OD)");
  assert.equal(geometry.provenance.sources.length,3);
  for (const source of geometry.provenance.sources) assert.match(source.sha256,/^[a-f0-9]{64}$/);
  assert.match(geometry.riverPath,/^M/);
  assert.ok(geometry.riverPath.length > 100);
});
