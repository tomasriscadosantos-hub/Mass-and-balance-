// Downloads the latest METARs and TAFs for the app's aerodromes from
// aviationweather.gov and writes them to the file named on the command line.
//
// The deploy workflow runs this and publishes the file with the app as
// weather.json. The app reads it from its own site because the weather service
// doesn't let web pages on other sites read its data directly.
//
//   node .github/scripts/fetch-weather.js _site/weather.json
"use strict";
const fs = require("fs");
const path = require("path");
const data = require(path.join(__dirname, "../../web/js/data.js"));

const ids = Object.keys(data.AERODROMES).join(",");
const BASE = "https://aviationweather.gov/api/data/";

async function get(kind, extra) {
  const res = await fetch(`${BASE}${kind}?ids=${ids}&format=json${extra}`, {
    headers: { "User-Agent": "mass-and-balance-web-app" },
  });
  if (!res.ok && res.status !== 204) throw new Error(`${kind}: HTTP ${res.status}`);
  const text = await res.text();
  return text.trim() ? JSON.parse(text) : [];
}

(async () => {
  const out = { fetched: new Date().toISOString(), source: "aviationweather.gov", metars: [], tafs: [], error: null };
  try {
    const newest = {};
    for (const m of await get("metar", "&hours=3")) {
      if (!newest[m.icaoId] || m.obsTime > newest[m.icaoId].obsTime) newest[m.icaoId] = m;
    }
    out.metars = Object.values(newest).map((m) => ({ icao: m.icaoId, time: m.reportTime, raw: m.rawOb }));
    out.tafs = (await get("taf", "")).map((t) => ({ icao: t.icaoId, issued: t.issueTime, raw: t.rawTAF }));
  } catch (e) {
    out.error = String((e && e.message) || e);
  }
  fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
  console.log(`METARs: ${out.metars.map((m) => m.icao).join(" ") || "none"}; ` +
    `TAFs: ${out.tafs.map((t) => t.icao).join(" ") || "none"}` + (out.error ? `; error: ${out.error}` : ""));
})();
