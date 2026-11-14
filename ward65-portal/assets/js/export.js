/* =====================================================================
   Report export for the admin dashboard - no external libraries.
     W65.xlsx.build(sheets)      -> Blob (a real .xlsx workbook)
     W65.printReport(opts)       -> opens the browser print dialog with a clean
                                    report (choose "Save as PDF" there)
   ===================================================================== */
(function (root) {
  'use strict';
  var W65 = (root.W65 = root.W65 || {});

  /* ---------- tiny ZIP writer (store only) ---------- */
  var CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
    return t;
  })();
  function crc32(u8) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function utf8(s) { return new TextEncoder().encode(s); }

  function zip(entries, mime) {
    var parts = [], central = [], offset = 0;
    var DOS_TIME = 0, DOS_DATE = ((2024 - 1980) << 9) | (1 << 5) | 1;
    entries.forEach(function (e) {
      var name = utf8(e.name), data = e.data, crc = crc32(data), size = data.length;
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, DOS_TIME, true); lh.setUint16(12, DOS_DATE, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);

      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, DOS_TIME, true); ch.setUint16(14, DOS_DATE, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, size, true); ch.setUint32(24, size, true); ch.setUint16(28, name.length, true);
      ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true);
      ch.setUint32(38, 0, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + size;
    });
    var centralSize = central.reduce(function (n, p) { return n + p.length; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(4, 0, true); end.setUint16(6, 0, true);
    end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
    end.setUint32(12, centralSize, true); end.setUint32(16, offset, true); end.setUint16(20, 0, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: mime });
  }

  /* ---------- spreadsheet XML ---------- */
  var BAD_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
  function esc(s) {
    return String(s).replace(BAD_XML, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function colName(i) { var s = ''; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  function serial(d) { return (d.getTime() + 5.5 * 3600000) / 86400000 + 25569; }   // shown as Indian Standard Time

  // cell styles (see styles.xml below): 1 header, 2 wrapped text, 3 date-time, 4 number, 5 title
  function cell(ref, v, style) {
    if (v == null || v === '') return style ? '<c r="' + ref + '" s="' + style + '"/>' : '';
    if (v instanceof Date) return isNaN(v) ? '' : '<c r="' + ref + '" s="3"><v>' + serial(v) + '</v></c>';
    if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '" s="' + (style || 4) + '"><v>' + v + '</v></c>';
    return '<c r="' + ref + '" t="inlineStr" s="' + (style || 2) + '"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>';
  }

  function sheetXml(sh) {
    var cols = sh.columns, headerRow = sh.title ? 3 : 1, out = [];
    out.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">');
    out.push('<sheetViews><sheetView workbookViewId="0"' + (sh.title ? '' : ' tabSelected="1"') + '><pane ySplit="' + headerRow + '" topLeftCell="A' + (headerRow + 1) + '" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>');
    out.push('<sheetFormatPr defaultRowHeight="15"/>');
    out.push('<cols>' + cols.map(function (c, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (c.width || 16) + '" customWidth="1"/>'; }).join('') + '</cols>');
    out.push('<sheetData>');
    if (sh.title) out.push('<row r="1">' + cell('A1', sh.title, 5) + '</row>');
    out.push('<row r="' + headerRow + '" ht="24" customHeight="1">' + cols.map(function (c, i) { return cell(colName(i) + headerRow, c.header, 1); }).join('') + '</row>');
    sh.rows.forEach(function (r, ri) {
      var rn = headerRow + 1 + ri;
      out.push('<row r="' + rn + '">' + cols.map(function (c, i) { return cell(colName(i) + rn, r[i], 0); }).join('') + '</row>');
    });
    out.push('</sheetData>');
    out.push('<autoFilter ref="A' + headerRow + ':' + colName(cols.length - 1) + (headerRow + Math.max(sh.rows.length, 1)) + '"/>');
    out.push('<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToHeight="0"/>');
    out.push('</worksheet>');
    return out.join('');
  }

  var BORDER = '<border><left style="thin"><color rgb="FFD0D7E2"/></left><right style="thin"><color rgb="FFD0D7E2"/></right><top style="thin"><color rgb="FFD0D7E2"/></top><bottom style="thin"><color rgb="FFD0D7E2"/></bottom><diagonal/></border>';
  var STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="dd\\-mmm\\-yyyy\\ hh:mm"/></numFmts>' +
    '<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="14"/><color rgb="FF0B2A5B"/><name val="Calibri"/></font></fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0B2A5B"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' + BORDER + '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="6">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>' +
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  function safeSheetName(n, i) { return String(n || 'Sheet' + (i + 1)).replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31); }

  W65.xlsx = {
    /* sheets: [{ name, title?, columns:[{header, width}], rows:[[...]] }]  values: string | number | Date */
    build: function (sheets) {
      var e = [], n = sheets.length;
      e.push({ name: '[Content_Types].xml', data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        sheets.map(function (s, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>') });
      e.push({ name: '_rels/.rels', data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') });
      e.push({ name: 'xl/workbook.xml', data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        sheets.map(function (s, i) { return '<sheet name="' + esc(safeSheetName(s.name, i)) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') + '</sheets></workbook>') });
      e.push({ name: 'xl/_rels/workbook.xml.rels', data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets.map(function (s, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') +
        '<Relationship Id="rId' + (n + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>') });
      e.push({ name: 'xl/styles.xml', data: utf8(STYLES) });
      sheets.forEach(function (s, i) { e.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: utf8(sheetXml(s)) }); });
      return zip(e, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }
  };

  /* ---------- printable report (browser "Save as PDF") ---------- */
  function h(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* opts: { title, subtitle, lines:[string], columns:[{header, width?}], rows:[[string]] } */
  W65.reportHtml = function (o) {
    var css = '@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font:11px/1.4 "Noto Sans Kannada","Segoe UI",Arial,sans-serif;color:#0f1b33;margin:0}' +
      'header{border-bottom:3px solid #f28c1b;padding-bottom:8px;margin-bottom:10px}h1{font-size:18px;color:#0b2a5b;margin:0 0 2px}.sub{color:#566581}' +
      '.lines{margin:6px 0 10px;color:#33425e}table{width:100%;border-collapse:collapse;table-layout:fixed}th{background:#0b2a5b;color:#fff;text-align:left;padding:5px 6px;font-size:10px}' +
      'td{border:1px solid #d0d7e2;padding:4px 6px;vertical-align:top;word-wrap:break-word;overflow-wrap:anywhere}tr{page-break-inside:avoid}tbody tr:nth-child(even){background:#f5f8fc}thead{display:table-header-group}' +
      'footer{margin-top:10px;color:#566581;font-size:10px}';
    var w = o.columns.map(function (c) { return '<col style="width:' + (c.width || 10) + '%">'; }).join('');
    return '<!doctype html><html><head><meta charset="utf-8"><title>' + h(o.title) + '</title><style>' + css + '</style></head><body>' +
      '<header><h1>' + h(o.title) + '</h1><div class="sub">' + h(o.subtitle || '') + '</div></header>' +
      '<div class="lines">' + (o.lines || []).map(function (l) { return '<div>' + h(l) + '</div>'; }).join('') + '</div>' +
      '<table><colgroup>' + w + '</colgroup><thead><tr>' + o.columns.map(function (c) { return '<th>' + h(c.header) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      o.rows.map(function (r) { return '<tr>' + r.map(function (v) { return '<td>' + h(v) + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table><footer>' + h(o.footer || '') + '</footer></body></html>';
  };
  /* win (optional): a window the caller opened during the click, so phones and popup blockers allow it.
     The report is written into it and the print dialog opens there ("Save as PDF"). Without it, a hidden frame is used. */
  W65.printReport = function (o, win) {
    var html = W65.reportHtml(o);
    if (win && !win.closed) {
      try {
        win.document.open(); win.document.write(html); win.document.close();
        var shown = false;
        var show = function () { if (shown) return; shown = true; try { win.focus(); win.print(); } catch (e) { /* the report stays open to print manually */ } };
        win.onload = show; setTimeout(show, 700);
        return;
      } catch (e) { /* fall through to the hidden frame */ }
    }
    var fr = document.createElement('iframe');
    fr.setAttribute('aria-hidden', 'true'); fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(fr);
    var doc = fr.contentWindow.document; doc.open(); doc.write(html); doc.close();
    var done = false;
    function go() {
      if (done) return; done = true;
      try { fr.contentWindow.focus(); fr.contentWindow.print(); } finally { setTimeout(function () { fr.remove(); }, 60000); }
    }
    fr.onload = go; setTimeout(go, 600);
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = W65;
})(typeof window !== 'undefined' ? window : globalThis);
