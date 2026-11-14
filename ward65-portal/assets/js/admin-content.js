/* ADMIN (administrators only) - development works / gallery, announcements,
   representatives, website settings, staff accounts */
(function () {
  'use strict';
  var W65 = window.W65, h = W65.h, A = W65.admin;

  /* ---------------- shared list + form plumbing ---------------- */
  function crud(box, cfg) {
    var list = h('div', { class: 'item-list' });
    box.appendChild(h('div', { class: 'btn-row', style: 'margin-bottom:1rem' }, A.btn('btn-green', 'plus', cfg.addLabel, function () { cfg.form(null, reload); })));
    box.appendChild(list);
    async function reload() {
      list.textContent = ''; list.appendChild(h('div', { class: 'skeleton', style: 'height:90px' }));
      var r = await cfg.query();
      list.textContent = '';
      if (r.error) { list.appendChild(h('div', { class: 'alert alert-error' }, A.errMsg(r.error))); return; }
      if (!r.data.length) { list.appendChild(A.empty(cfg.icon, cfg.emptyText)); return; }
      r.data.forEach(function (row) {
        var thumb = h('div', { class: 'thumb' });
        var src = cfg.thumb(row);
        if (src) thumb.appendChild(h('img', { src: A.siteUrl(src), alt: '', loading: 'lazy' })); else thumb.appendChild(A.icon(cfg.icon));
        var info = cfg.info(row);
        list.appendChild(h('div', { class: 'item-row' }, thumb,
          h('div', { class: 'grow' }, h('b', { text: info.title }), h('div', { class: 'cell-sub', text: info.meta }), info.badges || null),
          h('div', { class: 'actions' },
            A.btn('btn-secondary btn-sm', 'edit', 'Edit', function () { cfg.form(row, reload); }),
            A.btn('btn-ghost btn-sm', 'trash', 'Delete', async function () {
              if (!window.confirm('Delete “' + info.title + '”? This cannot be undone.')) return;
              try {
                var d = await A.db().from(cfg.table).delete().eq('id', row.id);
                if (d.error) throw d.error;
                await A.removeSite(cfg.files(row)); W65.toast('Deleted.', 'ok'); reload();
              } catch (e) { A.fail(e); }
            }))));
      });
    }
    reload();
  }
  function badge(text, cls) { return h('span', { class: 'badge ' + (cls || ''), text: text, style: 'margin-top:.3rem' }); }
  function pubBadge(row) { return row.is_published ? null : badge('Hidden from website', 'badge-saffron'); }
  function arr(a) { return Array.isArray(a) ? a : []; }

  /* Save helper: runs the work, shows errors, cleans up uploads that were never used. */
  async function saveRow(btn, errBox, fn) {
    errBox.textContent = ''; A.busy(btn, true);
    var fresh = [];
    try { await fn(fresh); return true; }
    catch (e) {
      if (!(e && e.message === 'required')) console.error(e);    // plain "please fill this in" messages are not errors
      errBox.textContent = (e && e.message === 'required') ? e.detail : A.errMsg(e);
      await A.removeSite(fresh); return false;
    } finally { A.busy(btn, false); }
  }
  function need(cond, msg) { if (!cond) { var e = new Error('required'); e.detail = msg; throw e; } }
  function trimOrNull(v) { v = String(v || '').trim(); return v === '' ? null : v; }
  function grid(children) { return h('div', { class: 'form-grid cols-2' }, children); }

  /* ===================================================================
     Development works  (also feeds the public gallery)
     =================================================================== */
  var WCATS = W65.WORK_CATEGORIES.map(function (c) { return [c.key, W65.t('wcat.' + c.key)]; });
  var WSTAT = W65.WORK_STATUSES.map(function (s) { return [s, W65.t('wstatus.' + s)]; });

  function workForm(row, done) {
    var d = A.drawer({ label: row ? 'Edit development work' : 'Add development work' });
    d.head.appendChild(h('h2', { text: row ? 'Edit development work' : 'Add development work', style: 'margin:0;font-size:1.3rem' }));
    var title = A.input('text', row && row.title, { maxlength: 200 }), titleKn = A.input('text', row && row.title_kn, { maxlength: 200, lang: 'kn' });
    var area = A.input('text', row && row.area, { list: 'wAreas', maxlength: 150 });
    var areas = h('datalist', { id: 'wAreas' }, W65.AREAS.map(function (a) { return h('option', { value: a.name }); }));
    var cat = A.select(WCATS, row ? row.category : 'road'), st = A.select(WSTAT, row ? row.status : 'completed');
    var date = A.input('date', row && row.completed_on);
    var desc = A.textarea(row && row.description, { rows: 4, maxlength: 2000 }), descKn = A.textarea(row && row.description_kn, { rows: 4, maxlength: 2000, lang: 'kn' });
    var before = A.photoSlot('“Before” photo', row && row.before_path), after = A.photoSlot('“After” photo', row && row.after_path);
    var more = A.photoList('More photos', row && row.photo_paths, { max: 12 });
    var pub = A.check('Show on the public website', row ? row.is_published : true);
    var err = h('div', { class: 'error-text', role: 'alert' });
    var save = A.btn('btn-green btn-lg', 'check', 'Save', async function () {
      var ok = await saveRow(save, err, async function (fresh) {
        need(title.value.trim().length >= 3, 'Please enter a title.'); need(area.value.trim(), 'Please enter the area or street.');
        var b = await before.commit('works'), a = await after.commit('works'), m = await more.commit('works');
        [b.path, a.path].concat(m.paths).forEach(function (p) { if (p && !(row && ([row.before_path, row.after_path].concat(arr(row.photo_paths))).indexOf(p) !== -1)) fresh.push(p); });
        var payload = { title: title.value.trim(), title_kn: trimOrNull(titleKn.value), description: trimOrNull(desc.value), description_kn: trimOrNull(descKn.value),
          area: area.value.trim(), category: cat.value, status: st.value, completed_on: date.value || null,
          before_path: b.path, after_path: a.path, photo_paths: m.paths, is_published: pub.input.checked };
        var r = row ? await A.db().from('development_works').update(payload).eq('id', row.id) : await A.db().from('development_works').insert(payload);
        if (r.error) throw r.error;
        await A.removeSite(b.cleanup.concat(a.cleanup, m.cleanup));
      });
      if (ok) { W65.toast('Saved.', 'ok'); d.close(); done(); }
    });
    d.body.appendChild(h('div', { class: 'form-grid' },
      A.field('Title (English)', title), A.field('Title (Kannada, optional)', titleKn), grid([A.field('Area / street', area), A.field('Category', cat)]),
      grid([A.field('Status', st), A.field('Completed on (if completed)', date)]), areas,
      A.field('Description (English)', desc), A.field('Description (Kannada, optional)', descKn),
      grid([before.el, after.el]), more.el, pub.el, err, h('div', null, save)));
  }
  A.register('works', 'Development works & gallery', 'images', function (box) {
    box.appendChild(h('p', { class: 'hint', text: 'Works with photographs also appear in the public Gallery. Add “before” and “after” photos to show completed development.' }));
    crud(box, {
      table: 'development_works', icon: 'hard-hat', addLabel: 'Add development work', emptyText: 'No development works yet. Add the first one.',
      query: function () { return A.db().from('development_works').select('*').order('created_at', { ascending: false }).limit(500); },
      thumb: function (r) { return r.after_path || r.before_path || arr(r.photo_paths)[0]; },
      info: function (r) { return { title: r.title, meta: r.area + ' · ' + W65.t('wcat.' + r.category) + ' · ' + W65.t('wstatus.' + r.status), badges: pubBadge(r) }; },
      files: function (r) { return [r.before_path, r.after_path].concat(arr(r.photo_paths)); }, form: workForm
    });
  }, true);

  /* ===================================================================
     Announcements
     =================================================================== */
  var ATYPES = W65.ANN_TYPES.map(function (k) { return [k, W65.t('ann.type.' + k)]; });
  function newsForm(row, done) {
    var d = A.drawer({ label: row ? 'Edit announcement' : 'New announcement' });
    d.head.appendChild(h('h2', { text: row ? 'Edit announcement' : 'New announcement', style: 'margin:0;font-size:1.3rem' }));
    var title = A.input('text', row && row.title, { maxlength: 200 }), titleKn = A.input('text', row && row.title_kn, { maxlength: 200, lang: 'kn' });
    var type = A.select(ATYPES, row ? row.type : 'announcement');
    var date = A.input('date', row ? row.event_date : new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
    var loc = A.input('text', row && row.location, { maxlength: 200 }), locKn = A.input('text', row && row.location_kn, { maxlength: 200, lang: 'kn' });
    var body = A.textarea(row && row.body, { rows: 5, maxlength: 4000 }), bodyKn = A.textarea(row && row.body_kn, { rows: 5, maxlength: 4000, lang: 'kn' });
    var imgs = A.photoList('Photographs', row && row.image_paths, { max: 8 });
    var pin = A.check('Pin to the top', row && row.is_pinned), pub = A.check('Show on the public website', row ? row.is_published : true);
    var err = h('div', { class: 'error-text', role: 'alert' });
    var save = A.btn('btn-green btn-lg', 'check', 'Publish', async function () {
      var ok = await saveRow(save, err, async function (fresh) {
        need(title.value.trim().length >= 3, 'Please enter a title.'); need(date.value, 'Please choose a date.');
        var m = await imgs.commit('news');
        m.paths.forEach(function (p) { if (!(row && arr(row.image_paths).indexOf(p) !== -1)) fresh.push(p); });
        var payload = { title: title.value.trim(), title_kn: trimOrNull(titleKn.value), body: trimOrNull(body.value), body_kn: trimOrNull(bodyKn.value), type: type.value,
          location: trimOrNull(loc.value), location_kn: trimOrNull(locKn.value), event_date: date.value, image_paths: m.paths, is_pinned: pin.input.checked, is_published: pub.input.checked };
        var r = row ? await A.db().from('announcements').update(payload).eq('id', row.id) : await A.db().from('announcements').insert(payload);
        if (r.error) throw r.error;
        await A.removeSite(m.cleanup);
      });
      if (ok) { W65.toast('Saved.', 'ok'); d.close(); done(); }
    });
    d.body.appendChild(h('div', { class: 'form-grid' },
      A.field('Title (English)', title), A.field('Title (Kannada, optional)', titleKn), grid([A.field('Type', type), A.field('Date', date)]),
      grid([A.field('Location (English)', loc), A.field('Location (Kannada, optional)', locKn)]),
      A.field('Details (English)', body), A.field('Details (Kannada, optional)', bodyKn), imgs.el, pin.el, pub.el, err, h('div', null, save)));
  }
  A.register('news', 'Announcements', 'megaphone', function (box) {
    crud(box, {
      table: 'announcements', icon: 'newspaper', addLabel: 'New announcement', emptyText: 'No announcements yet.',
      query: function () { return A.db().from('announcements').select('*').order('event_date', { ascending: false }).order('created_at', { ascending: false }).limit(500); },
      thumb: function (r) { return arr(r.image_paths)[0]; },
      info: function (r) { return { title: r.title, meta: W65.t('ann.type.' + r.type) + ' · ' + W65.fmtDate(r.event_date) + (r.location ? ' · ' + r.location : ''), badges: r.is_published ? (r.is_pinned ? badge('Pinned', 'badge-saffron') : null) : badge('Hidden from website', 'badge-saffron') }; },
      files: function (r) { return arr(r.image_paths); }, form: newsForm
    });
  }, true);

  /* ===================================================================
     Representatives
     =================================================================== */
  var ROLES = [['corporator', 'Corporator'], ['second_corporator', 'Second corporator'], ['mla', 'MLA'], ['other', 'Other']];
  function repForm(row, done) {
    var d = A.drawer({ label: row ? 'Edit representative' : 'Add representative' });
    d.head.appendChild(h('h2', { text: row ? 'Edit representative' : 'Add representative', style: 'margin:0;font-size:1.3rem' }));
    var name = A.input('text', row && row.name, { maxlength: 150 }), nameKn = A.input('text', row && row.name_kn, { maxlength: 150, lang: 'kn' });
    var role = A.select(ROLES, row ? row.role_key : 'other');
    var des = A.input('text', row && row.designation, { maxlength: 150 }), desKn = A.input('text', row && row.designation_kn, { maxlength: 150, lang: 'kn' });
    var intro = A.textarea(row && row.intro, { rows: 3, maxlength: 1000 }), introKn = A.textarea(row && row.intro_kn, { rows: 3, maxlength: 1000, lang: 'kn' });
    var work = A.textarea(row && row.work, { rows: 5, maxlength: 3000 }), workKn = A.textarea(row && row.work_kn, { rows: 5, maxlength: 3000, lang: 'kn' });
    var phone = A.input('tel', row && row.phone, { maxlength: 40 }), email = A.input('email', row && row.email, { maxlength: 120 });
    var order = A.input('number', row ? row.display_order : 10, { min: 0, max: 99 });
    var photo = A.photoSlot('Photograph', row && row.photo_path, { original: true, hint: 'Saved and shown exactly as supplied – it is not edited, filtered or regenerated. The card shows it cropped to fit; visitors can tap it to see the full picture.' });
    // The hidden "second corporator" placeholder starts ticked, so filling in the details publishes the card.
    var placeholder = !!(row && !row.is_published && row.role_key === 'second_corporator' && /name to be added/i.test(row.name));
    var pub = A.check('Show on the public website', row ? (row.is_published || placeholder) : true);
    var err = h('div', { class: 'error-text', role: 'alert' });
    var save = A.btn('btn-green btn-lg', 'check', 'Save', async function () {
      var ok = await saveRow(save, err, async function (fresh) {
        need(name.value.trim().length >= 2, 'Please enter the name.');
        need(!(placeholder && /name to be added/i.test(name.value)), 'Please replace the placeholder with the real name.'); need(des.value.trim(), 'Please enter the official designation.');
        need(!email.value.trim() || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim()), 'That email address does not look right.');
        var p = await photo.commit('representatives');
        if (p.path && !(row && row.photo_path === p.path)) fresh.push(p.path);
        var payload = { name: name.value.trim(), name_kn: trimOrNull(nameKn.value), role_key: role.value, designation: des.value.trim(), designation_kn: trimOrNull(desKn.value),
          intro: trimOrNull(intro.value), intro_kn: trimOrNull(introKn.value), work: trimOrNull(work.value), work_kn: trimOrNull(workKn.value),
          phone: trimOrNull(phone.value), email: trimOrNull(email.value), photo_path: p.path, display_order: parseInt(order.value, 10) || 0, is_published: pub.input.checked };
        var r = row ? await A.db().from('representatives').update(payload).eq('id', row.id) : await A.db().from('representatives').insert(payload);
        if (r.error) throw r.error;
        await A.removeSite(p.cleanup);
      });
      if (ok) { W65.toast('Saved.', 'ok'); d.close(); done(); }
    });
    d.body.appendChild(h('div', { class: 'form-grid' },
      grid([A.field('Full name (English)', name), A.field('Full name (Kannada, optional)', nameKn)]),
      grid([A.field('Official designation (English)', des), A.field('Designation (Kannada, optional)', desKn)]),
      grid([A.field('Position on the website', role), A.field('Display order (1 = first)', order)]),
      photo.el,
      A.field('Short introduction (English)', intro), A.field('Short introduction (Kannada, optional)', introKn),
      A.field('Public service & development work (English)', work, 'One item per line works well.'), A.field('Public service & development work (Kannada, optional)', workKn),
      grid([A.field('Phone (shown publicly)', phone), A.field('Email (shown publicly)', email)]), pub.el, err, h('div', null, save)));
  }
  A.register('reps', 'Representatives', 'users', function (box) {
    box.appendChild(h('p', { class: 'hint', text: 'Photographs and contact details are shown publicly. The second corporator stays hidden until you enter the name and tick “Show on the public website”.' }));
    crud(box, {
      table: 'representatives', icon: 'user', addLabel: 'Add representative', emptyText: 'No representatives yet.',
      query: function () { return A.db().from('representatives').select('*').order('display_order').limit(100); },
      thumb: function (r) { return r.photo_path; },
      info: function (r) { return { title: r.name, meta: r.designation + (r.photo_path ? '' : ' · no photo yet'), badges: pubBadge(r) }; },
      files: function (r) { return [r.photo_path]; }, form: repForm
    });
  }, true);

  /* ===================================================================
     Website settings
     =================================================================== */
  A.register('settings', 'Website settings', 'sliders', async function (box) {
    var r = await A.db().from('site_settings').select('key,value');
    if (r.error) { box.appendChild(h('div', { class: 'alert alert-error' }, A.errMsg(r.error))); return; }
    var s = {}; r.data.forEach(function (x) { s[x.key] = x.value; });
    var inputs = {};
    function txt(key, label, hint, area, extra) {
      var el = area ? A.textarea(s[key], { rows: 3, maxlength: 600 }) : A.input(extra || 'text', s[key], { maxlength: 300 });
      inputs[key] = el; return A.field(label, el, hint);
    }
    var banner = A.photoSlot('Homepage banner', s.banner_path, { original: true, hint: 'Shown full-width at the top of the home page exactly as uploaded (not cropped or stretched). A wide image around 1920 px works best. JPG, PNG or WebP, up to 10 MB.' });
    var otp = A.check('Require SMS verification of the mobile number before a complaint is accepted', s.require_phone_verification === 'true');
    var err = h('div', { class: 'error-text', role: 'alert' });
    var save = A.btn('btn-green btn-lg', 'check', 'Save settings', async function () {
      var ok = await saveRow(save, err, async function (fresh) {
        var embed = inputs.maps_embed_url.value.trim();
        var m = /src\s*=\s*["']([^"']+)["']/i.exec(embed); if (m) embed = m[1];
        need(!embed || W65.safeMapEmbed(embed), 'The map embed link must start with https://www.google.com/maps/embed – in Google Maps choose Share → Embed a map and copy the src link.');
        var mapsUrl = inputs.maps_url.value.trim(); need(!mapsUrl || W65.safeHttpUrl(mapsUrl), 'The Google Maps link must start with https://');
        var wa = W65.digits(inputs.whatsapp_number.value); need(!wa || (wa.length >= 10 && wa.length <= 13), 'Enter the WhatsApp number with 10 digits (or with country code).');
        var b = await banner.commit('banner'); if (b.path && b.path !== s.banner_path) fresh.push(b.path);
        var rows = ['office_address', 'office_address_kn', 'office_phone', 'office_email', 'office_hours', 'office_hours_kn', 'whatsapp_number', 'maps_url', 'maps_embed_url', 'emergency_phone', 'emergency_info', 'emergency_info_kn'].map(function (k) {
          var v = inputs[k].value.trim(); if (k === 'maps_embed_url') v = embed; if (k === 'whatsapp_number') v = wa; return { key: k, value: v };
        });
        rows.push({ key: 'banner_path', value: b.path || '' }, { key: 'require_phone_verification', value: otp.input.checked ? 'true' : 'false' });
        var u = await A.db().from('site_settings').upsert(rows, { onConflict: 'key' });
        if (u.error) throw u.error;
        await A.removeSite(b.cleanup); s.banner_path = b.path || ''; W65.resetSettings();
      });
      if (ok) W65.toast('Settings saved. The website now shows them.', 'ok');
    });
    box.appendChild(h('p', { class: 'hint', text: 'Anything you leave empty is simply not shown on the website.' }));
    box.appendChild(h('section', { class: 'panel' }, h('h2', { text: 'Homepage banner' }), banner.el));
    box.appendChild(h('section', { class: 'panel' }, h('h2', { text: 'Ward office' }), h('div', { class: 'form-grid cols-2' },
      txt('office_address', 'Office address (English)', null, true), txt('office_address_kn', 'Office address (Kannada)', null, true),
      txt('office_phone', 'Office phone'), txt('office_email', 'Office email', null, false, 'email'),
      txt('office_hours', 'Office hours (English)', 'e.g. Monday–Saturday, 10:00 am – 5:30 pm', true), txt('office_hours_kn', 'Office hours (Kannada)', null, true))));
    box.appendChild(h('section', { class: 'panel' }, h('h2', { text: 'WhatsApp & map' }), h('div', { class: 'form-grid cols-2' },
      txt('whatsapp_number', 'Official WhatsApp number', 'Shows a WhatsApp button on the Contact page.'),
      txt('maps_url', 'Google Maps link', 'Opens when visitors tap “Open in Google Maps”.'),
      h('div', { style: 'grid-column:1/-1' }, txt('maps_embed_url', 'Google Maps embed link (optional)', 'Google Maps → Share → Embed a map → copy the link inside src="…". Shows the map on the Contact page.')))));
    box.appendChild(h('section', { class: 'panel' }, h('h2', { text: 'Emergency civic complaints' }), h('div', { class: 'form-grid cols-2' },
      txt('emergency_phone', 'Emergency / helpline number of the ward office'), h('div'),
      txt('emergency_info', 'Extra information (English)', null, true), txt('emergency_info_kn', 'Extra information (Kannada)', null, true))));
    box.appendChild(h('section', { class: 'panel' }, h('h2', { text: 'Spam protection' }), otp.el,
      h('p', { class: 'perm-note', text: 'Only switch this on after an SMS provider has been set up in Supabase (Authentication → Providers → Phone). If SMS is not configured, residents will not be able to submit complaints. Rate limiting and a hidden spam trap are always active.' })));
    box.appendChild(err); box.appendChild(h('div', null, save));
  }, true);

  /* ===================================================================
     Staff accounts
     =================================================================== */
  function staffForm(row, done) {
    var d = A.drawer({ label: row ? 'Edit staff member' : 'Add staff member' });
    d.head.appendChild(h('h2', { text: row ? 'Edit staff member' : 'Add staff member', style: 'margin:0;font-size:1.3rem' }));
    var email = A.input('email', row && row.email, { maxlength: 120, readonly: !!row });
    var name = A.input('text', row && row.full_name, { maxlength: 100 });
    var role = A.select([['staff', 'Authorised staff – complaints only'], ['admin', 'Administrator – everything']], row ? row.role : 'staff');
    var active = A.check('Account is active', row ? row.is_active : true);
    var err = h('div', { class: 'error-text', role: 'alert' });
    var save = A.btn('btn-green btn-lg', 'check', 'Save', async function () {
      var ok = await saveRow(save, err, async function () {
        need(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim()), 'Enter a valid email address.'); need(name.value.trim().length >= 2, 'Enter the person’s name.');
        var r = await A.db().rpc('admin_upsert_staff', { p_email: email.value.trim(), p_name: name.value.trim(), p_role: role.value, p_active: active.input.checked });
        if (r.error) throw r.error;
      });
      if (ok) { W65.toast('Saved.', 'ok'); d.close(); done(); }
    });
    d.body.appendChild(h('div', { class: 'form-grid' },
      row ? null : h('div', { class: 'alert alert-info' }, 'First create the person’s login in Supabase → Authentication → Users → Add user (email and a temporary password). Then enter the same email here to give them access.'),
      A.field('Email', email), A.field('Full name', name), A.field('Access level', role), active.el, err, h('div', null, save)));
  }
  A.register('staff', 'Staff & permissions', 'shield-check', async function (box) {
    box.appendChild(h('div', { class: 'panel' }, h('p', { style: 'margin:0' }, h('b', { text: 'Administrator: ' }), 'everything, including website content, settings and staff. ', h('b', { text: 'Authorised staff: ' }), 'view and update complaints and download reports only.')));
    var list = h('div', { class: 'item-list' });
    box.appendChild(h('div', { class: 'btn-row', style: 'margin-bottom:1rem' }, A.btn('btn-green', 'plus', 'Add staff member', function () { staffForm(null, reload); })));
    box.appendChild(list);
    async function reload() {
      list.textContent = '';
      var r = await A.db().rpc('admin_list_staff');
      if (r.error) { list.appendChild(h('div', { class: 'alert alert-error' }, A.errMsg(r.error))); return; }
      (r.data || []).forEach(function (s) {
        var me = s.user_id === A.me.id;
        list.appendChild(h('div', { class: 'item-row' }, h('div', { class: 'thumb' }, A.icon('user')),
          h('div', { class: 'grow' }, h('b', { text: s.full_name + (me ? ' (you)' : '') }), h('div', { class: 'cell-sub', text: s.email }),
            h('span', { class: 'badge ' + (s.role === 'admin' ? 'badge-saffron' : 'badge-green'), style: 'margin-top:.3rem', text: (s.role === 'admin' ? 'Administrator' : 'Authorised staff') + (s.is_active ? '' : ' · inactive') })),
          h('div', { class: 'actions' }, A.btn('btn-secondary btn-sm', 'edit', 'Edit', function () { staffForm(s, reload); }))));
      });
    }
    reload();
  }, true);
})();
