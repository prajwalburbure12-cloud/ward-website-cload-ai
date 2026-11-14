/* Shared card renderers used by several public pages. Everything goes through
   textContent / attributes, so database text can never inject markup. */
(function () {
  'use strict';
  var W65 = window.W65, h = W65.h, t = W65.t;

  function urls(paths) { return (paths || []).filter(Boolean).map(function (p) { return W65.pubUrl(p); }); }
  function meta(icon, text) {
    if (!text) return null;
    var s = h('span', { class: 'meta' }); s.innerHTML = W65.icon(icon); s.appendChild(document.createTextNode(' ' + text)); return s;
  }
  function shot(src, label, onclick, extra) {
    var b = h('button', { type: 'button', class: 'g-shot', 'aria-label': label, onclick: onclick },
      h('img', { src: src, alt: '', loading: 'lazy', decoding: 'async' }), extra || null);
    return b;
  }
  function catOf(key) { return W65.WORK_CATEGORIES.filter(function (c) { return c.key === key; })[0]; }

  var R = (W65.R = {});

  /* ---- Announcement / update card ---- */
  R.annCard = function (a, opts) {
    opts = opts || {};
    var title = W65.loc(a, 'title'), body = W65.loc(a, 'body'), loc = W65.loc(a, 'location');
    var imgs = urls(a.image_paths);
    var items = imgs.map(function (s) { return { src: s, caption: title }; });
    var card = h('article', { class: 'news-card reveal' + (a.is_pinned ? ' pinned' : '') });
    if (imgs.length) {
      var strip = h('div', { class: 'news-imgs' + (imgs.length === 1 ? ' single' : '') });
      imgs.slice(0, 3).forEach(function (s, i) {
        var more = (i === 2 && imgs.length > 3) ? h('span', { class: 'g-more', text: '+' + (imgs.length - 3) }) : null;
        strip.appendChild(shot(s, t('gal.view') + ': ' + title, function () { W65.lightbox.open(items, i); }, more));
      });
      card.appendChild(strip);
    }
    var head = h('div', { class: 'meta-row' },
      h('span', { class: 'badge badge-type-' + a.type, text: t('ann.type.' + a.type) }),
      a.is_pinned ? h('span', { class: 'badge badge-saffron', text: t('ann.pinned') }) : null,
      meta('calendar', W65.fmtDate(a.event_date)), meta('map-pin', loc));
    var p = body ? h('p', { class: opts.clamp ? 'clamp-3' : '', text: body }) : null;
    card.appendChild(h('div', { class: 'news-body' }, head, h('h3', { text: title }), p));
    return card;
  };

  /* ---- Development work card (list view) ---- */
  R.workCard = function (w) {
    var title = W65.loc(w, 'title'), desc = W65.loc(w, 'description');
    var all = [];
    if (w.before_path) all.push({ src: W65.pubUrl(w.before_path), caption: t('gal.before') + ' — ' + title });
    if (w.after_path) all.push({ src: W65.pubUrl(w.after_path), caption: t('gal.after') + ' — ' + title });
    urls(w.photo_paths).forEach(function (s) { all.push({ src: s, caption: title }); });
    var thumbIdx = w.after_path ? (w.before_path ? 1 : 0) : 0;
    var thumb;
    if (all.length) {
      thumb = h('button', { type: 'button', class: 'work-thumb', 'aria-label': t('gal.view') + ': ' + title, onclick: function () { W65.lightbox.open(all, thumbIdx); } },
        h('img', { src: all[thumbIdx].src, alt: '', loading: 'lazy', decoding: 'async' }));
    } else {
      thumb = h('div', { class: 'work-thumb', 'aria-hidden': 'true' }); thumb.innerHTML = W65.icon('hard-hat');
    }
    var c = catOf(w.category);
    var card = h('article', { class: 'work-card reveal' }, thumb,
      h('div', { class: 'work-body' },
        h('div', { class: 'meta-row' },
          h('span', { class: 'chip chip-' + w.status, text: t('wstatus.' + w.status) }),
          c ? h('span', { class: 'badge', text: t('wcat.' + w.category) }) : null),
        h('h3', { text: title }),
        h('div', { class: 'meta-row' }, meta('map-pin', W65.areaLabel(w.area)), meta('calendar', w.completed_on ? t('works.completedOn') + ' ' + W65.fmtDate(w.completed_on) : '')),
        desc ? h('p', { text: desc }) : null));
    return card;
  };

  /* ---- Gallery card (photos, before / after) ---- */
  R.galleryCard = function (w) {
    var title = W65.loc(w, 'title'), desc = W65.loc(w, 'description');
    var items = [];
    if (w.before_path) items.push({ src: W65.pubUrl(w.before_path), caption: t('gal.before') + ' — ' + title });
    if (w.after_path) items.push({ src: W65.pubUrl(w.after_path), caption: t('gal.after') + ' — ' + title });
    var extra = urls(w.photo_paths).map(function (s) { return { src: s, caption: title }; });
    items = items.concat(extra);
    var pair = w.before_path && w.after_path;
    var media = h('div', { class: 'g-media' + (pair ? ' pair' : '') });
    function tag(txt, cls) { return h('span', { class: 'g-tag ' + (cls || ''), text: txt }); }
    if (pair) {
      media.appendChild(shot(items[0].src, t('gal.before') + ': ' + title, function () { W65.lightbox.open(items, 0); }, tag(t('gal.before'))));
      media.appendChild(shot(items[1].src, t('gal.after') + ': ' + title, function () { W65.lightbox.open(items, 1); }, tag(t('gal.after'), 'after')));
    } else {
      var only = items[0];
      var label = w.after_path ? tag(t('gal.after'), 'after') : (w.before_path ? tag(t('gal.before')) : null);
      var more = items.length > 1 ? h('span', { class: 'g-more', text: '+' + (items.length - 1) }) : null;
      var b = shot(only.src, t('gal.view') + ': ' + title, function () { W65.lightbox.open(items, 0); }, label);
      if (more) b.appendChild(more);
      media.appendChild(b);
    }
    var body = h('div', { class: 'g-body' },
      h('h3', { text: title }),
      h('div', { class: 'meta-row' }, meta('map-pin', W65.areaLabel(w.area)), meta('hard-hat', t('wcat.' + w.category)), meta('calendar', w.completed_on ? W65.fmtDate(w.completed_on) : '')),
      desc ? h('p', { class: 'clamp-3', text: desc }) : null);
    if (extra.length && (pair || items.length > 1)) {
      body.appendChild(h('button', { type: 'button', class: 'link-btn', onclick: function () { W65.lightbox.open(items, 0); },
        text: t('gal.allPhotos', { n: items.length }) }));
    }
    return h('article', { class: 'g-card reveal' }, media, body);
  };

  /* ---- Filter chips: items = [{key,label}], single choice, calls onChange(key) ---- */
  R.chips = function (box, items, selected, onChange) {
    box.textContent = '';
    items.forEach(function (it) {
      var b = h('button', { type: 'button', class: 'fchip', 'aria-pressed': String(it.key === selected), text: it.label, onclick: function () {
        W65.$$('.fchip', box).forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true'); onChange(it.key);
      } });
      box.appendChild(b);
    });
  };

  R.hasPhotos = function (w) { return !!(w.before_path || w.after_path || (w.photo_paths && w.photo_paths.length)); };

  /* ---- Representative card ---- */
  R.repCard = function (r) {
    var name = W65.loc(r, 'name'), des = W65.loc(r, 'designation'), intro = W65.loc(r, 'intro'), work = W65.loc(r, 'work');
    var photo;
    if (r.photo_path) {
      var src = W65.pubUrl(r.photo_path);
      photo = h('button', { type: 'button', class: 'rep-photo', 'aria-label': t('rep.enlarge', { name: name }),
        onclick: function () { W65.lightbox.open([{ src: src, caption: name + ' — ' + des }], 0); } },
        h('img', { src: src, alt: name, loading: 'lazy', decoding: 'async' }));
    } else {
      photo = h('div', { class: 'rep-photo no-photo', role: 'img', 'aria-label': name }); photo.innerHTML = W65.icon('user');
    }
    var contact = h('div', { class: 'rep-contact' });
    if (r.phone) { var a1 = h('a', { href: W65.telHref(r.phone) }); a1.innerHTML = W65.icon('phone'); a1.appendChild(document.createTextNode(' ' + r.phone)); contact.appendChild(a1); }
    if (r.email) { var a2 = h('a', { href: 'mailto:' + r.email }); a2.innerHTML = W65.icon('mail'); a2.appendChild(document.createTextNode(' ' + r.email)); contact.appendChild(a2); }
    return h('article', { class: 'rep-card reveal' }, photo,
      h('div', { class: 'rep-body' },
        h('h3', { text: name }),
        h('span', { class: 'badge ' + (r.role_key === 'mla' ? 'badge-saffron' : 'badge-green'), text: des }),
        intro ? h('p', { text: intro }) : null,
        work ? h('div', { class: 'rep-sub', text: t('rep.work') }) : null,
        work ? h('p', { text: work, style: 'white-space:pre-line' }) : null,
        contact.children.length ? contact : null));
  };
})();
