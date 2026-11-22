// Builds the app's weather: METARs and TAFs from aviationweather.gov, and the
// latest readings of IPMA's automatic aerodrome stations (ema.ipma.pt), which
// publish no METAR. Neither service lets web pages on other sites read it, so
// this runs elsewhere and hands the app one JSON file:
//   - live, on request, in the Cloudflare Worker (worker/index.mjs)
//   - every deploy, in the GitHub workflow (.github/scripts/fetch-weather.js)
//
// { fetched, metars: [{icao, time, raw}], tafs: [{icao, issued, raw}],
//   stations: [{icao, station, time, qnh, tempC, dewC, dir, kt, maxDir, maxKt, runways}],
//   errors: [] }

const AWC = "https://aviationweather.gov/api/data/";
const IPMA = "https://ema.ipma.pt/wp-content/data/data";
const HEADERS = { "User-Agent": "lppm-flight-weather" };

// Each attempt (answer and body) may take at most `ms`, so a service that
// hangs leaves its part out instead of holding everything up.
async function get(url, ms) {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(ms) });
  return { status: res.status, ok: res.ok, text: await res.text() };
}

// One retry after a short pause when a service answers 5xx for a moment.
// A timeout is not retried: it has already taken long enough.
async function getRetry(url, ms) {
  const res = await get(url, ms);
  if (res.status < 500) return res;
  await new Promise((r) => setTimeout(r, 2000));
  return get(url, ms);
}

async function awc(kind, ids, extra, ms) {
  const res = await getRetry(`${AWC}${kind}?ids=${ids.join(",")}&format=json${extra}`, ms);
  if (!res.ok && res.status !== 204) throw new Error(`${kind}: HTTP ${res.status}`);
  return res.text.trim() ? JSON.parse(res.text) : [];
}

/*
 * Reads an IPMA automatic aerodrome station file (dataNNN.csv: 10-minute
 * rows, times in UTC, wind in kt at aerodrome stations) and returns the latest
 * row that has a wind: { station, time, qnh, tempC, dewC, dir, kt, maxDir,
 * maxKt, runways }. null if there is no usable row.
 */
export function parseIpmaCsv(text) {
  const lines = String(text).trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  const head = lines[0].split(",");
  let latest = null;
  for (const line of lines.slice(1)) {
    const cells = line.split(",");
    const row = {};
    head.forEach((h, k) => {
      row[h] = cells[k];
    });
    const num = (key) => {
      const v = row[key];
      return v === undefined || v === "" || isNaN(Number(v)) ? null : Number(v);
    };
    if (num("dd") === null || num("ff") === null || !row.data) continue;
    const rec = {
      station: row.estacao,
      time: row.data.replace(" ", "T") + "Z",
      qnh: num("qnh"),
      tempC: num("tar"),
      dewC: num("tdew"),
      dir: num("dd"),
      kt: num("ff"),
      maxDir: num("ddx"),
      maxKt: num("ffx"),
      runways: [row.rwy1, row.rwy2].filter(Boolean).map((r) => String(r).padStart(2, "0")),
    };
    if (!latest || rec.time > latest.time) latest = rec;
  }
  return latest;
}

async function ipma(icao, station, ms) {
  const res = await getRetry(`${IPMA}${station}.csv`, ms);
  if (!res.ok) throw new Error(`IPMA ${station}: HTTP ${res.status}`);
  const latest = parseIpmaCsv(res.text);
  return latest && { icao, ...latest };
}

/*
 * icaos: aerodromes for METARs and TAFs; stations: [{ icao, station }] for IPMA.
 * Everything is fetched at once; a part that fails is left out and named in
 * errors.
 */
export async function buildWeather({ icaos, stations, timeoutMs = 15000 }) {
  const out = { fetched: new Date().toISOString(), metars: [], tafs: [], stations: [], errors: [] };
  const note = (e) => out.errors.push(String((e && e.message) || e));
  const jobs = [
    awc("metar", icaos, "&hours=3", timeoutMs).then((list) => {
      const newest = {};
      for (const m of list) {
        if (!newest[m.icaoId] || m.obsTime > newest[m.icaoId].obsTime) newest[m.icaoId] = m;
      }
      out.metars = Object.values(newest).map((m) => ({ icao: m.icaoId, time: m.reportTime, raw: m.rawOb }));
    }, note),
    awc("taf", icaos, "", timeoutMs).then((list) => {
      out.tafs = list.map((t) => ({ icao: t.icaoId, issued: t.issueTime, raw: t.rawTAF }));
    }, note),
    ...stations.map((s) => ipma(s.icao, s.station, timeoutMs).catch((e) => {
      note(e);
      return null;
    })),
  ];
  const results = await Promise.all(jobs);
  out.stations = results.slice(2).filter(Boolean);
  return out;
}
