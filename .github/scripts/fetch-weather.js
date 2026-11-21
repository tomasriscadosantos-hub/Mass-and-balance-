// Downloads the latest weather for the app's aerodromes and writes it to the
// file named on the command line:
//   - METARs and TAFs from aviationweather.gov
//   - IPMA's automatic aerodrome stations (ema.ipma.pt) where the aerodrome
//     has one (LPPM, LPEV), which publish no METAR
//
// The deploy workflow runs this and publishes the file with the app as
// weather.json. The app reads it from its own site because these services
// don't let web pages on other sites read their data directly.
//
//   node .github/scripts/fetch-weather.js _site/weather.json
"use strict";
const fs = require("fs");
const path = require("path");
const data = require(path.join(__dirname, "../../web/js/data.js"));
const calc = require(path.join(__dirname, "../../web/js/calc.js"));

const ids = Object.keys(data.AERODROMES).join(",");
const AWC = "https://aviationweather.gov/api/data/";
const HEADERS = { "User-Agent": "mass-and-balance-web-app" };

// Each attempt (answer and body) may take at most 20 s, so a service that
// hangs leaves its part out instead of holding up the deploy.
async function get(url) {
  const signal = AbortSignal.timeout(20000);
  const res = await fetch(url, { headers: HEADERS, signal });
  return { status: res.status, ok: res.ok, text: await res.text() };
}

// One retry after a short pause: the services sometimes answer 5xx or time out.
async function getRetry(url) {
  try {
    const res = await get(url);
    if (res.status < 500) return res;
  } catch (e) {
    // retried below
  }
  await new Promise((r) => setTimeout(r, 4000));
  return get(url);
}

async function awc(kind, extra) {
  const res = await getRetry(`${AWC}${kind}?ids=${ids}&format=json${extra}`);
  if (!res.ok && res.status !== 204) throw new Error(`${kind}: HTTP ${res.status}`);
  return res.text.trim() ? JSON.parse(res.text) : [];
}

async function ipma(icao, station) {
  const res = await getRetry(`https://ema.ipma.pt/wp-content/data/data${station}.csv`);
  if (!res.ok) throw new Error(`IPMA ${station}: HTTP ${res.status}`);
  const latest = calc.parseIpmaCsv(res.text);
  return latest && Object.assign({ icao }, latest);
}

(async () => {
  const out = { fetched: new Date().toISOString(), metars: [], tafs: [], stations: [], errors: [] };
  const note = (e) => out.errors.push(String((e && e.message) || e));
  try {
    const newest = {};
    for (const m of await awc("metar", "&hours=3")) {
      if (!newest[m.icaoId] || m.obsTime > newest[m.icaoId].obsTime) newest[m.icaoId] = m;
    }
    out.metars = Object.values(newest).map((m) => ({ icao: m.icaoId, time: m.reportTime, raw: m.rawOb }));
  } catch (e) {
    note(e);
  }
  try {
    out.tafs = (await awc("taf", "")).map((t) => ({ icao: t.icaoId, issued: t.issueTime, raw: t.rawTAF }));
  } catch (e) {
    note(e);
  }
  for (const [icao, ad] of Object.entries(data.AERODROMES)) {
    if (!ad.ipma) continue;
    try {
      const s = await ipma(icao, ad.ipma.station);
      if (s) out.stations.push(s);
    } catch (e) {
      note(e);
    }
  }
  fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
  console.log(`METARs: ${out.metars.map((m) => m.icao).join(" ") || "none"}; ` +
    `TAFs: ${out.tafs.map((t) => t.icao).join(" ") || "none"}; ` +
    `IPMA: ${out.stations.map((s) => `${s.icao} ${s.time}`).join(", ") || "none"}` +
    (out.errors.length ? `; errors: ${out.errors.join(" | ")}` : ""));
})();
