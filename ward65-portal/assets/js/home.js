/* Home page: banner, live statistics, categories, representatives, latest updates, recent works */
(function () {
  'use strict';
  var W65 = window.W65, h = W65.h, t = W65.t, $ = W65.$, R = W65.R;
  var problem = W65.problem();
  var state = { stats: null, reps: null, news: null, works: null };

  /* ---------------- Banner (shown untouched, only if a real image loads) ---------------- */
  function showBanner(src, fallback) {
    var probe = new Image();
    probe.onload = function () {
      $('#bannerImg').src = src;
      $('#bannerWrap').hidden = false;
      document.body.classList.add('has-banner');
    };
    probe.onerror = function () { if (fallback && fallback !== src) showBanner(fallback); };
    probe.src = src;
  }
  W65.settings().then(function (s) {
    var uploaded = (!problem && s.banner_path) ? W65.pubUrl(s.banner_path) : '';
    var fallback = W65.CFG.FALLBACK_BANNER || '';
    if (uploaded) showBanner(uploaded, fallback);
    else if (fallback) showBanner(fallback);
  });

  /* ---------------- Statistics ---------------- */
  var STATS = [
    { k: 'total_complaints', icon: 'clipboard', c: '#0b2a5b', label: 'stats.total' },
    { k: 'pending', icon: 'clock', c: '#c96f0a', label: 'stats.pending' },
    { k: 'in_process', icon: 'tool', c: '#17508f', label: 'stats.process' },
    { k: 'resolved', icon: 'check-circle', c: '#1b8a4b', label: 'stats.resolved' },
    { k: 'projects_total', icon: 'hard-hat', c: '#0b2a5b', label: 'stats.projects' },
    { k: 'projects_completed', icon: 'shield-check', c: '#1b8a4b', label: 'stats.projectsDone' }
  ];
  function renderStats(animate) {
    var grid = $('#statsGrid'); grid.textContent = '';
    STATS.forEach(function (s) {
      var num = h('span', { class: 'stat-num', text: '–' });
      var icon = h('div', { class: 'stat-icon' }); icon.innerHTML = W65.icon(s.icon);
      grid.appendChild(h('div', { class: 'stat-card reveal', style: '--c:' + s.c }, icon, num, h('span', { class: 'stat-label', text: t(s.label) })));
      if (state.stats && state.stats[s.k] != null) {
        if (animate) W65.countUp(num, state.stats[s.k]); else num.textContent = Number(state.stats[s.k]).toLocaleString('en-IN');
      }
    });
    W65.reveal(grid);
    $('#statsNote').textContent = state.stats ? t('stats.note') : (problem ? '' : t('stats.unavailable'));
  }
  renderStats(false);
  if (!problem) {
    W65.db().rpc('public_stats').then(function (r) {
      if (r.error) throw r.error;
      state.stats = r.data; renderStats(true);
    }).catch(function (e) { console.error(e); renderStats(false); });
  }

  /* ---------------- Categories ---------------- */
  function renderCats() {
    var grid = $('#catGrid'); grid.textContent = '';
    W65.CATEGORIES.forEach(function (c) {
      var ci = h('span', { class: 'ci' }); ci.innerHTML = W65.icon(c.icon);
      grid.appendChild(h('a', { class: 'cat-tile reveal', href: 'complaint.html?cat=' + c.key }, ci, h('span', { text: W65.catLabel(c.key) })));
    });
    W65.reveal(grid);
  }

  /* ---------------- Generic loader for the three content blocks ---------------- */
  function skeletons(el, n, hgt) {
    el.textContent = '';
    for (var i = 0; i < n; i++) el.appendChild(h('div', { class: 'skeleton', style: 'height:' + hgt + 'px;border-radius:22px' }));
  }
  function empty(el, icon, key) {
    el.textContent = '';
    var box = h('div', { class: 'empty-state', style: 'grid-column:1/-1' });
    box.innerHTML = W65.icon(icon);
    box.appendChild(h('p', { text: t(key) }));
    el.appendChild(box);
  }

  function renderReps() {
    var el = $('#repGrid');
    if (state.reps == null) return;
    if (!state.reps.length) return empty(el, 'users', 'reps.empty');
    el.textContent = '';
    state.reps.forEach(function (r) { el.appendChild(R.repCard(r)); });
    W65.reveal(el);
  }
  function renderNews() {
    var el = $('#homeNews');
    if (state.news == null) return;
    if (!state.news.length) return empty(el, 'newspaper', 'news.empty');
    el.textContent = '';
    state.news.forEach(function (a) { el.appendChild(R.annCard(a, { clamp: true })); });
    W65.reveal(el);
  }
  function renderWorks() {
    var el = $('#homeWorks');
    if (state.works == null) return;
    if (!state.works.length) return empty(el, 'images', 'dev.empty');
    el.textContent = '';
    state.works.forEach(function (w) { el.appendChild(R.galleryCard(w)); });
    W65.reveal(el);
  }

  skeletons($('#repGrid'), 3, 420); skeletons($('#homeNews'), 3, 280); skeletons($('#homeWorks'), 3, 300);
  if (problem) {
    empty($('#repGrid'), 'users', 'reps.empty'); empty($('#homeNews'), 'newspaper', 'news.empty'); empty($('#homeWorks'), 'images', 'dev.empty');
  } else {
    var db = W65.db();
    db.from('representatives').select('*').order('display_order').then(function (r) {
      if (r.error) throw r.error; state.reps = r.data || []; renderReps();
    }).catch(function (e) { console.error(e); state.reps = []; renderReps(); });

    db.from('announcements').select('*').order('is_pinned', { ascending: false }).order('event_date', { ascending: false }).limit(3).then(function (r) {
      if (r.error) throw r.error; state.news = r.data || []; renderNews();
    }).catch(function (e) { console.error(e); state.news = []; renderNews(); });

    db.from('development_works').select('*').order('created_at', { ascending: false }).limit(12).then(function (r) {
      if (r.error) throw r.error;
      state.works = (r.data || []).filter(R.hasPhotos).slice(0, 3); renderWorks();
    }).catch(function (e) { console.error(e); state.works = []; renderWorks(); });
  }

  renderCats();
  W65.onLang(function () {
    renderStats(false); renderCats(); renderReps(); renderNews(); renderWorks();
  });
})();
