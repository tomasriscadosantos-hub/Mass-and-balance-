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
