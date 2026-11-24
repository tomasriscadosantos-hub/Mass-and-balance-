/*
 * What's new: one entry per update of the app, newest first.
 *
 * After an update the app shows, once, the entries this phone hasn't seen
 * yet; "What's new" at the bottom of the page shows them all again. When you
 * publish a change the pilots should know about, add an entry at the top with
 * the next id, and bump VERSION in sw.js.
 */
(function (root) {
  "use strict";

  var CHANGES = [
    {
      id: 10,
      date: "2026-11-24",
      items: [
        {
          title: "Departure briefing",
          text: "Every take-off now ends with the briefing in the SOP's order: runway, TORA and the distance " +
            "you need, obstacles, wind and crosswind, which way to hold the ailerons, Vr, Vy/Vx, climb speed " +
            "and the engine-failure speed. You add the turn after departure and the initial altitude.",
        },
        {
          title: "Short-field figures",
          text: "The take-off distances are the POH's short-field figures (flaps 10°). The app now says so: a " +
            "normal take-off (172 SOP: flaps 0°, rotate 55 KIAS) needs more runway.",
        },
      ],
    },
    {
      id: 9,
      date: "2026-11-24",
      items: [
        {
          title: "Fuel past what the tanks hold",
          text: "When a route needs more fuel than the tanks hold (24.5 gal in the 152, 40 in the 172), it's " +
            "now a limit that says so, with what to change: a nearer alternate or a refuelling stop.",
        },
        {
          title: "Left column scrolls on its own",
          text: "On an iPad, the inputs scroll separately from the results.",
        },
      ],
    },
    {
      id: 8,
      date: "2026-11-24",
      items: [
        {
          title: "Stops on the way",
          text: "Plan a cross-country with landings, e.g. Évora then Ponte de Sor and back. Each stop has its " +
            "flight time, time on the ground, alternate, and whether you refuel there.",
        },
        {
          title: "Fuel leg by leg",
          text: "Every take-off is checked with the fuel carried from the last refuelling, and the app tells " +
            "you the least to load: e.g. at Évora, enough to get to Ponte de Sor and back.",
        },
        {
          title: "Where there's AVGAS",
          text: "Portimão, Évora and Cascais. Faro and Beja have JET A1 only, Ponte de Sor no fuel.",
        },
      ],
    },
    {
      id: 7,
      date: "2026-11-22",
      items: [
        {
          title: "Cascais (LPCS)",
          text: "New destination, with its runway, obstacles and METAR/TAF from the AIP. Its runway " +
            "slopes about 0.9 %: the app notes it where the POH distances will be longer.",
        },
      ],
    },
    {
      id: 6,
      date: "2026-11-22",
      items: [
        {
          title: "Obstacles from the AIP",
          text: "Every take-off now checks the obstacles the AIP lists in its path: your altitude over each " +
            "one and the clearance. Landings list the obstacles under the approach.",
        },
        {
          title: "Your own obstacle",
          text: "Still there for a crane from a NOTAM, now measured from the end of the runway. The " +
            "ground speed comes from the wind.",
        },
      ],
    },
    {
      id: 5,
      date: "2026-11-22",
      items: [
        {
          title: "Every runway checked",
          text: "Faro, Évora, Beja and Ponte de Sor now have their runway lengths from the AIP, so " +
            "take-off and landing are checked against them at every aerodrome.",
        },
      ],
    },
    {
      id: 4,
      date: "2026-11-22",
      items: [
        {
          title: "Portimão runway lengths",
          text: "From the VFR Manual: RWY 11 TORA 770 m, LDA 860 m; RWY 29 TORA 860 m, LDA 770 m " +
            "(displaced threshold). Take-off and landing at LPPM are now checked against them.",
        },
        {
          title: "Ponte de Sor (LPSO)",
          text: "New destination, with its IPMA station's live wind. Its runway lengths aren't in the " +
            "app yet, so those checks wait for the AIP.",
        },
        {
          title: "Station sensor gaps",
          text: "When an IPMA station misses a reading, the app now uses its last complete one.",
        },
      ],
    },
    {
      id: 3,
      date: "2026-11-21",
      items: [
        {
          title: "How old is the weather?",
          text: "The weather panel shows when the app last downloaded it. Refresh says whether anything " +
            "newer has arrived, and opening the app fetches the latest by itself.",
        },
      ],
    },
    {
      id: 2,
      date: "2026-11-21",
      items: [
        {
          title: "New name: LPPM Flight",
          text: "The icon on your home screen keeps its old name until you add the app again from Safari.",
        },
        {
          title: "Updates arrive by themselves",
          text: "When there's a new version, the app loads it as soon as you open it. Your inputs stay.",
        },
      ],
    },
    {
      id: 1,
      date: "2026-11-21",
      items: [
        {
          title: "Live wind at Portimão and Évora",
          text: "The weather panel shows the IPMA station at the aerodrome: wind, max wind, QNH and " +
            "temperature. Fill puts them into the performance.",
        },
        {
          title: "METARs and TAFs",
          text: "Faro and Beja reports with their age, updated every 15 minutes. For Portimão and Évora the " +
            "nearest one gives visibility and ceiling.",
        },
        {
          title: "NOTAMs in IPPC",
          text: "One tap copies your route's ICAO codes and opens IPPC, ready to paste.",
        },
        {
          title: "Portimão runway 11/29, paved",
          text: "The runway checks now know LPPM's runway and surface. Declared distances still to come.",
        },
        {
          title: "This note",
          text: "It appears once after each update. Open it again from the bottom of the page.",
        },
      ],
    },
  ];

  var MB = (root.MB = root.MB || {});
  MB.changes = CHANGES;
  if (typeof module !== "undefined" && module.exports) module.exports = CHANGES;
})(typeof window !== "undefined" ? window : globalThis);
