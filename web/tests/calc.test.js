// Run with:  node --test "web/tests/*.test.js"
// Expected values come from the POHs, the Flying Academy Operations Manual and
// the Python version (mass_and_balance.py / performance.py), checked by hand.
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

// Local flight from LPPM back to LPPM, alternate measured from LPPM.
function run(reg, loads, fuelGal, tripH, altIcao, solo = false) {
  const ac = D.AIRCRAFT[reg];
  const altH = calc.distanceNm(D.AERODROMES.LPPM, D.AERODROMES[altIcao]) / ac.cruiseKt;
  return calc.massBalance(ac, { loads, fuelGal, tripH, altH, altLabel: altIcao, solo });
}

test("distances between aerodromes", () => {
  const A = D.AERODROMES;
  near(calc.distanceNm(A.LPPM, A.LPFR), 30.7, 0.05, "LPPM-LPFR");
  near(calc.distanceNm(A.LPPM, A.LPEV), 89.1, 0.05, "LPPM-LPEV");
  near(calc.distanceNm(A.LPPM, A.LPBJ), 63.8, 0.05, "LPPM-LPBJ");
  near(calc.distanceNm(A.LPEV, A.LPEV), 0, 1e-9, "same place");
});

// Mass and CG after burning `lb` of fuel at the fuel arm.
function burn(c, lb, fuelArm) {
  const mass = c.lb - lb;
  const moment = c.moment - (lb * fuelArm) / 1000;
  return { lb: mass, cg: (moment * 1000) / mass };
}

test("basic empty weight = as weighed + oil + unusable fuel", () => {
  const had = calc.basicEmpty(D.AIRCRAFT["OK-HAD"]);
  near(had.lb, 1174.75, 1e-9, "OK-HAD lb");
  near(had.moment, 34.774625, 1e-9, "OK-HAD moment");
  const kun = calc.basicEmpty(D.AIRCRAFT["OK-KUN"]);
  near(kun.lb, 1506.0, 1e-9, "OK-KUN lb"); // 8 qt oil (OM: full oil)
  near(kun.moment, 59.935, 1e-9, "OK-KUN moment");
});

test("OK-HAD dual, full fuel: ZFM/TOM as the Python version, OM fuel allowances", () => {
  const ac = D.AIRCRAFT["OK-HAD"];
  const r = run("OK-HAD", [75 * KG, 85 * KG, 0, 0], 24.5, 1.0, "LPFR");
  near(r.byName.ZFM.lb, 1527.4892, 1e-3, "ZFM lb");
  near(r.byName.ZFM.cg, 31.772, 1e-3, "ZFM cg");
  near(r.byName.TOM.lb, 1669.4892, 1e-3, "TOM lb");
  near(r.byName.TOM.cg, 32.642, 1e-3, "TOM cg");
  // trip 1:00 + 10 min approach at 36 lb/h = 42 lb
  const lm = burn(r.byName.TOM, 42, ac.fuelArm);
  near(r.byName.LM.lb, lm.lb, 1e-9, "LM lb");
  near(r.byName.LM.cg, lm.cg, 1e-9, "LM cg");
  // alternate LPFR at 90 kt + 10 min at 36 lb/h
  const altLb = (calc.distanceNm(D.AERODROMES.LPPM, D.AERODROMES.LPFR) / 90 + 10 / 60) * 36;
  near(r.byName.ALT.lb, lm.lb - altLb, 1e-9, "ALT lb");
  // required = taxi 5 + trip 42 + alternate + 45 min reserve (27 lb)
  near(r.fuel.requiredGal, (5 + 42 + altLb + 27) / 6, 1e-9, "required fuel");
  // 32.64 in at 1669.5 lb is just forward of the 32.65 in limit
  assert.ok(r.problems.includes("TOM: CG too far forward"));
  assert.ok(r.problems.includes("ZFM: CG too far forward"));
});

test("OK-KUN dual, full fuel: within limits", () => {
  const r = run("OK-KUN", [75 * KG, 85 * KG, 0, 5 * KG], 40, 1.0, "LPFR");
  near(r.byName.ZFM.lb, 1869.7623, 1e-3, "ZFM lb");
  near(r.byName.ZFM.cg, 39.7602, 1e-3, "ZFM cg");
  near(r.byName.TOM.lb, 2102.7623, 1e-3, "TOM lb");
  near(r.byName.TOM.cg, 40.6733, 1e-3, "TOM cg");
  assert.deepEqual(r.problems, []);
});

test("limits: max weight, baggage, fuel capacity, required fuel", () => {
  const r = run("OK-HAD", [100 * KG, 100 * KG, 130, 0], 30, 3, "LPEV");
  assert.ok(r.problems.some((p) => p.startsWith("TOM: over max")));
  assert.ok(r.problems.includes("Baggage area 1: 130 lb is over its 120 lb limit"));
  assert.ok(r.problems.includes("Baggage: 130 lb in total is over the 120 lb limit"));
  assert.ok(r.problems.includes("Fuel: 30.0 gal is more than the 24.5 gal usable capacity"));
  // 12 gal: taxi 0.83 + trip 7 + alternate (59 + 10 min) 6.93 + reserve 4.5 = 19.3 gal
  const short = run("OK-HAD", [75 * KG, 0, 0, 0], 12, 1, "LPEV");
  assert.ok(short.problems.some((p) => p.startsWith("Fuel: 12.0 gal on board, 19.3 gal required")));
});

test("student solo: maximum flight time (OM A)", () => {
  const ok = run("OK-HAD", [70 * KG, 0, 0, 0], 24.5, 2.5, "LPFR", true);
  assert.ok(!ok.problems.some((p) => p.startsWith("Solo")));
  const long = run("OK-HAD", [70 * KG, 0, 0, 0], 24.5, 2.9, "LPFR", true);
  assert.ok(long.problems.some((p) => p.startsWith("Solo: 3:04 planned is over the 3:00 maximum")));
});

test("POH tables: exact values and interpolation", () => {
  assert.equal(calc.takeoff("C152", 1670, 0, 20).roll, 755);
  assert.equal(calc.landing("C152", 1670, 8000, 40).total, 1555);
  assert.equal(calc.takeoff("C172P", 2200, 5000, 30).total, 2465);
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
  assert.equal(calc.pressureAltitude(807, 1015), 753); // previous sheet, LPEV
  near(calc.densityAltitude(753, 30), 2733.72, 1e-6, "density altitude");
});

const LPEV_TEST = {
  icao: "LPEV", elevationFt: 807,
  rwy: { rwy: "01", bearing: 10, tora: 1260, toda: 1260, asda: 1260, lda: 1245, surface: "paved" },
  weather: { qnh: 1015, oat: 30, dir: 310, kt: 8, gust: null },
};

test("aerodrome data: elevation, declared distances, bearings that fit the runway numbers", () => {
  for (const [icao, ad] of Object.entries(D.AERODROMES)) {
    assert.ok(Number.isFinite(ad.elevationFt), icao + " elevation");
    assert.ok(ad.source, icao + " source");
    assert.ok(ad.runways.length >= 2, icao + " runways");
    for (const r of ad.runways) {
      const where = icao + " RWY " + r.rwy;
      for (const k of ["tora", "toda", "asda", "lda"]) assert.ok(r[k] > 0, where + " " + k);
      assert.ok(r.toda >= r.tora && r.asda >= r.tora, where + " TODA/ASDA at least TORA");
      const off = Math.abs(((r.bearing - parseInt(r.rwy, 10) * 10 + 540) % 360) - 180);
      assert.ok(off <= 10, where + " bearing " + r.bearing + " vs runway number");
      assert.equal(r.surface, "paved", where + " surface");
    }
  }
});

test("LPPM (VFR Manual AD 2-LPPM): RWY 11 TORA 770, RWY 29 LDA 770, checked", () => {
  const ad = D.AERODROMES.LPPM;
  const [r11, r29] = ad.runways;
  assert.deepEqual([r11.tora, r11.lda, r29.tora, r29.lda], [770, 860, 860, 770]);
  const site = (rwy) => ({ icao: "LPPM", elevationFt: ad.elevationFt, rwy,
    weather: { qnh: 1013, oat: 15, dir: null, kt: 0, gust: null } });
  const ac = D.AIRCRAFT["OK-KUN"];
  const to = calc.runwayCheck(ac, "take-off", site(r11), 2400, { rules: "om" });
  assert.deepEqual(to.lines.map((l) => [l.name, l.available, l.ok]), [["TORA", 770, true]]);
  const ldg = calc.runwayCheck(ac, "landing", site(r29), 2400, { rules: "om" });
  assert.deepEqual(ldg.lines.map((l) => [l.name, l.available, l.ok]), [["LDA", 770, true]]);
  assert.deepEqual([to.problems, ldg.problems, to.notes, ldg.notes], [[], [], [], []]);
  // headwind on RWY 29 (287.5 true) from a westerly wind
  const w = calc.windComponents(r29.bearing, 270, 10);
  assert.ok(w[0] > 9.5 && Math.abs(w[1]) < 3.1);
});

test("OM rules: x1.5 at maximum take-off / landing mass", () => {
  const ac = D.AIRCRAFT["OK-KUN"];
  const to = calc.runwayCheck(ac, "take-off", LPEV_TEST, 2100, { rules: "om" });
  assert.equal(to.mass, 2400); // worked out at MTOM, not at 2100 lb
  assert.equal(to.massNote, "MTOM");
  assert.deepEqual(to.lines.map((l) => [l.label, l.name]), [["50 ft ×1.5", "TORA"]]);
  near(to.lines[0].need, to.dist * 1.5, 1e-9, "factored distance");
  const ldg = calc.runwayCheck(ac, "landing", LPEV_TEST, 2000, { rules: "om" });
  assert.equal(ldg.mass, 2400);
  assert.deepEqual(ldg.lines.map((l) => [l.label, l.name]), [["50 ft ×1.5", "LDA"]]);
  assert.deepEqual(ldg.problems, []);
});

test("OM rules, student solo: TORA 600 m, x1.67, crosswind limit with gusts", () => {
  const ac = D.AIRCRAFT["OK-HAD"];
  const short = { ...LPEV_TEST, rwy: { ...LPEV_TEST.rwy, tora: 550, lda: 800 } };
  const to = calc.runwayCheck(ac, "take-off", short, 1400, { rules: "om", solo: true });
  assert.deepEqual(to.lines.map((l) => l.label), ["50 ft ×1.5", "Solo: minimum TORA"]);
  assert.equal(to.lines[1].ok, false);
  const ldg = calc.runwayCheck(ac, "landing", short, 1400, { rules: "om", solo: true });
  assert.deepEqual(ldg.lines.map((l) => l.label), ["50 ft ×1.5", "Solo: 50 ft ×1.67"]);
  // wind 310/08: 7 kt crosswind on RWY 01 is above the 6 kt solo limit (50 % of 12)
  assert.ok(ldg.warnings.some((w) => w === "crosswind 7 kt is above the student's 6 kt solo limit"));
  // the instructor can raise the limit; gusts count
  const raised = calc.runwayCheck(ac, "landing", short, 1400, { rules: "om", solo: true, xwindLimitKt: 9 });
  assert.equal(raised.warnings.length, 0);
  const gusty = { ...short, weather: { ...short.weather, gust: 13 } };
  const g = calc.runwayCheck(ac, "landing", gusty, 1400, { rules: "om", solo: true, xwindLimitKt: 9 });
  assert.ok(g.warnings.some((w) => w.startsWith("crosswind 11 kt in the gusts")));
  // dual flight: only the 12 kt maximum demonstrated applies (13 kt gust at 60° = 11.3 kt)
  const dual = calc.runwayCheck(ac, "landing", gusty, 1400, { rules: "om" });
  assert.equal(dual.warnings.length, 0);
  const strong = { ...short, weather: { ...short.weather, gust: 14 } }; // 12.1 kt
  assert.equal(calc.runwayCheck(ac, "landing", strong, 1400, { rules: "om" }).warnings.length, 1);
});

test("class B rules: the previous sheet's LPEV landing example", () => {
  const ac = D.AIRCRAFT["OK-HAD"];
  const ldg = calc.runwayCheck(ac, "landing", LPEV_TEST, 1495, { rules: "classb" });
  near(ldg.run, 150.0129, 1e-3, "ground roll m"); // sheet: 150 m
  near(ldg.dist, 367.7335, 1e-3, "50 ft distance m"); // sheet: 374 m
  assert.deepEqual(ldg.lines.map((l) => l.ok), [true, true]);
  const to = calc.runwayCheck(ac, "take-off", LPEV_TEST, 1567, { rules: "classb" });
  assert.deepEqual(to.lines.map((l) => l.label), ["Ground roll", "50 ft clearance", "50 ft ×1.25"]);
  assert.deepEqual(to.problems, []);
});

test("grass, tailwind, crosswind and missing distances", () => {
  const ac = D.AIRCRAFT["OK-KUN"];
  const [roll, total] = calc.corrected(1000, 2000, -4, true, 0.15);
  assert.deepEqual([roll, total], [1380, 2580]);
  const site = {
    icao: "TEST", elevationFt: 0,
    rwy: { rwy: "09", bearing: null, tora: 300, toda: 300, asda: 300, lda: 300, surface: "grass" },
    weather: { qnh: 1013, oat: 20, dir: 270, kt: 12, gust: null },
  };
  const r = calc.runwayCheck(ac, "take-off", site, 2400);
  assert.ok(r.warnings[0].startsWith("tailwind 12 kt"));
  assert.ok(r.lines.every((l) => l.ok === false));
  const xw = calc.runwayCheck(ac, "landing",
    { ...site, weather: { qnh: 1013, oat: 20, dir: 180, kt: 18, gust: null } }, 2300);
  assert.ok(xw.warnings.some((w) => w.startsWith("crosswind 18 kt")));
  const unknown = calc.runwayCheck(ac, "landing", { ...site, rwy: { ...site.rwy, lda: null } }, 2300);
  assert.equal(unknown.unchecked, true);
  assert.deepEqual(unknown.lines.map((l) => l.ok), [null]);
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

test("solo weather minima (OM C 5)", () => {
  assert.equal(calc.minimaCheck(false, 6, 1600).ok, true); // local: 5 km, 1500 ft
  assert.deepEqual(calc.minimaCheck(false, 4, 3000).problems,
    ["visibility 4 km is below the 5 km solo minimum"]);
  assert.equal(calc.minimaCheck(true, 6, 1800).problems.length, 2); // cross-country: 8 km, 2000 ft
  assert.equal(calc.minimaCheck(true, 10, Infinity).ok, true); // CAVOK
});

test("contaminated runway: x1.92 for a solo landing, note for everyone", () => {
  const ac = D.AERODROMES && D.AIRCRAFT["OK-HAD"];
  const site = { ...LPEV_TEST, contaminated: true };
  const solo = calc.runwayCheck(ac, "landing", site, 1400, { rules: "om", solo: true });
  assert.deepEqual(solo.lines.map((l) => l.label), ["50 ft ×1.5", "Solo: 50 ft ×1.92"]);
  near(solo.lines[1].need, solo.dist * 1.92, 1e-9, "x1.92");
  assert.equal(solo.notes.length, 1);
  const dual = calc.runwayCheck(ac, "landing", site, 1400, { rules: "om" });
  assert.equal(dual.lines.length, 1);
  assert.equal(dual.notes.length, 1);
});

test("sunset and the 30 min rule for cross-country flights (OM A)", () => {
  // Lisbon: about 20:05 UTC on 21 June and 17:18 UTC on 21 December
  const lisbon = { arp: ["38 43 00N", "009 08 00W"] };
  near(calc.sunsetUtcMin("2026-06-21", lisbon), 20 * 60 + 5, 4, "Lisbon midsummer");
  near(calc.sunsetUtcMin("2026-12-21", lisbon), 17 * 60 + 18, 4, "Lisbon midwinter");
  const A = D.AERODROMES;
  const xc = calc.daylight({ date: "2026-11-21", takeoffMin: 15 * 60, tripH: 1, altH: 0.9,
    dest: A.LPEV, alt: A.LPFR, crossCountry: true });
  near(xc.latestLanding, xc.sunset - 30, 1e-9, "latest landing");
  assert.equal(xc.landing, 15 * 60 + 70); // 1:00 + 10 min approach
  assert.equal(xc.latestTakeoff, xc.latestLanding - 70);
  assert.equal(xc.ok, xc.landing <= xc.latestLanding);
  near(xc.altLanding, xc.landing + 0.9 * 60 + 10, 1e-9, "landing at the alternate");
  const local = calc.daylight({ date: "2026-11-21", takeoffMin: null, tripH: 1, altH: 0.3,
    dest: A.LPPM, alt: A.LPFR, crossCountry: false });
  assert.equal(local.margin, 0);
  assert.equal(local.landing, undefined);
});

test("sun times match NAV Portugal's LPPM sunrise/sunset tables 2026 (within 2 min)", () => {
  // date: [civil twilight from, sunrise, sunset, civil twilight to], UTC
  const nav = {
    "2026-01-01": ["07:19", "07:48", "17:28", "17:57"],
    "2026-03-30": ["05:57", "06:23", "18:55", "19:21"],
    "2026-06-22": ["04:44", "05:15", "19:58", "20:29"],
    "2026-09-22": ["05:56", "06:22", "18:32", "18:57"],
    "2026-11-21": ["06:51", "07:19", "17:21", "17:49"],
    "2026-12-03": ["07:02", "07:31", "17:17", "17:46"],
  };
  const min = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  for (const [date, times] of Object.entries(nav)) {
    const s = calc.sunTimes(date, D.AERODROMES.LPPM);
    [s.twilightStart, s.sunrise, s.sunset, s.twilightEnd].forEach((got, i) =>
      near(got, min(times[i]), 2, `${date} event ${i}`));
  }
});

test("daylight: take-off before sunrise is flagged", () => {
  const A = D.AERODROMES;
  const d = calc.daylight({ date: "2026-11-21", takeoffMin: 6 * 60 + 30, tripH: 1, altH: 0.3,
    departure: A.LPPM, dest: A.LPPM, alt: A.LPFR, crossCountry: false });
  assert.equal(d.beforeSunrise, true);
  near(d.nightFrom, 17 * 60 + 49, 2, "night from (end of civil twilight)");
});

test("no runway data: zero wind, nothing checked, no wind warnings", () => {
  const ac = D.AIRCRAFT["OK-HAD"];
  const site = { icao: "LPPM", elevationFt: 5, rwy: null,
    weather: { qnh: 1013, oat: 20, dir: 270, kt: 25, gust: 35 } };
  const r = calc.runwayCheck(ac, "take-off", site, 1600, { rules: "om", solo: true });
  assert.equal(r.noRunway, true);
  assert.equal(r.head, 0);
  assert.equal(r.unchecked, true);
  assert.deepEqual(r.warnings, []);
  near(r.dist, calc.takeoff("C152", 1670, 5, 20).total * 0.3048, 1e-9, "zero-wind distance");
});

test("METAR reader", () => {
  const faro = calc.parseMetar("METAR LPFR 211600Z 20007KT 9999 SCT015 BKN020 20/17 Q1017");
  assert.equal(faro.icao, "LPFR");
  assert.deepEqual([faro.day, faro.hour, faro.minute], [21, 16, 0]);
  assert.deepEqual(faro.wind, { dir: 200, kt: 7, gust: null, variable: false });
  assert.equal(faro.visKm, 10);
  assert.equal(faro.ceilFt, 2000); // SCT015 is not a ceiling, BKN020 is
  assert.deepEqual([faro.tempC, faro.dewC, faro.qnh], [20, 17, 1017]);

  const gusty = calc.parseMetar("LPBJ 211630Z 27015G25KT 240V300 4000 -RA BKN008 OVC015 12/11 Q1009 TEMPO 2000 BKN004");
  assert.deepEqual(gusty.wind, { dir: 270, kt: 15, gust: 25, variable: false });
  assert.equal(gusty.visKm, 4);
  assert.equal(gusty.ceilFt, 800); // trend after TEMPO is ignored

  const cavok = calc.parseMetar("METAR LPFR 210630Z VRB03KT CAVOK M01/M03 Q1030 NOSIG");
  assert.equal(cavok.wind.variable, true);
  assert.equal(cavok.wind.dir, null);
  assert.equal(cavok.cavok, true);
  assert.equal(cavok.visKm, 10);
  assert.equal(cavok.ceilFt, Infinity);
  assert.deepEqual([cavok.tempC, cavok.dewC], [-1, -3]);

  const fog = calc.parseMetar("METAR LPBJ 210700Z 00000KT 0800 FG VV002 05/05 Q1025");
  assert.deepEqual([fog.wind.kt, fog.visKm, fog.ceilFt], [0, 0.8, 200]);
  const mps = calc.parseMetar("METAR XXXX 211600Z 18010MPS 9999 NSC 15/10 A2992");
  assert.deepEqual([mps.wind.kt, mps.ceilFt, mps.qnh], [19, Infinity, 1013]);
});
