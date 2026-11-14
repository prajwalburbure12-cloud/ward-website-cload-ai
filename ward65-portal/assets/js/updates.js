/* Latest updates & announcements */
(function () {
  'use strict';
  var W65 = window.W65, h = W65.h, t = W65.t, $ = W65.$, R = W65.R;
  var PAGE = 10, shown = PAGE, rows = null, type = 'all';

  function chips() {
    R.chips($('#uType'), [{ key: 'all', label: t('filter.all') }].concat(W65.ANN_TYPES.map(function (k) { return { key: k, label: t('ann.type.' + k) }; })), type, function (k) { type = k; shown = PAGE; list(); });
  }
  function list() {
    var box = $('#uList'); box.textContent = '';
    var all = rows.filter(function (a) { return type === 'all' || a.type === type; });
    $('#uCount').textContent = t('updates.count', { n: all.length });
    if (!all.length) {
      var e = h('div', { class: 'empty-state' }); e.innerHTML = W65.icon('newspaper');
      e.appendChild(h('p', { text: t(rows.length ? 'updates.noMatch' : 'news.empty') })); box.appendChild(e); $('#uMore').hidden = true; return;
    }
    all.slice(0, shown).forEach(function (a) { box.appendChild(R.annCard(a)); });
    $('#uMore').hidden = all.length <= shown;
    W65.reveal(box);
  }
  function renderAll() { if (rows) { chips(); list(); } }

  $('#uMore').addEventListener('click', function () { shown += PAGE; list(); });
  W65.onLang(renderAll);

  if (W65.problem()) { rows = []; renderAll(); return; }
  var box = $('#uList');
  for (var i = 0; i < 3; i++) box.appendChild(h('div', { class: 'skeleton', style: 'height:220px;border-radius:22px' }));
  W65.db().from('announcements').select('*').order('is_pinned', { ascending: false }).order('event_date', { ascending: false }).order('created_at', { ascending: false }).limit(300)
    .then(function (r) { if (r.error) throw r.error; rows = r.data || []; renderAll(); })
    .catch(function (e) { console.error(e); rows = []; renderAll(); });
})();
