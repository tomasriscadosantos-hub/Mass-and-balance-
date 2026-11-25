// The small PDF writer (js/pdf.js) used for the printout on an iPhone or iPad
// home-screen app. Run with:  node --test "web/tests/*.test.js"
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const pdf = require("../js/pdf.js");

// A 1 x 1 white JPEG.
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwS" +
  "ExIQEw8QEBD/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64");

function text(bytes) {
  return Buffer.from(bytes).toString("latin1");
}

test("pdf: A4 pages with one JPEG each, a valid cross-reference table", () => {
  const page = { jpeg: new Uint8Array(JPEG), width: 1, height: 1 };
  const bytes = pdf.jpegPdf([page, page, page], {
    title: "LPPM Flight · OK-HAD · Portimão",
    footer: (n, count) => "page " + n + " of " + count + " (Portimão)",
  });
  const s = text(bytes);
  assert.ok(s.startsWith("%PDF-1.4\n"));
  assert.ok(s.endsWith("%%EOF\n"));
  assert.match(s, /\/Type \/Pages \/Kids \[5 0 R 8 0 R 11 0 R\] \/Count 3/);
  assert.equal((s.match(/\/MediaBox \[0 0 595\.28 841\.89\]/g) || []).length, 3);
  assert.equal((s.match(/\/Filter \/DCTDecode \/Length 160/g) || []).length, 3);
  // footer in plain ASCII for Helvetica; the title in UTF-16 keeps the ã
  assert.ok(s.includes("(page 2 of 3 \\(Portim?o\\)) Tj"), "footer with ( ) escaped and the ã replaced");
  assert.match(s, /\/Title <FEFF004C/);
  // every object is where the xref table says
  const startxref = Number(/startxref\n(\d+)\n%%EOF/.exec(s)[1]);
  assert.ok(s.slice(startxref).startsWith("xref\n0 14\n"));
  const rows = s.slice(startxref).split("\n").slice(3, 16);
  rows.forEach((row, i) => {
    const offset = Number(row.slice(0, 10));
    assert.equal(row.length, 19, "xref rows are 20 bytes with the newline");
    assert.ok(s.slice(offset).startsWith(i + 1 + " 0 obj\n"), "object " + (i + 1) + " at " + offset);
  });
  // the image bytes go in unchanged
  assert.ok(Buffer.from(bytes).includes(JPEG));
});

test("pdf: data URL to bytes", () => {
  globalThis.atob = globalThis.atob || ((b64) => Buffer.from(b64, "base64").toString("latin1"));
  const url = "data:image/jpeg;base64," + JPEG.toString("base64");
  assert.deepEqual(Buffer.from(pdf.dataUrlBytes(url)), JPEG);
});
