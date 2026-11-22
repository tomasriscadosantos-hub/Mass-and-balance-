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
      maxSoloHours: 3, // OM A: longest uninterrupted student solo flight
    },
    "OK-KUN": {
      type: "Cessna 172P",
      perf: "C172P",
      // Weighing protocol F-T-016, 16 Feb 2024: 1473 lb, C.G. arm 40.27 in,
      // moment 59317 lb-in, as weighed. Oil and unusable fuel added as in
      // POH figure 6-1.
      weighed: { lb: 1473.0, moment: 59.317, source: "Weighing of 16 Feb 2024" },
      addToWeighed: [
        // OM C 3.2.1: the basic empty mass includes full oil, 8 qt in the 172P
        { item: "Oil, 8 qt (full)", lb: 15.0, arm: -14.0 },
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
      maxSoloHours: 3.5,
    },
  };

  /*
   * Aerodromes - copy from the Portuguese AIP (AD 2) or the VFR Manual (MVFR)
   * published by NAV Portugal, and check again every AIRAC cycle.
   *
   * A new aerodrome can be added with nulls until its data is copied: without
   * an elevation the performance can't be worked out there, and without
   * declared distances the runway lengths aren't checked.
   *
   * Runways, one entry per direction:
   *   rwy      designator, e.g. "29"
   *   bearing  runway direction in degrees, true (in southern Portugal magnetic
   *            is within about 1-2 degrees of it). null = designator x 10
   *   toraEnd  where the take-off run ends (a threshold or runway end from AD 2.12),
   *            the reference for the obstacles ahead
   *   tora, toda, asda, lda   declared distances in metres (AIP AD 2.13)
   *   surface  "paved" or "grass"
   *
   * Obstacles (AIP AD 2.10), elevations in ft (converted from m where the
   * AIP gives metres), either
   *   pos: [lat, lon]                  where the AIP gives the position, or
   *   ahead: { rwy, m, cross }         m metres beyond the end of that runway's
   *                                    take-off run (rwy can be a list), cross
   *                                    metres right (+) or left (-), 0 if not given
   * elevFt null: elevation not published (listed, not checked).
   *
   * arp: aerodrome reference point as in the AIP, used for the distance to the
   * alternate and the sunrise/sunset times.
   */
  var DEPARTURE = "LPPM";
  // OM A: LPPM has a single runway; Faro (LPFR) is the briefed alternate.
  var ALTERNATES = ["LPFR", "LPEV"];
  var AERODROMES = {
    LPPM: {
      name: "Portimão",
      // NAV Portugal VFR Manual AD 2-LPPM (20-MAR-2025): ARP 37 08 58N
      // 008 35 02W, elevation 1 m (5 ft), MAG VAR 1 W.
      arp: ["37 08 58N", "008 35 02W"],
      elevationFt: 5,
      source: "VFR Manual AD 2-LPPM (20-MAR-2025)",
      // IPMA automatic weather station at the aerodrome (wind in kt, every 10 min).
      ipma: { station: 878, page: "https://ema.ipma.pt/afis/portimao-aerodromo/" },
      runways: [
        // RWY 11/29: 860 x 27 m asphalt, PCN 37/F/C/W/T; THR 29 displaced 90 m
        // (AD 2.12, 2.13). The true bearing is published as NOT AVBL: worked
        // out from the threshold coordinates (370901.89N 0083518.68W and
        // 370854.47N 0083449.09W, 764 m apart).
        { rwy: "11", bearing: 107.5, toraEnd: ["37 08 54.47N", "008 34 49.09W"], tora: 770, toda: 770, asda: 860, lda: 860, surface: "paved" },
        { rwy: "29", bearing: 287.5, toraEnd: ["37 09 01.89N", "008 35 18.68W"], tora: 860, toda: 860, asda: 860, lda: 770, surface: "paved" },
      ],
      obstacleSource: "VFR Manual AD 2-LPPM AD 2.10 (20-MAR-2025): positions not published, distances taken from THR 29",
      // AD 2.10: all in the RWY 29 approach, so under the RWY 11 climb-out,
      // without positions. Their distances are taken from THR 29, the end of
      // RWY 11's take-off run: up to 90 m closer than from the runway end, so
      // on the safe side. Assumed on the extended centre line.
      obstacles: [
        { what: "Fence", elevFt: 7, ahead: { rwy: "11", m: 27 } }, // 2 m
        { what: "Embankment", elevFt: 11, ahead: { rwy: "11", m: 100 } }, // 3.3 m
        { what: "Buildings", elevFt: 102, ahead: { rwy: "11", m: 390 } }, // 31 m
        { what: "Natural high point", elevFt: 164, ahead: { rwy: "11", m: 700 } }, // 50 m
        { what: "Water reservoir (Bemposta)", elevFt: null, ahead: { rwy: "11", m: 1310 } },
      ],
    },
    // Faro: AIP Portugal LPFR AD 2.2, 2.12, 2.13 (AIRAC 008-26, 26-NOV-2026).
    LPFR: {
      name: "Faro",
      arp: ["37 00 52N", "007 57 57W"],
      elevationFt: 24, // 7 m
      source: "AIP LPFR AD 2 (AIRAC 008-26)",
      runways: [
        // RWY 10/28: 2490 x 45 m asphalt, THR displaced 45 m at both ends,
        // CWY 155 m.
        { rwy: "10", bearing: 100.07, toraEnd: ["37 00 48.15N", "007 57 30.66W"], tora: 2490, toda: 2645, asda: 2490, lda: 2445, surface: "paved" },
        { rwy: "28", bearing: 280.07, toraEnd: ["37 01 02.27N", "007 59 10.11W"], tora: 2490, toda: 2645, asda: 2490, lda: 2445, surface: "paved" },
      ],
      obstacleSource: "AIP Type A obstacle chart LPFR AD 2.24.04-1 (AIRAC 002-24): distances read from the chart, about ±50 m",
      // AD 2.10 refers to the Type A obstacle chart (AD 2.24.04-1, AIRAC
      // 002-24); distances read from its scale, about +/- 50 m.
      obstacles: [
        { what: "Mast or antenna", elevFt: 28, ahead: { rwy: "10", m: 210 } }, // 8.5 m
        { what: "Building", elevFt: 95, ahead: { rwy: "10", m: 2180, cross: -200 } }, // 29 m
        { what: "Mast or antenna", elevFt: 138, ahead: { rwy: "10", m: 2430, cross: -340 } }, // 42 m
        { what: "Mast or antenna", elevFt: 33, ahead: { rwy: "28", m: 160 } }, // 10 m
      ],
    },
    // Évora: AIP Portugal LPEV AD 2.2, 2.12, 2.13 (AIRAC 008-26, 26-NOV-2026).
    LPEV: {
      name: "Évora",
      arp: ["38 31 47N", "007 53 31W"],
      elevationFt: 807, // 246 m
      source: "AIP LPEV AD 2 (AIRAC 008-26)",
      ipma: { station: 843, page: "https://ema.ipma.pt/afis/evora-aerodromo/" },
      runways: [
        // RWY 01/19: 1300 x 23 m asphalt, THR 01 displaced 54 m, THR 19 40 m.
        { rwy: "01", bearing: 4.25, toraEnd: ["38 32 20.38N", "007 53 21.04W"], tora: 1260, toda: 1300, asda: 1300, lda: 1245, surface: "paved" },
        { rwy: "19", bearing: 184.25, toraEnd: ["38 31 41.39N", "007 53 24.73W"], tora: 1245, toda: 1300, asda: 1300, lda: 1260, surface: "paved" },
        // RWY 07/25 (sand, 530 x 30 m) left out: no POH data for sand.
      ],
      obstacleSource: "AIP LPEV AD 2.10 (AIRAC 008-26)",
      obstacles: [
        { what: "Tower (10 m high)", elevFt: 837, pos: ["38 31 46.6N", "007 53 29.8W"] }, // 255 m
      ],
    },
    // Beja: on the OM C training routes (LPPM-LPBJ-LPEV-LPPM, LPPM-LPBJ-LPFR-LPPM).
    // AIP Portugal LPBJ AD 2.2, 2.12, 2.13 (AIRAC 006/007-26, 06-AUG-2026).
    LPBJ: {
      name: "Beja",
      arp: ["38 04 44N", "007 55 57W"],
      elevationFt: 636, // 194 m
      source: "AIP LPBJ AD 2 (AIRAC 007-26)",
      runways: [
        // RWY 01L/19R: 3450 x 60 m concrete, slippery when wet. Full-length
        // declared distances (the AIP also gives intersection departures).
        // RWY 01R/19L: taxiing only, left out.
        { rwy: "01L", bearing: 5.93, toraEnd: ["38 05 39.70N", "007 55 49.30W"], tora: 3450, toda: 3815, asda: 3450, lda: 3450, surface: "paved" },
        { rwy: "19R", bearing: 185.93, toraEnd: ["38 03 48.41N", "007 56 03.93W"], tora: 3450, toda: 4040, asda: 3450, lda: 3450, surface: "paved" },
      ],
      obstacleSource: "AIP LPBJ AD 2.10 (AIRAC 008-26)",
      obstacles: [
        { what: "Natural high point", elevFt: 712, pos: ["38 00 01.0N", "007 56 12.1W"] }, // LPBJ 01
        { what: "Tower", elevFt: 735, pos: ["38 04 37.6N", "007 54 47.6W"] }, // LPBJ 02
        { what: "Natural high point", elevFt: 634, pos: ["38 06 47.3N", "007 55 47.3W"] }, // LPBJ 03
        { what: "Natural high point", elevFt: 703, pos: ["38 06 51.7N", "007 56 13.0W"] }, // LPBJ 04
        { what: "Antenna (wind sensor)", elevFt: 663, pos: ["38 03 52N", "007 55 58W"] }, // LPBJ 05
        { what: "Antenna (wind sensor)", elevFt: 647, pos: ["38 04 41N", "007 55 53W"] }, // LPBJ 06
        { what: "Antenna (wind sensor)", elevFt: 653, pos: ["38 04 45N", "007 56 03W"] }, // LPBJ 07
        { what: "Mast", elevFt: 639, pos: ["38 03 48N", "007 56 13W"] }, // LPBJ 08
        { what: "Silo", elevFt: 1005, pos: ["38 01 55N", "007 52 15W"] }, // LPBJ 09
        { what: "Antenna", elevFt: 1122, pos: ["38 00 41N", "007 51 57W"] }, // LPBJ 10
        { what: "Antenna (wind sensor)", elevFt: 630, pos: ["38 05 35N", "007 55 44W"] }, // LPBJ 11
      ],
    },
    // Ponte de Sor: cross-country destination. AIP Portugal LPSO AD 2.2, 2.12,
    // 2.13 (AIRAC 007-26, 01-OCT-2026).
    LPSO: {
      name: "Ponte de Sor",
      arp: ["39 12 42N", "008 03 28W"],
      elevationFt: 390, // 119 m
      source: "AIP LPSO AD 2 (AIRAC 007-26)",
      ipma: { station: 817, page: "https://ema.ipma.pt/afis/ponte-de-sor-aerodromo/" },
      runways: [
        // RWY 03/21: 1800 x 30 m asphalt. The true bearing is published as
        // NIL: worked out from the threshold coordinates (391215.60N
        // 0080342.92W and 391308.87N 0080312.29W, 1801 m apart).
        { rwy: "03", bearing: 24, toraEnd: ["39 13 08.87N", "008 03 12.29W"], tora: 1800, toda: 1800, asda: 1800, lda: 1800, surface: "paved" },
        { rwy: "21", bearing: 204, toraEnd: ["39 12 15.60N", "008 03 42.92W"], tora: 1800, toda: 1800, asda: 1800, lda: 1800, surface: "paved" },
      ],
      obstacleSource: "AIP LPSO AD 2.10 (AIRAC 007-26)",
      obstacles: [
        { what: "Antenna (glide path)", elevFt: 440, pos: ["39 12 57.8N", "008 03 13.6W"] }, // 134 m
        { what: "Antenna", elevFt: 906, pos: ["39 18 34.2N", "007 59 32.2W"] }, // 276 m
        { what: "Antenna", elevFt: 787, pos: ["39 17 30.5N", "008 00 18.9W"] }, // 240 m
        { what: "Antenna", elevFt: 564, pos: ["39 15 22.2N", "008 02 12.5W"] }, // 172 m
        { what: "Tree", elevFt: 453, pos: ["39 13 31.7N", "008 02 59.4W"] }, // 138 m
        { what: "Tree", elevFt: 591, pos: ["39 13 54.6N", "008 03 43.9W"] }, // 180 m
        // Position not published, only "DIST 650 M": checked on the extended
        // centre line in both directions.
        { what: "Power lines", elevFt: 440, ahead: { rwy: ["03", "21"], m: 650 } }, // 134 m
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
    FINAL_RESERVE_MIN: 45, // OM C 2.1.3: final reserve, VFR day
    APPROACH_MIN: 10, // OM C 2.1.2-2.1.3: approach and landing, VFR, added to trip and alternate fuel
    // Live weather relay (worker/, on Cloudflare). Empty: the app uses only the
    // copy published with it (weather.json).
    WEATHER_RELAY: "",
  };

  if (typeof module !== "undefined" && module.exports) module.exports = MB.data;
})(typeof window !== "undefined" ? window : globalThis);
