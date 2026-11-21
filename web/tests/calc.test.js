// Run with:  node --test web/tests
// Expected values come from the POH and from the Python version
// (mass_and_balance.py / performance.py), which was checked by hand.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

require("../js/data.js");
require("../js/poh.js");
const calc = require("../js/calc.js");
const D = globalThis.MB.data;
const KG = D.LB_PER_KG;

function near(actual, expected, tol, what) {
  assert.ok(Math.abs(actual - expected) <= tol,
    `${what}: got ${actual}, expected ${expected} (±${tol})`);
}

function run(reg, loads, fuelGal, tripH, altIcao) {
  const ac = D.AIRCRAFT[reg];
  const altH = D.AERODROMES[altIcao].nmFromDeparture / ac.cruiseKt;
  return calc.massBalance(ac, { loads, fuelGal, tripH, altH, altLabel: altIcao });
}

test("basic empty weight = as weighed + oil + unusable fuel", () => {
  const had = calc.basicEmpty(D.AIRCRAFT["OK-HAD"]);
  near(had.lb, 1174.75, 1e-9, "OK-HAD lb");
  near(had.moment, 34.774625, 1e-9, "OK-HAD moment");
  const kun = calc.basicEmpty(D.AIRCRAFT["OK-KUN"]);
  near(kun.lb, 1504.125, 1e-9, "OK-KUN lb");
  near(kun.moment, 59.96125, 1e-9, "OK-KUN moment");
});

test("OK-HAD dual, full fuel: same as the Python version", () => {
  const r = run("OK-HAD", [75 * KG, 85 * KG, 0, 0], 24.5, 1.0, "LPFR");
  const expected = { ZFM: [1527.4892, 31.772], TOM: [1669.4892, 32.642],
    LM: [1633.4892, 32.4358], ALT: [1621.0892, 32.3626] };
  for (const [name, [lb, cg]] of Object.entries(expected)) {
    near(r.byName[name].lb, lb, 1e-3, `${name} lb`);
    near(r.byName[name].cg, cg, 1e-3, `${name} cg`);
  }
  // 32.64 in at 1669.5 lb is just forward of the 32.65 in limit
  assert.ok(r.problems.includes("TOM: CG too far forward"));
  assert.ok(r.problems.includes("ZFM: CG too far forward"));
});

test("OK-KUN dual, full fuel: within limits", () => {
  const r = run("OK-KUN", [75 * KG, 85 * KG, 0, 5 * KG], 40, 1.0, "LPFR");
  const expected = { ZFM: [1867.8873, 39.8142], TOM: [2100.8873, 40.7221],
    LM: [2046.8873, 40.53], ALT: [2030.1473, 40.4685] };
  for (const [name, [lb, cg]] of Object.entries(expected)) {
    near(r.byName[name].lb, lb, 1e-3, `${name} lb`);
    near(r.byName[name].cg, cg, 1e-3, `${name} cg`);
  }
  assert.deepEqual(r.problems, []);
});

test("limits: max weight, baggage, fuel capacity, reserve", () => {
  const r = run("OK-HAD", [100 * KG, 100 * KG, 130, 0], 30, 3, "LPEV");
  assert.ok(r.problems.some((p) => p.startsWith("TOM: over max")));
  assert.ok(r.problems.includes("Baggage area 1: 130 lb is over its 120 lb limit"));
  assert.ok(r.problems.includes("Baggage: 130 lb in total is over the 120 lb limit"));
  assert.ok(r.problems.includes("Fuel: 30.0 gal is more than the 24.5 gal usable capacity"));
  const dry = run("OK-HAD", [75 * KG, 0, 0, 0], 5, 1, "LPEV");
  assert.ok(dry.problems.includes("Fuel: not enough fuel for the trip and the alternate"));
});

test("POH tables: exact values and interpolation", () => {
  assert.deepEqual(calc.takeoff("C152", 1670, 0, 20).roll, 755);
  assert.deepEqual(calc.landing("C152", 1670, 8000, 40).total, 1555);
  assert.deepEqual(calc.takeoff("C172P", 2200, 5000, 30).total, 2465);
  const t = calc.takeoff("C172P", 2350, 1500, 28);
  near(t.roll, 1076.0, 1e-9, "interpolated roll");
  near(t.total, 1979.25, 1e-9, "interpolated total");
  assert.deepEqual(t.speeds, [51, 56]);
  assert.equal(calc.takeoff("C172P", 2400, 8000, 35).roll, null); // "---" in the POH
  assert.equal(calc.takeoff("C152", 1670, 0, 45).roll, null); // hotter than 40 C
  const cold = calc.takeoff("C152", 1670, -300, -5); // below S.L. and 0 C
  assert.deepEqual([cold.roll, cold.total], [640, 1190]);
});

test("POH sample problem (172P section 5): next higher values", () => {
  calc.settings.nextHigher = true;
  try {
    const t = calc.takeoff("C172P", 2350, 1500, 28);
    assert.deepEqual([t.roll, t.total], [1200, 2220]);
    const [roll, total] = calc.corrected(t.roll, t.total, 12, false, 0.15);
    // The POH rounds 12/9 x 10 % to 13 % and gets 1044 / 1931.
    near(roll, 1040, 0.5, "roll with 12 kt headwind");
    near(total, 1924, 0.5, "total with 12 kt headwind");
  } finally {
    calc.settings.nextHigher = false;
  }
});

test("climb, pressure and density altitude", () => {
  assert.deepEqual(calc.climb("C152", -125, 24), [67, 686]);
  const c = calc.climb("C172P", 118, 31);
  assert.equal(c[0], 76);
  near(c[1], 645.96725, 1e-6, "172P rate of climb");
  assert.equal(calc.pressureAltitude(807, 1015), 753); // school sheet, LPEV
  near(calc.densityAltitude(753, 30), 2733.72, 1e-6, "density altitude");
});

test("runway check: the school sheet's LPEV landing example", () => {
  const ac = D.AIRCRAFT["OK-HAD"];
  const site = {
    icao: "LPEV", elevationFt: 807,
    rwy: { rwy: "01", bearing: 10, tora: 1260, toda: 1260, asda: 1260, lda: 1245, surface: "paved" },
    weather: { qnh: 1015, oat: 30, dir: 310, kt: 8 },
  };
  const ldg = calc.runwayCheck(ac, "landing", site, 1495);
  near(ldg.run, 150.0129, 1e-3, "ground roll m"); // sheet: 150 m
  near(ldg.dist, 367.7335, 1e-3, "50 ft distance m"); // sheet: 374 m
  assert.deepEqual(ldg.lines.map((l) => l.ok), [true, true]);
  const to = calc.runwayCheck(ac, "take-off", site, 1567);
  assert.deepEqual(to.lines.map((l) => l.label), ["Ground roll", "50 ft clearance", "50 ft ×1.25"]);
  assert.deepEqual(to.problems, []);
});

test("runway check: grass, tailwind, crosswind and missing distances", () => {
  const ac = D.AIRCRAFT["OK-KUN"];
  const [roll, total] = calc.corrected(1000, 2000, -4, true, 0.15);
  assert.deepEqual([roll, total], [1380, 2580]);
  const site = {
    icao: "TEST", elevationFt: 0,
    rwy: { rwy: "09", bearing: null, tora: 300, toda: 300, asda: 300, lda: 300, surface: "grass" },
    weather: { qnh: 1013, oat: 20, dir: 270, kt: 12 },
  };
  const r = calc.runwayCheck(ac, "take-off", site, 2400);
  assert.ok(r.warnings[0].startsWith("tailwind 12 kt"));
  assert.ok(r.lines.every((l) => l.ok === false));
  const xw = calc.runwayCheck(ac, "landing",
    { ...site, weather: { qnh: 1013, oat: 20, dir: 180, kt: 18 } }, 2300);
  assert.ok(xw.warnings.some((w) => w.startsWith("crosswind 18 kt")));
  const unknown = calc.runwayCheck(ac, "landing",
    { ...site, rwy: { ...site.rwy, lda: null } }, 2300);
  assert.equal(unknown.unchecked, true);
  assert.deepEqual(unknown.lines.map((l) => l.ok), [null, null]);
});

test("obstacle clearance, capped by the altitude limit", () => {
  const ac = D.AIRCRAFT["OK-KUN"];
  const site = { icao: "TEST", elevationFt: 10, weather: { qnh: 1009, oat: 31, dir: 0, kt: 0 } };
  const r = calc.climbCheck(ac, site, { nm: 3, elevationFt: 400, limitFt: 1000, gs: 60 });
  assert.equal(r.obstacle.crossAt, 1000);
  assert.equal(r.obstacle.clearance, 600);
  const low = calc.climbCheck(D.AIRCRAFT["OK-HAD"], { ...site, weather: { qnh: 1018, oat: 24, dir: 0, kt: 0 } },
    { nm: 1, elevationFt: 659, limitFt: 1000, gs: 67 });
  assert.equal(low.obstacle.ok, false);
});
