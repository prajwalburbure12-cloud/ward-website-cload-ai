/* Contact page. Every item appears only when the administrator has entered it
   (Admin -> Settings / Representatives) - nothing is invented. */
(function () {
  'use strict';
  var W65 = window.W65, h = W65.h, t = W65.t, $ = W65.$;
  var settings = null, reps = null;

  function infoRow(icon, label, valueNode) {
    var ic = h('span', { class: 'ir-icon' }); ic.innerHTML = W65.icon(icon);
    return h('div', { class: 'info-row' }, ic, h('div', null, h('b', { text: label }), valueNode));
  }
  function link(href, text) { return h('a', { href: href, text: text }); }
  function pending(box, key) { box.textContent = ''; box.appendChild(h('p', { class: 'hint', text: t(key), style: 'margin:0' })); }

  function renderOffice() {
    var s = settings || {}, box = $('#officeInfo'), act = $('#officeActions');
    box.textContent = ''; act.textContent = '';
    var kn = W65.lang() === 'kn';
    var addr = (kn && s.office_address_kn) ? s.office_address_kn : s.office_address;
    var hours = (kn && s.office_hours_kn) ? s.office_hours_kn : s.office_hours;
    var rows = 0;
    function add(r) { box.appendChild(r); rows++; }
    if (addr) add(infoRow('map-pin', t('contact.address'), h('div', { text: addr, style: 'font-weight:600;white-space:pre-line' })));
    if (s.office_phone) add(infoRow('phone', t('contact.phone'), link(W65.telHref(s.office_phone), s.office_phone)));
    if (s.office_email) add(infoRow('mail', t('contact.email'), link('mailto:' + s.office_email, s.office_email)));
    if (hours) add(infoRow('clock', t('contact.hours'), h('div', { text: hours, style: 'font-weight:600;white-space:pre-line' })));
    if (!rows) pending(box, 'contact.office.soon');

    if (s.office_phone) {
      var call = h('a', { class: 'btn btn-primary', href: W65.telHref(s.office_phone) }); call.innerHTML = W65.icon('phone'); call.appendChild(h('span', { text: t('contact.call') })); act.appendChild(call);
    }
    if (s.whatsapp_number) {
      var wa = h('a', { class: 'btn wa-btn', href: W65.waHref(s.whatsapp_number, t('contact.wa.text')), target: '_blank', rel: 'noopener noreferrer' });
      wa.innerHTML = W65.icon('message-circle'); wa.appendChild(h('span', { text: t('contact.whatsapp') })); act.appendChild(wa);
    }
  }

  function renderReps() {
    var box = $('#repInfo'); box.textContent = '';
    var list = (reps || []).filter(function (r) { return r.phone || r.email; });
    if (!list.length) return pending(box, 'contact.reps.soon');
    list.forEach(function (r) {
      var wrap = h('div', null);
      if (r.phone) wrap.appendChild(h('div', null, link(W65.telHref(r.phone), r.phone)));
      if (r.email) wrap.appendChild(h('div', null, link('mailto:' + r.email, r.email)));
      box.appendChild(infoRow('user', W65.loc(r, 'name') + ' — ' + W65.loc(r, 'designation'), wrap));
    });
  }

  function renderMap() {
    var s = settings || {}, card = $('#mapCard'), box = $('#mapBox'); box.textContent = '';
    var embed = W65.safeMapEmbed(s.maps_embed_url), open = W65.safeHttpUrl(s.maps_url);
    card.hidden = !(embed || open);
    if (embed) box.appendChild(h('iframe', { class: 'map-frame', src: embed, title: t('contact.map'), loading: 'lazy', referrerpolicy: 'no-referrer-when-downgrade', allowfullscreen: true }));
    if (open) {
      var a = h('a', { class: 'btn btn-secondary', href: open, target: '_blank', rel: 'noopener noreferrer', style: 'margin-top:.9rem' });
      a.innerHTML = W65.icon('external-link'); a.appendChild(h('span', { text: t('contact.openMap') })); box.appendChild(a);
    }
  }

  function renderEmergency() {
    var s = settings || {}, box = $('#emergencyInfo'); box.textContent = '';
    var kn = W65.lang() === 'kn';
    var info = (kn && s.emergency_info_kn) ? s.emergency_info_kn : s.emergency_info;
    if (s.emergency_phone) {
      var p = h('p', { style: 'font-weight:700;font-size:1.15rem' }, t('contact.emergency.ward') + ' ', h('a', { href: W65.telHref(s.emergency_phone), text: s.emergency_phone }));
      box.appendChild(p);
    }
    if (info) box.appendChild(h('p', { text: info, style: 'white-space:pre-line' }));
  }

  function renderAll() { renderOffice(); renderReps(); renderMap(); renderEmergency(); }
  renderAll();
  W65.onLang(renderAll);

  if (W65.problem()) return;
  W65.settings().then(function (s) { settings = s; renderOffice(); renderMap(); renderEmergency(); });
  W65.db().from('representatives').select('*').order('display_order')
    .then(function (r) { if (r.error) throw r.error; reps = r.data || []; renderReps(); })
    .catch(function (e) { console.error(e); });
})();
