/* =====================================================================
   WARD NO. 65 PORTAL - shared core
   language, Supabase client, header/footer, lightbox, toasts, helpers
   ===================================================================== */
(function () {
  'use strict';
  var CFG = window.WARD65_CONFIG || {};
  var W65 = (window.W65 = window.W65 || {});
  W65.CFG = CFG;

  /* ------------------------------------------------------------------
     Constants shared by every page
     ------------------------------------------------------------------ */
  W65.CATEGORIES = [
    { key: 'water', icon: 'droplet' }, { key: 'drainage', icon: 'waves' },
    { key: 'garbage', icon: 'trash' }, { key: 'road', icon: 'road' },
    { key: 'streetlight', icon: 'lightbulb' }, { key: 'rainwater', icon: 'cloud-rain' },
    { key: 'sanitation', icon: 'bug' }, { key: 'encroachment', icon: 'shield-alert' },
    { key: 'health', icon: 'heart-pulse' }, { key: 'other', icon: 'more' }
  ];
  W65.STATUSES = ['submitted', 'under_review', 'assigned', 'in_progress', 'resolved', 'closed'];
  W65.WORK_CATEGORIES = [
    { key: 'road', icon: 'road' }, { key: 'drainage', icon: 'waves' }, { key: 'water', icon: 'droplet' },
    { key: 'lighting', icon: 'lightbulb' }, { key: 'cleanliness', icon: 'trash' }, { key: 'infrastructure', icon: 'building' }
  ];
  W65.WORK_STATUSES = ['planned', 'ongoing', 'completed'];
  W65.ANN_TYPES = ['new_project', 'ongoing_work', 'completed_project', 'public_notice', 'announcement', 'community_programme'];
  W65.AREAS = [
    { key: 'dajibaan_peth', name: 'Dajibaan Peth' }, { key: 'kamari_peth', name: 'Kamari Peth' },
    { key: 'new_myadar_oni', name: 'New Myadar Oni' }, { key: 'victoria_road', name: 'Victoria Road' },
    { key: 'mahavir_galli', name: 'Mahavir Galli' }, { key: 'gawli_galli', name: 'Gawli Galli' },
    { key: 'sorabada_math_oni', name: 'Sorabada Math Oni' }, { key: 'gurusiddeshwar_nagar', name: 'Gurusiddeshwar Nagar' }
  ];

  /* ------------------------------------------------------------------
     DOM helpers
     ------------------------------------------------------------------ */
  var $ = (W65.$ = function (sel, root) { return (root || document).querySelector(sel); });
  W65.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  W65.h = function (tag, props) {
    var el = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v == null || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'dataset') Object.keys(v).forEach(function (d) { el.dataset[d] = v[d]; });
        else if (k.indexOf('on') === 0 && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      });
    }
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  };
  function append(el, kid) {
    if (kid == null || kid === false) return;
    if (Array.isArray(kid)) { kid.forEach(function (k) { append(el, k); }); return; }
    el.appendChild(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  var h = W65.h;

  W65.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  /* icon(name) returns a trusted static SVG string */
  W65.icon = function (name, cls) {
    var body = (window.W65_ICONS || {})[name] || '';
    return '<svg class="icon ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + body + '</svg>';
  };
  /* <i data-icon="name" class="extra"></i>  ->  inline SVG (keeps static HTML readable) */
  W65.applyIcons = function (root) {
    W65.$$('[data-icon]', root).forEach(function (el) {
      var svg = W65.iconEl(el.getAttribute('data-icon'), el.className);
      if (svg) el.replaceWith(svg);
    });
  };
  W65.iconEl = function (name, cls) {
    var t = document.createElement('template');
    t.innerHTML = W65.icon(name, cls);
    return t.content.firstChild;
  };
  /* a <span> whose text follows the selected language */
  W65.i = function (key) { return h('span', { 'data-i18n': key, text: W65.t(key) }); };
  W65.debounce = function (fn, ms) {
    var t; return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms || 300); };
  };
  /* Copy to clipboard. Tries the modern API first and falls back to the older method;
     rejects only when both fail, so the caller can tell the person to copy by hand. */
  W65.copy = function (text) {
    function legacy() {
      return new Promise(function (resolve, reject) {
        var ta = h('textarea', { readonly: true, 'aria-hidden': 'true', style: 'position:fixed;top:0;left:0;opacity:0' });
        ta.value = text; document.body.appendChild(ta); ta.focus(); ta.select();
        var done = false;
        try { done = document.execCommand('copy'); } catch (e) { done = false; }
        ta.remove();
        if (done) resolve(); else reject(new Error('copy_failed'));
      });
    }
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).catch(legacy);
    return legacy();
  };

  /* ------------------------------------------------------------------
     Language (English / Kannada)
     ------------------------------------------------------------------ */
  var lang = 'en';
  try {
    lang = localStorage.getItem('ward65_lang') ||
      (String(navigator.language || '').toLowerCase().indexOf('kn') === 0 ? 'kn' : 'en');
  } catch (e) { /* storage blocked */ }
  if (lang !== 'kn') lang = 'en';
  var langListeners = [];

  W65.lang = function () { return lang; };
  W65.t = function (key, vars) {
    var D = window.W65_I18N || {};
    var s = (D[lang] && D[lang][key]);
    if (s == null) s = D.en && D.en[key];
    if (s == null) return key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.split('{' + k + '}').join(vars[k]); });
    return s;
  };
  var t = W65.t;
  /* pick the Kannada version of a database field when it exists */
  W65.loc = function (row, field) {
    if (!row) return '';
    var kn = row[field + '_kn'];
    return (lang === 'kn' && kn && String(kn).trim()) ? kn : (row[field] || '');
  };
  W65.applyI18n = function (root) {
    root = root || document;
    W65.$$('[data-i18n]', root).forEach(function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    W65.$$('[data-i18n-placeholder]', root).forEach(function (el) { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder'))); });
    W65.$$('[data-i18n-aria]', root).forEach(function (el) { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria'))); });
    W65.$$('[data-i18n-title]', root).forEach(function (el) { el.setAttribute('title', t(el.getAttribute('data-i18n-title'))); });
    W65.$$('[data-i18n-alt]', root).forEach(function (el) { el.setAttribute('alt', t(el.getAttribute('data-i18n-alt'))); });
    if (root === document) {
      var page = document.body.getAttribute('data-page');
      var tk = 'title.' + page;
      var title = t(tk);
      if (title !== tk) document.title = title;
    }
  };
  W65.setLang = function (l) {
    lang = l === 'kn' ? 'kn' : 'en';
    try { localStorage.setItem('ward65_lang', lang); } catch (e) { /* ignore */ }
    document.documentElement.setAttribute('lang', lang);
    W65.applyI18n();
    W65.$$('.lang-switch button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === lang)); });
    langListeners.forEach(function (fn) { try { fn(lang); } catch (e) { console.error(e); } });
  };
  W65.onLang = function (fn) { langListeners.push(fn); };
  /* The staff dashboard is always English; this does not touch the visitor's saved choice. */
  W65.forceLang = function (l) { lang = l === 'kn' ? 'kn' : 'en'; document.documentElement.setAttribute('lang', lang); };
  W65.areaLabel = function (name) {
    var a = W65.AREAS.filter(function (x) { return x.name.toLowerCase() === String(name || '').toLowerCase(); })[0];
    return a ? t('area.' + a.key) : name;
  };
  W65.catLabel = function (k) { return t('cat.' + k); };
  W65.statusLabel = function (k) { return t('status.' + k); };

  /* ------------------------------------------------------------------
     Formatting
     ------------------------------------------------------------------ */
  W65.fmtDate = function (iso, opts) {
    if (!iso) return '';
    var d = new Date(iso); if (isNaN(d)) return '';
    return d.toLocaleDateString(lang === 'kn' ? 'kn-IN' : 'en-IN', opts || { day: 'numeric', month: 'short', year: 'numeric' });
  };
  W65.fmtDateTime = function (iso) {
    if (!iso) return '';
    var d = new Date(iso); if (isNaN(d)) return '';
    return d.toLocaleString(lang === 'kn' ? 'kn-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  };
  W65.fmtBytes = function (n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(0) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  };
  W65.digits = function (s) { return String(s || '').replace(/\D/g, ''); };
  W65.telHref = function (s) { return 'tel:' + String(s || '').replace(/[^\d+]/g, ''); };
  W65.waHref = function (num, text) {
    var d = W65.digits(num); if (d.length === 10) d = '91' + d;
    return 'https://wa.me/' + d + (text ? '?text=' + encodeURIComponent(text) : '');
  };
  W65.safeHttpUrl = function (u) {
    try { var x = new URL(u); return (x.protocol === 'https:' || x.protocol === 'http:') ? x.href : ''; } catch (e) { return ''; }
  };
  W65.safeMapEmbed = function (u) {
    var s = W65.safeHttpUrl(u);
    return /^https:\/\/(www\.google\.com\/maps\/embed|maps\.google\.com\/maps)/.test(s) ? s : '';
  };

  /* ------------------------------------------------------------------
     Supabase
     ------------------------------------------------------------------ */
  var _db = null;
  W65.configured = function () {
    var s = String(CFG.SUPABASE_URL || '') + String(CFG.SUPABASE_ANON_KEY || '');
    return !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY) && !/PASTE_YOUR/.test(s);
  };
  W65.libLoaded = function () { return !!(window.supabase && window.supabase.createClient); };
  W65.problem = function () { return !W65.configured() ? 'config' : (!W65.libLoaded() ? 'lib' : null); };
  W65.db = function (persist) {
    if (_db) return _db;
    _db = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
      auth: { persistSession: !!persist, autoRefreshToken: !!persist, detectSessionInUrl: !!persist, storageKey: 'ward65-staff-auth' }
    });
    return _db;
  };
  W65.pubUrl = function (path) {
    if (!path) return '';
    return W65.db().storage.from('site-media').getPublicUrl(path).data.publicUrl;
  };

  var KNOWN = ['user_not_found', 'file_not_found', 'cannot_lock_yourself_out', 'rate_limited', 'invalid_name', 'invalid_mobile',
    'invalid_area', 'invalid_ward', 'invalid_category', 'invalid_description', 'invalid_landmark', 'invalid_request',
    'phone_not_verified', 'upload_window_closed', 'too_many_files', 'not_authorised', 'resolution_required',
    'invalid_status', 'invalid_role', 'not_found'];
  W65.errKey = function (err) {
    var m = err && (err.message || String(err));
    if (!m) return 'err.generic';
    for (var i = 0; i < KNOWN.length; i++) if (m.indexOf(KNOWN[i]) !== -1) return 'err.' + KNOWN[i];
    if (/failed to fetch|network|load failed|fetch/i.test(m)) return 'err.network';
    return 'err.generic';
  };
  W65.errText = function (err) { return t(W65.errKey(err)); };

  var _settingsP = null;
  W65.settings = function () {
    if (_settingsP) return _settingsP;
    _settingsP = (async function () {
      if (W65.problem()) return {};
      try {
        var r = await W65.db().from('site_settings').select('key,value');
        var m = {};
        (r.data || []).forEach(function (x) { m[x.key] = x.value; });
        return m;
      } catch (e) { console.error(e); return {}; }
    })();
    return _settingsP;
  };
  W65.resetSettings = function () { _settingsP = null; };

  /* Complaint IDs (never mobile numbers) are remembered on this device only,
     so a resident can find them again on the tracking page. */
  W65.recentCodes = function () {
    try { var a = JSON.parse(localStorage.getItem('ward65_codes') || '[]'); return Array.isArray(a) ? a.filter(function (c) { return /^W65-\d{4}-[A-Z0-9]{5}$/.test(c); }).slice(0, 5) : []; }
    catch (e) { return []; }
  };
  W65.rememberCode = function (code) {
    try {
      var a = W65.recentCodes().filter(function (c) { return c !== code; }); a.unshift(code);
      localStorage.setItem('ward65_codes', JSON.stringify(a.slice(0, 5)));
    } catch (e) { /* storage blocked */ }
  };

  /* ------------------------------------------------------------------
     Toasts, count-up, reveal
     ------------------------------------------------------------------ */
  W65.toast = function (msg, kind) {
    var box = $('#toasts');
    if (!box) { box = h('div', { id: 'toasts', class: 'toasts', 'aria-live': 'polite' }); document.body.appendChild(box); }
    var el = h('div', { class: 'toast ' + (kind || ''), role: kind === 'err' ? 'alert' : 'status' }, msg);
    box.appendChild(el);
    setTimeout(function () { el.remove(); }, 4500);
  };
  W65.countUp = function (el, n) {
    n = Number(n) || 0;
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || n === 0) { el.textContent = n.toLocaleString('en-IN'); return; }
    var start = performance.now(), dur = 900;
    (function tick(now) {
      var p = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(n * e).toLocaleString('en-IN');
      if (p < 1) requestAnimationFrame(tick);
    })(start);
  };
  var io = null;
  W65.reveal = function (root) {
    var els = W65.$$('.reveal:not(.in)', root);
    if (!('IntersectionObserver' in window)) { els.forEach(function (e) { e.classList.add('in'); }); return; }
    if (!io) io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: 0.08 });
    els.forEach(function (e) { io.observe(e); });
  };

  /* ------------------------------------------------------------------
     Lightbox (photos and videos)
     ------------------------------------------------------------------ */
  W65.lightbox = {
    open: function (items, start) {
      if (!items || !items.length) return;
      var idx = start || 0, opener = document.activeElement, startX = null;
      var stage = h('div', { class: 'lb-stage' });
      var cap = h('div', { class: 'lb-caption' });
      var count = h('div', { class: 'lb-count' });
      var prev = h('button', { class: 'lb-btn lb-prev', type: 'button', 'aria-label': t('lb.prev') });
      var next = h('button', { class: 'lb-btn lb-next', type: 'button', 'aria-label': t('lb.next') });
      var close = h('button', { class: 'lb-close', type: 'button', 'aria-label': t('lb.close') });
      prev.innerHTML = W65.icon('chevron-left'); next.innerHTML = W65.icon('chevron-right'); close.innerHTML = W65.icon('x');
      var box = h('div', { class: 'lightbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('lb.label') }, close, stage, cap, count);
      stage.append(prev, next);
      function show() {
        var it = items[idx];
        W65.$$('img,video', stage).forEach(function (n) { n.remove(); });
        var media = it.type === 'video'
          ? h('video', { src: it.src, controls: true, autoplay: true, playsinline: true })
          : h('img', { src: it.src, alt: it.caption || '' });
        stage.insertBefore(media, prev);
        cap.textContent = it.caption || '';
        count.textContent = items.length > 1 ? (idx + 1) + ' / ' + items.length : '';
        prev.hidden = next.hidden = items.length < 2;
      }
      function go(d) { idx = (idx + d + items.length) % items.length; show(); }
      function end() {
        document.removeEventListener('keydown', key);
        document.body.style.overflow = ''; box.remove();
        if (opener && opener.focus) opener.focus();
      }
      function key(e) {
        if (e.key === 'Escape') end();
        else if (e.key === 'ArrowLeft') go(-1);
        else if (e.key === 'ArrowRight') go(1);
      }
      prev.onclick = function () { go(-1); }; next.onclick = function () { go(1); }; close.onclick = end;
      box.addEventListener('click', function (e) { if (e.target === box || e.target === stage) end(); });
      box.addEventListener('touchstart', function (e) { startX = e.touches[0].clientX; }, { passive: true });
      box.addEventListener('touchend', function (e) {
        if (startX == null) return;
        var dx = e.changedTouches[0].clientX - startX; startX = null;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
      });
      document.addEventListener('keydown', key);
      document.body.style.overflow = 'hidden';
      document.body.appendChild(box);
      show(); close.focus();
    }
  };

  /* ------------------------------------------------------------------
     Images / videos chosen by residents and staff
     ------------------------------------------------------------------ */
  var OK_IMG = ['image/jpeg', 'image/png', 'image/webp'];
  W65.extFor = function (mime) {
    return { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' }[mime] || '';
  };
  /* Do the first bytes really belong to a JPEG, PNG or WebP picture? (a renamed text file fails) */
  function looksLikeImage(file) {
    return new Promise(function (resolve) {
      try {
        var fr = new FileReader();
        fr.onload = function () {
          var b = new Uint8Array(fr.result);
          var jpg = b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF;
          var png = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47;
          var webp = b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
          resolve(jpg || png || webp);
        };
        fr.onerror = function () { resolve(false); };
        fr.readAsArrayBuffer(file.slice(0, 12));
      } catch (e) { resolve(false); }
    });
  }
  /* Decode with whatever the browser offers; throws when the file is not a readable picture. */
  async function decodeImage(file) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { /* try the next way */ }
      try { return await createImageBitmap(file); } catch (e) { /* try the next way */ }
    }
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('unsupported_image')); };
      img.src = url;
    });
  }
  /* opts.original = keep the file byte-for-byte (banner, representative photos) */
  W65.prepareImage = async function (file, opts) {
    opts = opts || {};
    var limit = (opts.maxMB || 10) * 1048576;
    if (opts.original) {
      if (OK_IMG.indexOf(file.type) === -1) throw new Error('unsupported_image');
      if (file.size > limit) throw new Error('too_large');
      if (!(await looksLikeImage(file))) throw new Error('unsupported_image');
      return { blob: file, type: file.type, ext: W65.extFor(file.type) };
    }
    var bmp = await decodeImage(file);                       // throws for anything that is not a real picture
    var bw = bmp.naturalWidth || bmp.width, bh = bmp.naturalHeight || bmp.height;
    if (!bw || !bh) throw new Error('unsupported_image');
    var max = opts.maxDim || 1600;
    var scale = Math.min(1, max / Math.max(bw, bh));
    var w = Math.max(1, Math.round(bw * scale)), hgt = Math.max(1, Math.round(bh * scale));
    var c = document.createElement('canvas'); c.width = w; c.height = hgt;
    var ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, hgt); ctx.drawImage(bmp, 0, 0, w, hgt);
    if (bmp.close) bmp.close();
    var blob = await new Promise(function (res) { c.toBlob(res, 'image/jpeg', 0.84); });
    if (!blob) throw new Error('unsupported_image');
    return { blob: blob, type: 'image/jpeg', ext: 'jpg' };
  };

  /* ------------------------------------------------------------------
     Page chrome: top bar, header, mobile menu, footer
     ------------------------------------------------------------------ */
  var MARK = '<svg class="brand-mark" viewBox="0 0 64 64" role="img" aria-label="Ward 65"><rect width="64" height="64" rx="18" fill="#0b2a5b"/>' +
    '<path d="M10 24a24 24 0 0 1 44 0" fill="none" stroke="#f28c1b" stroke-width="4" stroke-linecap="round"/>' +
    '<path d="M10 42a24 24 0 0 0 44 0" fill="none" stroke="#1b8a4b" stroke-width="4" stroke-linecap="round"/>' +
    '<text x="32" y="39" text-anchor="middle" font-family="Plus Jakarta Sans,Arial,sans-serif" font-weight="800" font-size="21" fill="#fff">65</text></svg>';
  W65.MARK = MARK;

  var NAV = [
    { href: 'index.html', page: 'home', key: 'nav.home', icon: 'home' },
    { href: 'complaint.html', page: 'complaint', key: 'nav.complaint', icon: 'clipboard', cta: true },
    { href: 'track.html', page: 'track', key: 'nav.track', icon: 'search' },
    { href: 'works.html', page: 'works', key: 'nav.works', icon: 'hard-hat' },
    { href: 'gallery.html', page: 'gallery', key: 'nav.gallery', icon: 'images' },
    { href: 'updates.html', page: 'updates', key: 'nav.updates', icon: 'newspaper' },
    { href: 'contact.html', page: 'contact', key: 'nav.contact', icon: 'phone' }
  ];

  W65.renderChrome = function () {
    var page = document.body.getAttribute('data-page');
    if (page === 'admin') return;
    var hdr = $('#site-header'), ftr = $('#site-footer');
    if (!hdr || !ftr) return;

    function link(n, mobile) {
      var cur = n.page === page ? ' aria-current="page"' : '';
      var cls = !mobile && n.cta ? ' class="nav-cta"' : '';
      return '<a href="' + n.href + '"' + cur + cls + '>' + (mobile ? W65.icon(n.icon) : '') +
        '<span data-i18n="' + n.key + '"></span></a>';
    }
    hdr.innerHTML =
      '<div class="topbar"><div class="container">' +
      '<div class="topbar-left"><span data-i18n="top.hdmc"></span><span class="hide-sm" id="topPhone"></span></div>' +
      '<div class="lang-switch" role="group" data-i18n-aria="lang.label">' +
      '<button type="button" data-lang="en" aria-pressed="true">English</button>' +
      '<button type="button" data-lang="kn" aria-pressed="false" lang="kn">ಕನ್ನಡ</button></div></div></div>' +
      '<header class="site-header"><div class="container header-inner">' +
      '<a class="brand" href="index.html" data-i18n-aria="brand.home">' + MARK +
      '<span class="brand-text"><strong data-i18n="brand.name"></strong><span data-i18n="top.hdmc"></span></span></a>' +
      '<nav class="main-nav" data-i18n-aria="nav.label"><ul>' + NAV.map(function (n) { return '<li>' + link(n, false) + '</li>'; }).join('') + '</ul></nav>' +
      '<button class="menu-btn" type="button" id="menuBtn" aria-expanded="false" aria-controls="mobileNav" data-i18n-aria="nav.menu">' + W65.icon('menu') + '</button>' +
      '</div></header>' +
      '<div class="mobile-nav" id="mobileNav" role="dialog" aria-modal="true" data-i18n-aria="nav.menu">' +
      '<div class="mobile-nav-head"><a class="brand" href="index.html">' + MARK + '<span class="brand-text"><strong data-i18n="brand.name"></strong></span></a>' +
      '<button class="menu-btn" type="button" id="menuClose" data-i18n-aria="nav.close">' + W65.icon('x') + '</button></div>' +
      NAV.map(function (n) { return link(n, true); }).join('') + '</div>';

    var qlinks = [
      ['index.html', 'nav.home'], ['complaint.html', 'nav.complaint'], ['track.html', 'nav.track'],
      ['works.html', 'nav.works'], ['gallery.html', 'nav.gallery'], ['updates.html', 'nav.updates'], ['contact.html', 'nav.contact.full']
    ];
    ftr.innerHTML =
      '<footer class="site-footer"><div class="container footer-top">' +
      '<div class="footer-brand"><a class="brand" href="index.html" style="margin-bottom:1rem">' + MARK + '</a>' +
      '<strong data-i18n="brand.name"></strong><div data-i18n="top.hdmc"></div><div data-i18n="footer.city"></div></div>' +
      '<div><h4 data-i18n="footer.quick"></h4><ul class="footer-links">' +
      qlinks.map(function (q) { return '<li><a href="' + q[0] + '">' + W65.icon('chevron-right') + '<span data-i18n="' + q[1] + '"></span></a></li>'; }).join('') +
      '</ul></div>' +
      '<div><h4 data-i18n="footer.contact"></h4><div class="footer-contact" id="footerContact"><span data-i18n="footer.contact.soon"></span></div></div></div>' +
      '<div class="container footer-tagline" data-i18n="footer.tagline"></div>' +
      '<div class="footer-bottom"><div class="container">&copy; ' + new Date().getFullYear() +
      ' <span data-i18n="brand.name"></span> &middot; <span data-i18n="top.hdmc"></span> &middot; ' +
      '<a href="admin.html" data-i18n="footer.staff"></a></div></div></footer>';

    // language switch
    W65.$$('.lang-switch button').forEach(function (b) {
      b.addEventListener('click', function () { W65.setLang(b.getAttribute('data-lang')); });
    });
    // mobile menu
    var mn = $('#mobileNav'), mb = $('#menuBtn');
    function openMenu(o) {
      mn.classList.toggle('open', o); mb.setAttribute('aria-expanded', String(o));
      document.body.style.overflow = o ? 'hidden' : '';
      if (o) $('#menuClose').focus(); else mb.focus();
    }
    mb.addEventListener('click', function () { openMenu(true); });
    $('#menuClose').addEventListener('click', function () { openMenu(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && mn.classList.contains('open')) openMenu(false); });
    W65.$$('a', mn).forEach(function (a) { a.addEventListener('click', function () { document.body.style.overflow = ''; }); });

    // not configured banner
    var prob = W65.problem();
    if (prob) {
      var bar = h('div', { class: 'setup-banner', role: 'status' });
      bar.setAttribute('data-i18n', prob === 'config' ? 'setup.config' : 'setup.lib');
      hdr.appendChild(bar);
    }
    // footer + top bar contact from settings (repainted when the language changes, so the Kannada address shows)
    var siteSettings = null;
    function paintContact() {
      var s = siteSettings; if (!s) return;
      var box = $('#footerContact'); if (!box) return;
      var rows = [];
      if (s.office_address || s.office_address_kn) rows.push(['map-pin', W65.esc(W65.lang() === 'kn' && s.office_address_kn ? s.office_address_kn : s.office_address)]);
      if (s.office_phone) rows.push(['phone', '<a href="' + W65.esc(W65.telHref(s.office_phone)) + '">' + W65.esc(s.office_phone) + '</a>']);
      if (s.office_email) rows.push(['mail', '<a href="mailto:' + W65.esc(s.office_email) + '">' + W65.esc(s.office_email) + '</a>']);
      if (rows.length) {
        box.innerHTML = rows.map(function (r) { return '<div>' + W65.icon(r[0]) + '<span>' + r[1] + '</span></div>'; }).join('');
      }
      var tp = $('#topPhone');
      if (tp && s.office_phone) tp.innerHTML = W65.icon('phone') + ' <a href="' + W65.esc(W65.telHref(s.office_phone)) + '">' + W65.esc(s.office_phone) + '</a>';
    }
    W65.settings().then(function (s) { siteSettings = s; paintContact(); });
    W65.onLang(paintContact);
  };

  /* ------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------ */
  document.documentElement.setAttribute('lang', lang);
  W65.renderChrome();
  W65.applyIcons();
  W65.$$('.lang-switch button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === lang)); });
  W65.applyI18n();
  W65.reveal();
})();
