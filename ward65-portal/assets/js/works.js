/* Development works list with filters. Counts are calculated from the database rows. */
(function () {
  'use strict';
  var W65 = window.W65, h = W65.h, t = W65.t, $ = W65.$, R = W65.R;
  var PAGE = 10, shown = PAGE, rows = null;
  var f = { status: 'all', cat: 'all', area: 'all' };

  function areaKey(a) { return String(a || '').trim().toLowerCase(); }
  function allAreas() {
    var seen = {}, list = [];
    W65.AREAS.forEach(function (a) { seen[areaKey(a.name)] = 1; list.push(a.name); });
    (rows || []).forEach(function (w) { var k = areaKey(w.area); if (k && !seen[k]) { seen[k] = 1; list.push(w.area.trim()); } });
    return list;
  }

  function stats() {
    var box = $('#miniStats'); box.textContent = '';
    var total = rows.length, done = rows.filter(function (w) { return w.status === 'completed'; }).length;
    var going = rows.filter(function (w) { return w.status === 'ongoing'; }).length;
    [[total, 'works.stat.total'], [going, 'works.stat.ongoing'], [done, 'works.stat.done']].forEach(function (s) {
      box.appendChild(h('div', { class: 'mini-stat' }, h('b', { text: String(s[0]) }), h('span', { text: t(s[1]) })));
    });
  }
  function chips() {
    R.chips($('#fStatus'), [{ key: 'all', label: t('filter.all') }].concat(W65.WORK_STATUSES.map(function (k) { return { key: k, label: t('wstatus.' + k) }; })), f.status, function (k) { f.status = k; shown = PAGE; list(); });
    R.chips($('#fCat'), [{ key: 'all', label: t('filter.all') }].concat(W65.WORK_CATEGORIES.map(function (c) { return { key: c.key, label: t('wcat.' + c.key) }; })), f.cat, function (k) { f.cat = k; shown = PAGE; list(); });
    R.chips($('#fArea'), [{ key: 'all', label: t('filter.all') }].concat(allAreas().map(function (a) { return { key: areaKey(a), label: W65.areaLabel(a) }; })), f.area, function (k) { f.area = k; shown = PAGE; list(); });
  }
  function filtered() {
    return rows.filter(function (w) {
      return (f.status === 'all' || w.status === f.status) && (f.cat === 'all' || w.category === f.cat) && (f.area === 'all' || areaKey(w.area) === f.area);
    });
  }
  function list() {
    var box = $('#workList'); box.textContent = '';
    var all = filtered();
    $('#resultCount').textContent = t('works.count', { n: all.length });
    if (!all.length) {
      var e = h('div', { class: 'empty-state' }); e.innerHTML = W65.icon('hard-hat'); e.appendChild(h('p', { text: t(rows.length ? 'works.noMatch' : 'works.empty') }));
      box.appendChild(e); $('#more').hidden = true; return;
    }
    all.slice(0, shown).forEach(function (w) { box.appendChild(R.workCard(w)); });
    $('#more').hidden = all.length <= shown;
    W65.reveal(box);
  }
  function renderAll() { if (!rows) return; stats(); chips(); list(); }

  $('#more').addEventListener('click', function () { shown += PAGE; list(); });
  W65.onLang(renderAll);

  if (W65.problem()) { rows = []; renderAll(); return; }
  var box = $('#workList');
  for (var i = 0; i < 3; i++) box.appendChild(h('div', { class: 'skeleton', style: 'height:200px;border-radius:22px' }));
  W65.db().from('development_works').select('*').order('completed_on', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).limit(500)
    .then(function (r) { if (r.error) throw r.error; rows = r.data || []; renderAll(); })
    .catch(function (e) { console.error(e); rows = []; renderAll(); });
})();
