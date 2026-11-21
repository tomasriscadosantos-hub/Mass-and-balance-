/*
 * Aircraft and aerodrome data.
 *
 * Units follow the Cessna POH: pounds (lb), inches (in), moments in lb-in/1000.
 * Keep this file up to date: re-weighing, equipment changes, AIRAC cycles.
 *
 * Works as a plain <script> in the browser and with require() in Node.
 */
(function (root) {
  "use strict";
  var MB = (root.MB = root.MB || {});

  var AIRCRAFT = {
    "OK-HAD": {
      type: "Cessna 152",
      perf: "C152", // performance tables in poh.js
      // Weighing protocol F-T-016, work order 014/2023 (30 Mar 2023):
      // 1154.5 lb, C.G. arm 29.97 in, moment 34.58 - weighed defueled and
      // without oil. Oil and unusable fuel are added as in POH figure 6-1.
      weighed: { lb: 1154.5, moment: 34.58, source: "Weighing 014/2023, 30 Mar 2023" },
      addToWeighed: [
        { item: "Oil, 6 qt (no oil filter)", lb: 11.25, arm: -14.7 },
        { item: "Unusable fuel, 1.5 gal", lb: 9.0, arm: 40.0 },
      ],
      // empty: null = must be typed; otherwise what leaving it blank means
      stations: [
        { name: "Student", arm: 39.0, max: null, empty: null },
        { name: "Instructor", arm: 39.0, max: null, empty: "solo" },
        { name: "Baggage area 1", arm: 64.0, max: 120, empty: "none", baggage: true },
        { name: "Baggage area 2", arm: 84.0, max: 40, empty: "none", baggage: true },
      ],
      maxBaggage: 120, // baggage areas 1 + 2 together
      fuelArm: 42.0,
      usableFuelGal: 24.5, // standard tanks
      fuelFlowGph: 6.0, // planning figure, 6 gal/h = 36 lb/h
      cruiseKt: 90, // planning TAS, for the alternate leg
      taxiFuelLb: 5, // start, taxi and run-up
      maxRamp: 1675,
      maxTakeoff: 1670,
      maxLanding: 1670,
      // Normal category: forward 31.0 in at 1350 lb or less, straight line to
      // 32.65 in at 1670 lb; aft 36.5 in at all weights.
      cgForward: [[1350, 31.0], [1670, 32.65]],
      cgAft: 36.5,
      envelopeMinLb: 1000, // bottom of the POH envelope chart
    },
    "OK-KUN": {
      type: "Cessna 172P",
      perf: "C172P",
      // Weighing protocol F-T-016, 16 Feb 2024: 1473 lb, C.G. arm 40.27 in,
      // moment 59317 lb-in, as weighed. Oil and unusable fuel added as in
      // POH figure 6-1.
      weighed: { lb: 1473.0, moment: 59.317, source: "Weighing of 16 Feb 2024" },
      addToWeighed: [
        // kept between 5 and 7 qt; the heavier 7 qt is used
        { item: "Oil, 7 qt", lb: 13.125, arm: -14.0 },
        { item: "Unusable fuel, 3 gal (standard tanks)", lb: 18.0, arm: 46.0 },
      ],
      // Always flown with two: student and instructor (rear seats empty).
      stations: [
        { name: "Student", arm: 37.0, max: null, empty: null },
        { name: "Instructor", arm: 37.0, max: null, empty: null },
        { name: "Baggage area 1", arm: 95.0, max: 120, empty: "none", baggage: true },
        { name: "Baggage area 2", arm: 123.0, max: 50, empty: "none", baggage: true },
      ],
      maxBaggage: 120,
      fuelArm: 48.0,
      usableFuelGal: 40.0, // standard tanks
      fuelFlowGph: 9.0, // planning figure, 9 gal/h = 54 lb/h
      cruiseKt: 100,
      taxiFuelLb: 7, // POH: 1.1 gal for start, taxi and take-off
      maxRamp: 2407,
      maxTakeoff: 2400,
      maxLanding: 2400,
      // Normal category: forward 35.0 in at 1950 lb or less, straight line to
      // 39.5 in at 2400 lb; aft 47.3 in at all weights.
      cgForward: [[1950, 35.0], [2400, 39.5]],
      cgAft: 47.3,
      envelopeMinLb: 1500,
    },
  };

  /*
   * Aerodromes - copy from the Portuguese AIP (AD 2) or the VFR Manual (MVFR)
   * published by NAV Portugal, and check again every AIRAC cycle.
   *
   * Left empty on purpose until copied from the AIP: without an elevation the
   * performance can't be worked out there, and without declared distances the
   * runway lengths aren't checked.
   *
   * Runways, one entry per direction:
   *   rwy      designator, e.g. "29"
   *   bearing  runway direction in degrees from the AIP (magnetic; in southern
   *            Portugal within about 1-2 degrees of true). null = designator x 10
   *   tora, toda, asda, lda   declared distances in metres (AIP AD 2.13)
   *   surface  "paved" or "grass"
   */
  var DEPARTURE = "LPPM";
  var ALTERNATES = ["LPFR", "LPEV"];
  var AERODROMES = {
    LPPM: {
      name: "Portimão",
      nmFromDeparture: 0,
      elevationFt: null,
      source: null,
      runways: [],
    },
    LPFR: {
      name: "Faro",
      nmFromDeparture: 31, // straight line from LPPM
      elevationFt: null,
      source: null,
      runways: [],
    },
    LPEV: {
      name: "Évora",
      nmFromDeparture: 89,
      // AIP Portugal LPEV AD 2.24.01-1 aerodrome chart (12 AUG 2021, AIRAC
      // 003-21): ARP 38 31 47N 007 53 31W, elevation 246 m.
      elevationFt: 807,
      source: "AIP LPEV AD 2.24.01-1 (AIRAC 003-21)",
      runways: [
        // RWY 01/19: asphalt 1300 x 23 m, displaced threshold at both ends.
        // Declared distances: AIP AD 2.13 (not on the chart).
        { rwy: "01", bearing: 6, tora: null, toda: null, asda: null, lda: null, surface: "paved" },
        { rwy: "19", bearing: 186, tora: null, toda: null, asda: null, lda: null, surface: "paved" },
        // RWY 07/25 (sand, 530 x 30 m) left out: no POH data for sand.
      ],
    },
  };

  MB.data = {
    AIRCRAFT: AIRCRAFT,
    AERODROMES: AERODROMES,
    DEPARTURE: DEPARTURE,
    ALTERNATES: ALTERNATES,
    LB_PER_KG: 2.20462,
    LITRES_PER_GAL: 3.78541,
    FUEL_LB_PER_GAL: 6.0, // AVGAS, as used in the POH
    FINAL_RESERVE_MIN: 30, // VFR day final reserve; use 45 at night
  };

  if (typeof module !== "undefined" && module.exports) module.exports = MB.data;
})(typeof window !== "undefined" ? window : globalThis);
