/* Track a complaint: ID + mobile -> status, details, progress timeline */
(function () {
  'use strict';
  var W65 = window.W65, h = W65.h, t = W65.t, $ = W65.$;
  var problem = W65.problem();
  var current = null;          // last result, kept so the page can re-render when the language changes
  var busy = false;

  function normCode(v) {
    var s = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    var m = /^W65(\d{4})([A-Z0-9]{5})$/.exec(s);
    return m ? 'W65-' + m[1] + '-' + m[2] : String(v || '').toUpperCase().trim();
  }
  function normMobile(v) {
    var d = W65.digits(v);
    if (d.length === 12 && d.slice(0, 2) === '91') d = d.slice(2);
    else if (d.length === 11 && d.charAt(0) === '0') d = d.slice(1);
    return d.slice(0, 10);
  }
  function setErr(id, msg, inputId) {
    $('#e_' + id).textContent = msg || '';
    var i = $('#' + inputId); if (msg) i.setAttribute('aria-invalid', 'true'); else i.removeAttribute('aria-invalid');
  }
  function alertBox(msg, kind) {
    var box = $('#trackAlert'); box.textContent = '';
    if (!msg) return;
    var a = h('div', { class: 'alert alert-' + (kind || 'error'), role: 'alert' }); a.innerHTML = W65.icon(kind === 'info' ? 'info' : 'alert');
    a.appendChild(h('span', { text: msg })); box.appendChild(a);
  }

  /* ---------------- Inputs ---------------- */
  var codeEl = $('#t_code'), mobEl = $('#t_mobile');
  mobEl.addEventListener('input', function () { var n = normMobile(mobEl.value); if (mobEl.value !== n) mobEl.value = n; });
  codeEl.addEventListener('input', function () {
    var p = codeEl.selectionStart; codeEl.value = codeEl.value.toUpperCase();
    try { codeEl.setSelectionRange(p, p); } catch (e) { /* ignore */ }
  });
  codeEl.addEventListener('blur', function () { codeEl.value = normCode(codeEl.value); });

  function renderRecent() {
    var box = $('#recent'), codes = W65.recentCodes(); box.textContent = '';
    box.hidden = !codes.length; if (!codes.length) return;
    box.appendChild(h('span', { class: 'hint', text: t('track.recent') }));
    codes.forEach(function (c) {
      box.appendChild(h('button', { type: 'button', text: c, onclick: function () { codeEl.value = c; mobEl.focus(); } }));
    });
  }
  renderRecent();

  var fromUrl = new URLSearchParams(location.search).get('code');
  if (fromUrl) { codeEl.value = normCode(fromUrl); mobEl.focus(); }

  /* ---------------- Submit ---------------- */
  $('#trackForm').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    if (busy) return;
    alertBox(''); setErr('code', '', 't_code'); setErr('tmobile', '', 't_mobile');
    var code = normCode(codeEl.value), mobile = normMobile(mobEl.value), bad = false;
    codeEl.value = code;
    if (!/^W65-\d{4}-[A-Z0-9]{5}$/.test(code)) { setErr('code', t('track.badCode'), 't_code'); bad = true; }
    if (!/^[6-9]\d{9}$/.test(mobile)) { setErr('tmobile', t('err.invalid_mobile'), 't_mobile'); bad = true; }
    if (bad) { (bad && $('[aria-invalid="true"]')).focus(); return; }
    if (problem) { alertBox(t(problem === 'config' ? 'setup.config' : 'setup.lib'), 'warn'); return; }

    busy = true; var btn = $('#trackBtn'); btn.disabled = true; btn.classList.add('is-loading');
    $('#result').textContent = '';
    try {
      var r = await W65.db().rpc('track_complaint', { p_code: code, p_mobile: mobile });
      if (r.error) throw r.error;
      if (!r.data) { current = null; alertBox(t('track.notFound')); return; }
      current = r.data; render();
      $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      console.error(err); current = null; alertBox(W65.errText(err));
    } finally { busy = false; btn.disabled = false; btn.classList.remove('is-loading'); }
  });

  /* ---------------- Result ---------------- */
  function row(label, value, wide) {
    return h('div', { class: wide ? 'wide' : '' }, h('dt', { text: label }), h('dd', { text: value, style: wide ? 'white-space:pre-line' : '' }));
  }
  function render() {
    var box = $('#result'); box.textContent = '';
    if (!current) return;
    var c = current, S = W65.STATUSES, cur = Math.max(0, S.indexOf(c.status));
    var finished = c.status === 'resolved' || c.status === 'closed';
    var events = c.timeline || [];

    var card = h('div', { class: 'card reveal in', style: 'padding:clamp(1.2rem,4vw,2rem)' });

    // header
    card.appendChild(h('div', { class: 'result-head' },
      h('div', null, h('div', { class: 'hint', text: t('track.code') }), h('code', { text: c.code })),
      h('span', { class: 'chip chip-' + c.status, text: W65.statusLabel(c.status) })));

    // progress bar
    var pct = Math.round(((cur + 1) / S.length) * 100);
    var bar = h('div', { class: 'progress-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': t('track.progress') }, h('i', { style: 'width:0' }));
    card.appendChild(bar);
    setTimeout(function () { bar.firstChild.style.width = pct + '%'; }, 60);

    // details
    var dl = h('dl', { class: 'detail-grid' },
      row(t('track.registered'), W65.fmtDate(c.created_at)),
      row(t('track.category'), W65.catLabel(c.category)),
      row(t('track.area'), c.area || '—'),
      row(t('track.department'), c.department || t('track.notAssigned')),
      row(t('track.description'), c.description || '', true));
    card.appendChild(dl);

    // latest progress update (most recent public note)
    var notes = events.filter(function (e) { return e.note; });
    var last = notes[notes.length - 1];
    var lu = h('div', { class: 'latest-update' }, h('h4', { text: t('track.latest') }),
      last ? h('div', null, h('div', { text: last.note, style: 'white-space:pre-line' }), h('div', { class: 'tl-date', text: W65.fmtDateTime(last.at) }))
           : h('div', { text: t('track.noUpdate') }));
    card.appendChild(lu);

    // resolution
    if (c.resolution_details) {
      card.appendChild(h('div', { class: 'resolution-box' }, h('h4', { text: t('track.resolution') }),
        h('div', { text: c.resolution_details, style: 'white-space:pre-line' }),
        c.resolved_at ? h('div', { class: 'tl-date', text: t('track.resolvedOn') + ' ' + W65.fmtDate(c.resolved_at) }) : null));
    }

    // timeline
    card.appendChild(h('h3', { text: t('track.journey'), style: 'margin-top:.4rem' }));
    var ol = h('ol', { class: 'timeline' });
    S.forEach(function (s, i) {
      var done = finished ? i <= cur : i < cur, isCur = !finished && i === cur;
      var step = events.filter(function (e) { return e.step && e.status === s; })[0];
      var stepNotes = events.filter(function (e) { return e.status === s && e.note; });
      var dot = h('span', { class: 'tl-dot' });
      dot.innerHTML = W65.icon(done ? 'check' : (isCur ? 'clock' : 'more'));
      var li = h('li', { class: done ? 'done' : (isCur ? 'current' : 'upcoming'), 'aria-current': isCur ? 'step' : null }, dot,
        h('div', { class: 'tl-title', text: W65.statusLabel(s) }),
        (step && (done || isCur)) ? h('div', { class: 'tl-date', text: W65.fmtDateTime(step.at) }) : null);
      if (done || isCur) stepNotes.forEach(function (n) {
        li.appendChild(h('div', { class: 'tl-note' }, h('div', { text: n.note, style: 'white-space:pre-line' }), h('div', { class: 'tl-date', text: W65.fmtDateTime(n.at) })));
      });
      ol.appendChild(li);
    });
    card.appendChild(ol);
    box.appendChild(card);
  }
  W65.onLang(function () { renderRecent(); render(); });
})();
