/* Development gallery: works that have photographs, filterable by category and area */
(function () {
  'use strict';
  var W65 = window.W65, h = W65.h, t = W65.t, $ = W65.$, R = W65.R;
  var PAGE = 12, shown = PAGE, rows = null;
  var f = { cat: 'all', area: 'all', pair: false };
  var qs = new URLSearchParams(location.search);
  if (qs.get('area')) f.area = String(qs.get('area')).trim().toLowerCase();

  function areaKey(a) { return String(a || '').trim().toLowerCase(); }
  function allAreas() {
    var seen = {}, list = [];
    W65.AREAS.forEach(function (a) { seen[areaKey(a.name)] = 1; list.push(a.name); });
    (rows || []).forEach(function (w) { var k = areaKey(w.area); if (k && !seen[k]) { seen[k] = 1; list.push(w.area.trim()); } });
    return list;
  }
  function chips() {
    R.chips($('#gCat'), [{ key: 'all', label: t('filter.all') }].concat(W65.WORK_CATEGORIES.map(function (c) { return { key: c.key, label: t('wcat.' + c.key) }; })), f.cat, function (k) { f.cat = k; shown = PAGE; list(); });
    R.chips($('#gArea'), [{ key: 'all', label: t('filter.all') }].concat(allAreas().map(function (a) { return { key: areaKey(a), label: W65.areaLabel(a) }; })), f.area, function (k) { f.area = k; shown = PAGE; list(); });
  }
  function filtered() {
    return rows.filter(function (w) {
      return (f.cat === 'all' || w.category === f.cat) && (f.area === 'all' || areaKey(w.area) === f.area) && (!f.pair || (w.before_path && w.after_path));
    });
  }
  function list() {
    var box = $('#gGrid'); box.textContent = '';
    var all = filtered();
    $('#gCount').textContent = t('gallery.count', { n: all.length });
    if (!all.length) {
      var e = h('div', { class: 'empty-state', style: 'grid-column:1/-1' }); e.innerHTML = W65.icon('images');
      e.appendChild(h('p', { text: t(rows.length ? 'gallery.noMatch' : 'gallery.empty') })); box.appendChild(e); $('#gMore').hidden = true; return;
    }
    all.slice(0, shown).forEach(function (w) { box.appendChild(R.galleryCard(w)); });
    $('#gMore').hidden = all.length <= shown;
    W65.reveal(box);
  }
  function renderAll() { if (rows) { chips(); list(); } }

  $('#gPair').addEventListener('change', function () { f.pair = this.checked; shown = PAGE; list(); });
  $('#gMore').addEventListener('click', function () { shown += PAGE; list(); });
  W65.onLang(renderAll);

  if (W65.problem()) { rows = []; renderAll(); return; }
  var box = $('#gGrid');
  for (var i = 0; i < 6; i++) box.appendChild(h('div', { class: 'skeleton', style: 'height:300px;border-radius:22px' }));
  W65.db().from('development_works').select('*').order('completed_on', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).limit(500)
    .then(function (r) { if (r.error) throw r.error; rows = (r.data || []).filter(R.hasPhotos); renderAll(); })
    .catch(function (e) { console.error(e); rows = []; renderAll(); });
})();
