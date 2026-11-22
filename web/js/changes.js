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
