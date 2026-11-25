/*
 * A small PDF writer: one JPEG image per A4 page, with a line of text at the
 * foot of each page.
 *
 * From the home screen of an iPhone or iPad a web app has no print dialog
 * (window.print() does nothing), so there the app draws the printout into
 * images (html2canvas) and makes a PDF of them here, for the share sheet:
 * Print, Save to Files, Mail.
 *
 * Works as a plain <script> in the browser and with require() in Node.
 */
(function (root) {
  "use strict";

  var A4 = [595.28, 841.89]; // points
  var MM = 72 / 25.4;

  function ascii(s) {
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
    return out;
  }

  // A PDF text string in UTF-16BE (any language), as hex.
  function utf16Hex(s) {
    var hex = "FEFF";
    for (var i = 0; i < s.length; i++) hex += ("000" + s.charCodeAt(i).toString(16).toUpperCase()).slice(-4);
    return "<" + hex + ">";
  }

  // Text for the standard Helvetica font: plain ASCII, ( ) \ escaped.
  function latin(s) {
    return String(s).replace(/[^\x20-\x7e]/g, "?").replace(/([()\\])/g, "\\$1");
  }

  function num(x) {
    return (Math.round(x * 100) / 100).toString();
  }

  /*
   * pages: [{ jpeg: Uint8Array, width, height }] (pixels). Each image goes at
   * the top of an A4 page, inside the margins, scaled to the page width.
   * opts: { marginMm (12), title, footer: function (pageNumber, pageCount) -> text }
   * Returns the PDF as a Uint8Array.
   */
  function jpegPdf(pages, opts) {
    opts = opts || {};
    var margin = (opts.marginMm === undefined ? 12 : opts.marginMm) * MM;
    var boxW = A4[0] - 2 * margin;
    var parts = [];
    var length = 0;
    var offsets = [];

    function add(x) {
      var bytes = typeof x === "string" ? ascii(x) : x;
      parts.push(bytes);
      length += bytes.length;
    }
    function obj(n, body) {
      offsets[n] = length;
      add(n + " 0 obj\n");
      body.forEach(add);
      add("\nendobj\n");
    }

    // 1 catalog, 2 page tree, 3 font, 4 info, then per page: page, content, image.
    var count = pages.length;
    var kids = [];
    for (var k = 0; k < count; k++) kids.push(5 + 3 * k + " 0 R");

    add("%PDF-1.4\n");
    add(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // binary marker
    obj(1, ["<< /Type /Catalog /Pages 2 0 R >>"]);
    obj(2, ["<< /Type /Pages /Kids [" + kids.join(" ") + "] /Count " + count + " >>"]);
    obj(3, ["<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"]);
    obj(4, ["<< /Producer (LPPM Flight)" + (opts.title ? " /Title " + utf16Hex(opts.title) : "") + " >>"]);

    pages.forEach(function (p, i) {
      var n = 5 + 3 * i;
      var h = (boxW * p.height) / p.width;
      var y = A4[1] - margin - h;
      var foot = opts.footer ? latin(opts.footer(i + 1, count)) : "";
      var content = "q " + num(boxW) + " 0 0 " + num(h) + " " + num(margin) + " " + num(y) + " cm /Im0 Do Q\n" +
        (foot ? "BT /F1 7 Tf 0.35 g " + num(margin) + " " + num(margin / 2) + " Td (" + foot + ") Tj ET\n" : "");
      obj(n, ["<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + A4[0] + " " + A4[1] + "]" +
        " /Resources << /XObject << /Im0 " + (n + 2) + " 0 R >> /Font << /F1 3 0 R >> >>" +
        " /Contents " + (n + 1) + " 0 R >>"]);
      obj(n + 1, ["<< /Length " + content.length + " >>\nstream\n" + content + "endstream"]);
      obj(n + 2, ["<< /Type /XObject /Subtype /Image /Width " + p.width + " /Height " + p.height +
        " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + p.jpeg.length + " >>\nstream\n",
        p.jpeg, "\nendstream"]);
    });

    var size = 5 + 3 * count;
    var xref = length;
    var table = "xref\n0 " + size + "\n0000000000 65535 f \n";
    for (var j = 1; j < size; j++) table += ("000000000" + offsets[j]).slice(-10) + " 00000 n \n";
    add(table);
    add("trailer\n<< /Size " + size + " /Root 1 0 R /Info 4 0 R >>\nstartxref\n" + xref + "\n%%EOF\n");

    var out = new Uint8Array(length);
    var at = 0;
    parts.forEach(function (b) {
      out.set(b, at);
      at += b.length;
    });
    return out;
  }

  // "data:image/jpeg;base64,..." -> bytes
  function dataUrlBytes(url) {
    var bin = atob(url.slice(url.indexOf(",") + 1));
    return ascii(bin);
  }

  var api = { jpegPdf: jpegPdf, dataUrlBytes: dataUrlBytes, A4_POINTS: A4 };
  var MB = (root.MB = root.MB || {});
  MB.pdf = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
