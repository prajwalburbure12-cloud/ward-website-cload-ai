/* ADMIN - dashboard, complaint list, complaint detail, Excel / PDF reports */
(function () {
  'use strict';
  var W65 = window.W65, h = W65.h, $ = W65.$, A = W65.admin;
  var PAGE = 25, EXPORT_MAX = 5000;
  var DEPTS = ['Water Supply', 'Drainage / UGD', 'Solid Waste Management', 'Roads & Engineering', 'Street Lighting / Electrical', 'Health & Sanitation', 'Town Planning / Encroachment'];
  var F = { q: '', area: '', category: '', status: '', from: '', to: '', page: 0 };

  function clean(s) { return String(s || '').replace(/[^\p{L}\p{M}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim(); }
  function td(label) { return h('td', { 'data-label': label }, Array.prototype.slice.call(arguments, 1)); }
  function fileCount(r) { return (r.complaint_media && r.complaint_media[0] && r.complaint_media[0].count) || 0; }
  function dt(iso) { return W65.fmtDateTime(iso); }

  /* Search / filter (all values are cleaned before they go into the query) */
  function applyFilters(q) {
    var s = clean(F.q), a = clean(F.area);
    if (s) q = q.or('code.ilike.%' + s + '%,name.ilike.%' + s + '%,mobile.ilike.%' + s + '%,area.ilike.%' + s + '%');
    if (a) q = q.ilike('area', '%' + a + '%');
    if (F.category) q = q.eq('category', F.category);
    if (F.status) q = q.eq('status', F.status);
    if (/^\d{4}-\d{2}-\d{2}$/.test(F.from)) q = q.gte('created_at', F.from + 'T00:00:00+05:30');
    if (/^\d{4}-\d{2}-\d{2}$/.test(F.to)) q = q.lte('created_at', F.to + 'T23:59:59.999+05:30');
    return q;
  }
  function filterText() {
    var out = [];
    if (F.q) out.push('search “' + F.q + '”'); if (F.area) out.push('area “' + F.area + '”');
    if (F.category) out.push('category: ' + W65.catLabel(F.category)); if (F.status) out.push('status: ' + W65.statusLabel(F.status));
    if (F.from) out.push('from ' + F.from); if (F.to) out.push('to ' + F.to);
    return out.length ? out.join(', ') : 'none (all complaints)';
  }

  function complaintTable(rows, onOpen) {
    var body = h('tbody');
    rows.forEach(function (r) {
      var open = function () { onOpen(r.id); };
      body.appendChild(h('tr', { tabindex: '0', onclick: open, onkeydown: function (e) { if (e.key === 'Enter') open(); } },
        td('Complaint ID', h('code', { text: r.code })),
        td('Registered', h('div', { text: W65.fmtDate(r.created_at) }), h('div', { class: 'cell-sub', text: new Date(r.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) })),
        td('Resident', h('div', { text: r.name }), h('div', { class: 'cell-sub', text: r.mobile })),
        td('Area', h('div', { class: 'cell-clip', text: r.area })),
        td('Category', W65.catLabel(r.category)),
        td('Status', A.chip(r.status)),
        td('Files', String(fileCount(r)))));
    });
    return h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', null, h('tr', null, ['Complaint ID', 'Registered', 'Resident', 'Area', 'Category', 'Status', 'Files'].map(function (x) { return h('th', { text: x }); }))), body));
  }

  /* ===================================================================
     Dashboard
     =================================================================== */
  A.register('dashboard', 'Dashboard', 'dashboard', async function (box) {
    box.appendChild(h('div', { class: 'skeleton', style: 'height:140px' }));
    var db = A.db(), res;
    try {
      res = await Promise.all([db.rpc('public_stats'), db.rpc('staff_overview'),
        db.from('complaints').select('id,code,name,mobile,area,category,status,created_at,complaint_media(count)').order('created_at', { ascending: false }).limit(8)]);
      res.forEach(function (r) { if (r.error) throw r.error; });
    } catch (e) { box.textContent = ''; box.appendChild(h('div', { class: 'alert alert-error' }, A.errMsg(e))); return; }
    var st = res[0].data, ov = res[1].data, recent = res[2].data || [];
    box.textContent = '';

    var K = [['total_complaints', 'Total complaints received', 'clipboard', '#0b2a5b'], ['pending', 'Pending (new / under review)', 'clock', '#c96f0a'],
      ['in_process', 'Under process', 'tool', '#17508f'], ['resolved', 'Resolved / closed', 'check-circle', '#1b8a4b'],
      ['projects_total', 'Development projects', 'hard-hat', '#0b2a5b'], ['projects_completed', 'Completed projects', 'shield-check', '#1b8a4b']];
    var grid = h('div', { class: 'kpi-grid' });
    K.forEach(function (k) {
      var ic = h('div', { class: 'stat-icon' }); ic.innerHTML = W65.icon(k[2]);
      grid.appendChild(h('div', { class: 'stat-card', style: '--c:' + k[3] }, ic, h('span', { class: 'stat-num', text: Number(st[k[0]] || 0).toLocaleString('en-IN') }), h('span', { class: 'stat-label', text: k[1] })));
    });
    box.appendChild(grid);
    box.appendChild(h('p', { class: 'hint', text: 'New complaints in the last 30 days: ' + (ov.last_30_days || 0) }));

    function bars(title, entries, labelFn) {
      var max = Math.max.apply(null, entries.map(function (e) { return e[1]; }).concat([1]));
      var list = h('div', { class: 'bar-list' });
      entries.forEach(function (e) {
        list.appendChild(h('div', { class: 'bar-row' }, h('span', { text: labelFn(e[0]) }), h('div', { class: 'bar' }, h('i', { style: 'width:' + Math.round(100 * e[1] / max) + '%' })), h('b', { text: String(e[1]) })));
      });
      return h('section', { class: 'panel' }, h('h2', { text: title }), entries.length ? list : h('p', { class: 'hint', text: 'No complaints yet.' }));
    }
    var byCat = Object.keys(ov.by_category || {}).map(function (k) { return [k, ov.by_category[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
    var byStatus = W65.STATUSES.map(function (s) { return [s, (ov.by_status || {})[s] || 0]; }).filter(function (e) { return e[1] > 0; });
    box.appendChild(h('div', { class: 'two-col' }, bars('Complaints by category', byCat, W65.catLabel), bars('Complaints by status', byStatus, W65.statusLabel)));

    var areas = ov.top_areas || [];
    box.appendChild(h('section', { class: 'panel' }, h('h2', { text: 'Areas with the most complaints' }),
      areas.length ? h('ol', { style: 'margin:0;padding-left:1.2rem' }, areas.map(function (a) { return h('li', { text: a.area + ' — ' + a.n }); })) : h('p', { class: 'hint', text: 'No complaints yet.' })));

    var rec = h('section', { class: 'panel' }, h('h2', { text: 'Latest complaints' }));
    if (!recent.length) rec.appendChild(h('p', { class: 'hint', text: 'No complaints have been registered yet.' }));
    else {
      rec.appendChild(complaintTable(recent, function (id) { A.openComplaint(id, A.reload); }));
      rec.appendChild(h('p', { style: 'margin:.8rem 0 0' }, A.btn('btn-secondary btn-sm', 'arrow-right', 'View all complaints', function () { A.go('complaints'); })));
    }
    box.appendChild(rec);
  });

  /* ===================================================================
     Complaints list
     =================================================================== */
  A.register('complaints', 'Complaints', 'clipboard', function (box) {
    var inQ = A.input('search', F.q, { placeholder: 'ID, name, mobile or area', id: 'fq' });
    var inArea = A.input('text', F.area, { placeholder: 'e.g. Kamari Peth', list: 'areaOpts', id: 'farea' });
    var dl = h('datalist', { id: 'areaOpts' }, W65.AREAS.map(function (a) { return h('option', { value: a.name }); }));
    var inCat = A.select([['', 'All categories']].concat(W65.CATEGORIES.map(function (c) { return [c.key, W65.catLabel(c.key)]; })), F.category);
    var inSt = A.select([['', 'All statuses']].concat(W65.STATUSES.map(function (s) { return [s, W65.statusLabel(s)]; })), F.status);
    var inFrom = A.input('date', F.from), inTo = A.input('date', F.to);
    var results = h('div'), count = h('div', { class: 'hint', 'aria-live': 'polite' });
    var seq = 0, total = 0;

    function fld(label, el) { return A.field(label, el); }
    var bar = h('div', { class: 'filter-bar' }, fld('Search', inQ), fld('Area / street', inArea), fld('Category', inCat), fld('Status', inSt), fld('From date', inFrom), fld('To date', inTo));

    var xBtn = A.btn('btn-green btn-sm', 'file-spreadsheet', 'Download Excel', function () { exportReport('xlsx', xBtn); });
    var pBtn = A.btn('btn-primary btn-sm', 'printer', 'PDF report', function () { exportReport('pdf', pBtn); });
    var rBtn = A.btn('btn-ghost btn-sm', 'refresh', 'Clear filters', function () {
      F = { q: '', area: '', category: '', status: '', from: '', to: '', page: 0 };
      inQ.value = inArea.value = inFrom.value = inTo.value = ''; inCat.value = inSt.value = ''; load();
    });
    box.appendChild(h('section', { class: 'panel no-print' }, bar, dl,
      h('div', { class: 'btn-row', style: 'margin-top:1rem' }, xBtn, pBtn, rBtn)));
    box.appendChild(h('section', { class: 'panel' }, count, results));

    function read() { F.q = inQ.value; F.area = inArea.value; F.category = inCat.value; F.status = inSt.value; F.from = inFrom.value; F.to = inTo.value; }
    function changed() { read(); F.page = 0; load(); }
    var deb = W65.debounce(changed, 350);
    inQ.addEventListener('input', deb); inArea.addEventListener('input', deb);
    [inCat, inSt, inFrom, inTo].forEach(function (i) { i.addEventListener('change', changed); });

    async function load() {
      var my = ++seq;
      results.textContent = ''; results.appendChild(h('div', { class: 'skeleton', style: 'height:180px' }));
      var from = F.page * PAGE;
      var r = await applyFilters(A.db().from('complaints').select('id,code,name,mobile,area,category,status,created_at,complaint_media(count)', { count: 'exact' }))
        .order('created_at', { ascending: false }).range(from, from + PAGE - 1);
      if (my !== seq) return;
      results.textContent = '';
      if (r.error) { A.fail(r.error); results.appendChild(h('div', { class: 'alert alert-error' }, A.errMsg(r.error))); return; }
      total = r.count || 0;
      count.textContent = total ? ('Showing ' + (from + 1) + '–' + (from + r.data.length) + ' of ' + total + ' complaints') : '';
      if (!r.data.length) { results.appendChild(A.empty('clipboard', total === 0 && !F.q && !F.area && !F.category && !F.status && !F.from && !F.to ? 'No complaints have been registered yet.' : 'No complaints match these filters.')); return; }
      results.appendChild(complaintTable(r.data, function (id) { A.openComplaint(id, load); }));
      var prev = A.btn('btn-ghost btn-sm', 'chevron-left', 'Previous', function () { F.page--; load(); }, { disabled: F.page === 0 });
      var next = A.btn('btn-ghost btn-sm', 'chevron-right', 'Next', function () { F.page++; load(); }, { disabled: from + PAGE >= total });
      results.appendChild(h('div', { class: 'pager' }, prev, h('span', { text: 'Page ' + (F.page + 1) + ' of ' + Math.max(1, Math.ceil(total / PAGE)) }), next));
    }
    load();
  });

  /* ---------------- reports ---------------- */
  async function fetchAll() {
    var out = [], from = 0, step = 1000;
    while (from < EXPORT_MAX) {
      var r = await applyFilters(A.db().from('complaints').select('*, complaint_updates(note,created_at), complaint_media(count)'))
        .order('created_at', { ascending: false }).range(from, from + step - 1);
      if (r.error) throw r.error;
      out = out.concat(r.data || []);
      if (!r.data || r.data.length < step) break;
      from += step;
    }
    return out;
  }
  function latestNote(r) {
    var n = (r.complaint_updates || []).filter(function (u) { return u.note; }).sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; })[0];
    return n ? n.note : '';
  }
  function today() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); }
  function download(blob, name) {
    var a = h('a', { href: URL.createObjectURL(blob), download: name, style: 'display:none' });
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 10000);
  }
  async function exportReport(kind, btn) {
    A.busy(btn, true);
    // The PDF report opens in its own tab. It must be opened during the click (before the data loads) or phones block it.
    var reportWin = null;
    if (kind === 'pdf') {
      try {
        reportWin = window.open('', '_blank');
        if (reportWin) reportWin.document.write('<!doctype html><meta charset="utf-8"><title>Report</title><p style="font:16px sans-serif;padding:2rem">Preparing the report…</p>');
      } catch (e) { reportWin = null; }
    }
    try {
      var rows = await fetchAll();
      if (!rows.length) { if (reportWin) reportWin.close(); W65.toast('There are no complaints to export for these filters.', 'err'); return; }
      var capped = rows.length >= EXPORT_MAX;
      var stamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST';
      if (kind === 'xlsx') {
        var data = rows.map(function (r) {
          return [r.code, new Date(r.created_at), r.name, r.mobile, r.ward_no, r.area, r.landmark || '', W65.catLabel(r.category), W65.statusLabel(r.status),
            r.department || '', r.description, latestNote(r), r.resolution_details || '', r.resolved_at ? new Date(r.resolved_at) : '', fileCount(r)];
        });
        var cols = [['Complaint ID', 18], ['Registered on', 20], ['Name', 22], ['Mobile', 14], ['Ward', 7], ['Area / Street', 24], ['Landmark', 24], ['Category', 24], ['Status', 18],
          ['Department', 22], ['Description', 60], ['Latest progress note', 40], ['Resolution details', 40], ['Resolved on', 20], ['Photos/videos', 12]]
          .map(function (c) { return { header: c[0], width: c[1] }; });
        var byStatus = {}, byCat = {};
        rows.forEach(function (r) { byStatus[r.status] = (byStatus[r.status] || 0) + 1; byCat[r.category] = (byCat[r.category] || 0) + 1; });
        var sum = [['Report generated', stamp], ['Filters applied', filterText()], ['Total complaints in this report', rows.length]];
        if (capped) sum.push(['Note', 'Limited to the newest ' + EXPORT_MAX + ' complaints. Narrow the filters for older ones.']);
        sum.push(['', '']); sum.push(['BY STATUS', '']);
        W65.STATUSES.forEach(function (s) { sum.push([W65.statusLabel(s), byStatus[s] || 0]); });
        sum.push(['', '']); sum.push(['BY CATEGORY', '']);
        W65.CATEGORIES.forEach(function (c) { sum.push([W65.catLabel(c.key), byCat[c.key] || 0]); });
        var blob = W65.xlsx.build([
          { name: 'Complaints', columns: cols, rows: data },
          { name: 'Summary', title: 'Ward No. 65 – Complaints report', columns: [{ header: 'Item', width: 42 }, { header: 'Value', width: 60 }], rows: sum }]);
        download(blob, 'ward65-complaints-' + today() + '.xlsx');
        W65.toast('Excel file downloaded (' + rows.length + ' complaints).', 'ok');
      } else {
        var short = function (s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
        W65.printReport({
          title: 'Ward No. 65 – Complaints report', subtitle: 'Hubballi-Dharwad Municipal Corporation',
          lines: ['Generated: ' + stamp, 'Filters: ' + filterText(), 'Total complaints: ' + rows.length + (capped ? ' (newest ' + EXPORT_MAX + ' shown)' : '')],
          columns: [['Complaint ID', 11], ['Registered', 9], ['Resident', 11], ['Mobile', 8], ['Area / Street', 11], ['Category', 10], ['Status', 8], ['Department', 9], ['Description / progress', 23]].map(function (c) { return { header: c[0], width: c[1] }; }),
          rows: rows.map(function (r) {
            var ln = latestNote(r);
            return [r.code, W65.fmtDate(r.created_at), r.name, r.mobile, r.area, W65.catLabel(r.category), W65.statusLabel(r.status), r.department || '—',
              short(r.description, 180) + (ln ? '  ▸ ' + short(ln, 120) : '')];
          }),
          footer: 'Confidential – contains residents’ personal details. For official use of Ward No. 65 staff only.'
        }, reportWin);
      }
    } catch (e) { if (reportWin) reportWin.close(); A.fail(e); } finally { A.busy(btn, false); }
  }

  /* ===================================================================
     Complaint detail drawer
     =================================================================== */
  A.openComplaint = async function (id, onClose) {
    var dirty = false;
    var d = A.drawer({ label: 'Complaint details', onClose: function () { if (dirty && onClose) onClose(); } });
    var db = A.db();
    async function load() {
      d.body.textContent = ''; d.body.appendChild(h('div', { class: 'skeleton', style: 'height:320px' }));
      var res;
      try {
        res = await Promise.all([
          db.from('complaints').select('*').eq('id', id).single(),
          db.from('complaint_updates').select('*').eq('complaint_id', id).order('created_at', { ascending: false }).order('id', { ascending: false }),
          db.from('complaint_media').select('*').eq('complaint_id', id).order('id')]);
        res.forEach(function (r) { if (r.error) throw r.error; });
        var media = res[2].data || [], signed = [];
        if (media.length) {
          var s = await db.storage.from('complaint-media').createSignedUrls(media.map(function (m) { return m.storage_path; }), 3600);
          signed = s.data || [];
        }
        draw(res[0].data, res[1].data || [], media, signed);
      } catch (e) { A.fail(e); d.close(); }
    }

    function draw(c, updates, media, signed) {
      d.head.textContent = '';
      d.head.appendChild(h('div', { class: 'hint', text: 'Complaint ID' }));
      d.head.appendChild(h('div', { style: 'display:flex;gap:.7rem;align-items:center;flex-wrap:wrap' }, h('code', { text: c.code, style: 'font:800 1.3rem ui-monospace,Menlo,monospace;color:var(--navy)' }), A.chip(c.status)));
      var body = d.body; body.textContent = '';

      function row(label, node, wide) { return h('div', { class: wide ? 'wide' : '' }, h('dt', { text: label }), h('dd', null, node)); }
      var mobile = h('a', { href: W65.telHref(c.mobile), text: c.mobile });
      var loc = (c.latitude != null && c.longitude != null)
        ? h('a', { href: 'https://www.google.com/maps?q=' + c.latitude + ',' + c.longitude, target: '_blank', rel: 'noopener noreferrer', text: 'Open on Google Maps' }) : null;
      body.appendChild(h('dl', { class: 'detail-grid' },
        row('Registered', dt(c.created_at)), row('Resident', c.name), row('Mobile', mobile), row('Area / street', c.area),
        row('Ward', String(c.ward_no)), row('Category', W65.catLabel(c.category)),
        c.landmark ? row('Landmark', c.landmark) : null, loc ? row('Location', loc) : null,
        row('Description', h('div', { text: c.description, style: 'white-space:pre-line;font-weight:500' }), true)));

      // photos and videos
      body.appendChild(h('h3', { text: 'Photos & videos (' + media.length + ')', style: 'font-size:1.05rem' }));
      if (!media.length) body.appendChild(h('p', { class: 'hint', text: 'The resident did not attach any files.' }));
      else {
        var items = media.map(function (m, i) {
          var s = signed.filter(function (x) { return x.path === m.storage_path; })[0];
          return { type: m.kind, src: s && s.signedUrl, caption: c.code + ' — ' + (m.kind === 'video' ? 'video' : 'photo') + ' ' + (i + 1) };
        });
        var grid = h('div', { class: 'media-grid' });
        items.forEach(function (it, i) {
          if (!it.src) return;
          var inner = it.type === 'video' ? h('video', { src: it.src, preload: 'metadata', muted: true, playsinline: true }) : h('img', { src: it.src, alt: '', loading: 'lazy' });
          var b = h('button', { type: 'button', class: 'media-thumb', 'aria-label': 'View ' + it.caption, onclick: function () { W65.lightbox.open(items.filter(function (x) { return x.src; }), i); } }, inner);
          if (it.type === 'video') { var pl = h('span', { class: 'play' }); pl.innerHTML = W65.icon('play'); b.appendChild(pl); }
          grid.appendChild(b);
        });
        body.appendChild(grid);
      }

      // update form
      var sSel = A.select(W65.STATUSES.map(function (s) { return [s, W65.statusLabel(s)]; }), c.status);
      var dep = A.input('text', c.department || '', { list: 'deptList', maxlength: 150, placeholder: 'e.g. Drainage / UGD' });
      var depList = h('datalist', { id: 'deptList' }, DEPTS.map(function (x) { return h('option', { value: x }); }));
      var note = A.textarea('', { rows: 3, maxlength: 2000, placeholder: 'Progress report, e.g. “Inspection done – desilting scheduled for Tuesday.”' });
      var pub = A.check('Show this note to the resident on the tracking page', true);
      var res = A.textarea(c.resolution_details || '', { rows: 3, maxlength: 2000, placeholder: 'What was done to resolve it? (required to mark as resolved)' });
      var msg = h('div', { class: 'error-text', role: 'alert' });
      var saveBtn, doneBtn;
      async function save(status) {
        msg.textContent = '';
        if (status === 'resolved' && !res.value.trim()) { msg.textContent = 'Please describe how the problem was resolved.'; res.focus(); return; }
        A.busy(saveBtn, true); A.busy(doneBtn, true);
        try {
          var r = await db.rpc('staff_update_complaint', { p_id: c.id, p_status: status, p_department: dep.value, p_note: note.value, p_is_public: pub.input.checked, p_resolution: res.value });
          if (r.error) throw r.error;
          dirty = true; W65.toast('Complaint updated.', 'ok'); await load();
        } catch (e) { msg.textContent = A.errMsg(e); A.busy(saveBtn, false); A.busy(doneBtn, false); }
      }
      saveBtn = A.btn('btn-primary', 'check', 'Save update', function () { save(sSel.value); });
      doneBtn = A.btn('btn-green', 'check-circle', 'Mark as resolved', function () { sSel.value = 'resolved'; save('resolved'); });
      body.appendChild(h('section', { class: 'panel', style: 'background:var(--surface)' }, h('h2', { text: 'Update this complaint' }),
        h('div', { class: 'form-grid' }, A.field('Status', sSel), A.field('Assigned department', dep), A.field('Progress report / note', note), pub.el,
          A.field('Resolution details (shown to the resident)', res)), depList,
        msg, h('div', { class: 'btn-row', style: 'margin-top:.8rem' }, saveBtn, doneBtn)));

      // history
      body.appendChild(h('h3', { text: 'History', style: 'font-size:1.05rem' }));
      var ul = h('ul', { class: 'history' });
      updates.forEach(function (u) {
        ul.appendChild(h('li', { class: u.is_public ? '' : 'internal' },
          h('div', null, A.chip(u.status), u.is_status_change ? h('span', { text: ' status changed', class: 'hint' }) : null),
          u.note ? h('div', { text: u.note, style: 'white-space:pre-line;margin-top:.3rem' }) : null,
          h('small', { text: (u.created_by_name || 'System') + ' · ' + dt(u.created_at) + (u.note ? (u.is_public ? ' · visible to resident' : ' · internal note') : '') })));
      });
      body.appendChild(ul);

      // delete (administrators only)
      if (A.me.role === 'admin') {
        body.appendChild(h('div', { class: 'divider' }));
        body.appendChild(A.btn('btn-danger btn-sm', 'trash', 'Delete this complaint', async function () {
          if (!window.confirm('Permanently delete complaint ' + c.code + ' and its photos? This cannot be undone.')) return;
          try {
            if (media.length) await db.storage.from('complaint-media').remove(media.map(function (m) { return m.storage_path; }));
            var r = await db.from('complaints').delete().eq('id', c.id);
            if (r.error) throw r.error;
            dirty = true; W65.toast('Complaint deleted.', 'ok'); d.close();
          } catch (e) { A.fail(e); }
        }));
      }
    }
    load();
  };
})();
