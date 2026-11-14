/* =====================================================================
   ADMIN - core: helpers, drawer, photo pickers, sign-in, app shell
   The staff area is English only. Permissions are enforced by the database
   (Row Level Security); hiding menu items here is only for convenience.
   ===================================================================== */
(function () {
  'use strict';
  var W65 = window.W65, h = W65.h, $ = W65.$;
  W65.forceLang('en');
  var A = (W65.admin = { me: null, views: {}, order: [], titles: {}, adminOnly: {} });
  var app = $('#app'), current = 'dashboard';

  /* ---------------- helpers ---------------- */
  A.db = function () { return W65.db(true); };
  A.errMsg = function (err) {
    var m = err && err.message;
    if (m === 'unsupported_image') return 'One of the pictures is not a valid JPG, PNG or WebP file.';
    if (m === 'too_large') return 'A picture is larger than 10 MB.';
    var k = W65.errKey(err);
    if (k !== 'err.generic') return W65.t(k);
    return m ? String(m).slice(0, 200) : W65.t('err.generic');
  };
  A.fail = function (err) { console.error(err); W65.toast(A.errMsg(err), 'err'); };
  A.rand = function () {
    var a = new Uint8Array(8); crypto.getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  };
  A.chip = function (s) { return h('span', { class: 'chip chip-' + s, text: W65.statusLabel(s) }); };
  A.icon = function (name, cls) { return W65.iconEl(name, cls); };
  A.btn = function (cls, icon, text, onclick, attrs) {
    var b = h('button', Object.assign({ type: 'button', class: 'btn ' + cls, onclick: onclick }, attrs || {}));
    if (icon) b.appendChild(A.icon(icon)); b.appendChild(h('span', { text: text })); return b;
  };
  A.busy = function (btn, on) { btn.disabled = on; btn.classList.toggle('is-loading', on); };
  A.field = function (label, input, hint, wide) {
    var id = input.id || (input.id = 'f' + A.rand());
    return h('div', { class: 'field', style: wide ? 'grid-column:1/-1' : null },
      h('label', { for: id, text: label }), input, hint ? h('div', { class: 'hint', text: hint }) : null);
  };
  A.input = function (type, value, attrs) { return h('input', Object.assign({ type: type, value: value == null ? '' : value }, attrs || {})); };
  A.textarea = function (value, attrs) { var t = h('textarea', attrs || {}); t.value = value == null ? '' : value; return t; };
  A.select = function (options, value) {
    var s = h('select');
    options.forEach(function (o) { s.appendChild(h('option', { value: o[0], text: o[1], selected: o[0] === value })); });
    return s;
  };
  A.check = function (label, checked) {
    var i = h('input', { type: 'checkbox', checked: !!checked });
    return { input: i, el: h('label', { class: 'checkbox' }, i, h('span', { text: label })) };
  };
  A.empty = function (icon, text) { var e = h('div', { class: 'empty-state' }); e.innerHTML = W65.icon(icon); e.appendChild(h('p', { text: text })); return e; };
  A.siteUrl = function (p) { return p ? W65.pubUrl(p) : ''; };

  /* ---------------- slide-in drawer ---------------- */
  A.drawer = function (opts) {
    var opener = document.activeElement;
    var titleWrap = h('div', { style: 'min-width:0' });
    var closeBtn = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-label': 'Close' }); closeBtn.appendChild(A.icon('x'));
    var body = h('div');
    var drawer = h('div', { class: 'drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.label || 'Details' }, h('div', { class: 'drawer-head' }, titleWrap, closeBtn), body);
    var back = h('div', { class: 'drawer-back' }, drawer);
    function close() {
      document.removeEventListener('keydown', key); back.remove(); document.body.style.overflow = '';
      if (opener && opener.focus) opener.focus();
      if (opts.onClose) opts.onClose();
    }
    function key(e) { if (e.key === 'Escape' && !document.querySelector('.lightbox')) close(); }
    back.addEventListener('mousedown', function (e) { if (e.target === back) close(); });
    closeBtn.addEventListener('click', close); document.addEventListener('keydown', key);
    document.body.style.overflow = 'hidden'; document.body.appendChild(back); closeBtn.focus();
    return { body: body, head: titleWrap, close: close };
  };

  /* ---------------- uploads to the public site-media bucket ---------------- */
  A.uploadSite = async function (file, folder, opts) {
    var p = await W65.prepareImage(file, opts || { maxDim: 1800, maxMB: 10 });
    var path = folder + '/' + A.rand() + '.' + p.ext;
    var r = await A.db().storage.from('site-media').upload(path, p.blob, { contentType: p.type, upsert: false, cacheControl: '31536000' });
    if (r.error) throw r.error;
    return path;
  };
  A.removeSite = function (paths) {
    paths = (paths || []).filter(Boolean);
    if (!paths.length) return Promise.resolve();
    return A.db().storage.from('site-media').remove(paths).then(function () { }, function (e) { console.warn('cleanup failed', e); });
  };
  function imgErr(e) {
    var m = e && e.message;
    if (m === 'unsupported_image') return 'That file is not a JPG, PNG or WebP picture.';
    if (m === 'too_large') return 'That picture is larger than 10 MB.';
    return A.errMsg(e);
  }

  /* One picture. opts.original = store exactly as chosen (banner, representative photos). */
  A.photoSlot = function (label, currentPath, opts) {
    opts = opts || {};
    var st = { path: currentPath || null, file: null, url: null, removed: false };
    var input = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', hidden: true });
    var prev = h('div', { class: 'preview' });
    var chooseBtn = A.btn('btn-ghost btn-sm', 'upload', '', function () { input.click(); });
    var removeBtn = A.btn('btn-ghost btn-sm', 'trash', 'Remove', function () {
      if (st.url) URL.revokeObjectURL(st.url); st.file = null; st.url = null; st.removed = true; draw();
    });
    var msg = h('div', { class: 'error-text' });
    function draw() {
      prev.textContent = '';
      var src = st.url || (!st.removed && st.path ? A.siteUrl(st.path) : '');
      if (src) prev.appendChild(h('img', { src: src, alt: '' })); else prev.appendChild(A.icon('image'));
      chooseBtn.querySelector('span').textContent = src ? 'Replace' : 'Choose picture';
      removeBtn.hidden = !src;
    }
    input.addEventListener('change', function () {
      var f = input.files && input.files[0]; input.value = ''; msg.textContent = '';
      if (!f) return;
      if (['image/jpeg', 'image/png', 'image/webp'].indexOf(f.type) === -1) { msg.textContent = imgErr({ message: 'unsupported_image' }); return; }
      if (f.size > 10 * 1048576) { msg.textContent = imgErr({ message: 'too_large' }); return; }
      if (st.url) URL.revokeObjectURL(st.url);
      st.file = f; st.url = URL.createObjectURL(f); st.removed = false; draw();
    });
    draw();
    var el = h('div', { class: 'field' }, h('span', { class: 'label', text: label }),
      h('div', { class: 'photo-slot' }, prev, chooseBtn, removeBtn, input), msg,
      opts.hint ? h('div', { class: 'hint', text: opts.hint }) : null);
    return {
      el: el,
      /* uploads if needed; returns { path, cleanup:[old paths no longer used] } */
      commit: async function (folder) {
        if (st.file) {
          var np = await A.uploadSite(st.file, folder, opts.original ? { original: true, maxMB: 10 } : { maxDim: 1800, maxMB: 10 });
          return { path: np, cleanup: st.path ? [st.path] : [] };
        }
        if (st.removed) return { path: null, cleanup: st.path ? [st.path] : [] };
        return { path: st.path, cleanup: [] };
      }
    };
  };

  /* Several pictures (gallery, announcements). */
  A.photoList = function (label, paths, opts) {
    opts = opts || {};
    var keep = (paths || []).slice(), added = [], gone = [];
    var input = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: true, hidden: true });
    var grid = h('div', { class: 'preview-grid' }), msg = h('div', { class: 'error-text' });
    function tile(src, onRemove) {
      var rm = h('button', { type: 'button', class: 'remove', 'aria-label': 'Remove picture', onclick: onRemove }); rm.innerHTML = W65.icon('x');
      return h('div', { class: 'preview' }, h('img', { src: src, alt: '' }), rm);
    }
    function draw() {
      grid.textContent = '';
      keep.forEach(function (p, i) { grid.appendChild(tile(A.siteUrl(p), function () { gone.push(p); keep.splice(i, 1); draw(); })); });
      added.forEach(function (a, i) { grid.appendChild(tile(a.url, function () { URL.revokeObjectURL(a.url); added.splice(i, 1); draw(); })); });
    }
    input.addEventListener('change', function () {
      msg.textContent = '';
      Array.prototype.slice.call(input.files || []).forEach(function (f) {
        if (['image/jpeg', 'image/png', 'image/webp'].indexOf(f.type) === -1) { msg.textContent = imgErr({ message: 'unsupported_image' }); return; }
        if (f.size > 10 * 1048576) { msg.textContent = imgErr({ message: 'too_large' }); return; }
        if (keep.length + added.length >= (opts.max || 12)) { msg.textContent = 'You can add up to ' + (opts.max || 12) + ' pictures.'; return; }
        added.push({ file: f, url: URL.createObjectURL(f) });
      });
      input.value = ''; draw();
    });
    draw();
    return {
      el: h('div', { class: 'field', style: 'grid-column:1/-1' }, h('span', { class: 'label', text: label }),
        h('div', null, A.btn('btn-ghost btn-sm', 'upload', 'Add pictures', function () { input.click(); }), input), grid, msg),
      commit: async function (folder) {
        var out = keep.slice();
        for (var i = 0; i < added.length; i++) out.push(await A.uploadSite(added[i].file, folder, { maxDim: 1800, maxMB: 10 }));
        return { paths: out, cleanup: gone.slice() };
      }
    };
  };

  /* ---------------- sign-in ---------------- */
  function shellMessage(title, text, kind) {
    app.textContent = '';
    var card = h('div', { class: 'login-card' }, brandMark(), h('h1', { style: 'font-size:1.5rem;text-align:center', text: title }));
    var p = h('p', { class: 'alert alert-' + (kind || 'info') }); p.textContent = text; card.appendChild(p);
    app.appendChild(h('div', { class: 'login-wrap' }, card));
  }
  A.showSetup = function (prob) {
    shellMessage('Setup needed', prob === 'config'
      ? 'Open assets/js/config.js and paste your Supabase project URL and anon key. See README.md, step 3.'
      : 'The Supabase library could not be loaded. Check the internet connection (or self-host the library as described in README.md).', 'warn');
  };

  function brandMark() { var d = h('div', { class: 'brand' }); d.innerHTML = W65.MARK; return d; }

  A.showLogin = function (notice, kind) {
    app.textContent = '';
    var email = h('input', { type: 'email', id: 'l_email', autocomplete: 'username', required: true, placeholder: 'name@example.com' });
    var pass = h('input', { type: 'password', id: 'l_pass', autocomplete: 'current-password', required: true });
    var alertBox = h('div', { 'aria-live': 'assertive' });
    var go = h('button', { type: 'submit', class: 'btn btn-primary btn-lg btn-block' }, h('span', { text: 'Sign in' }));
    if (notice) { var n = h('div', { class: 'alert alert-' + (kind || 'error'), role: 'alert' }); n.textContent = notice; alertBox.appendChild(n); }
    var form = h('form', { novalidate: true }, alertBox,
      h('div', { class: 'field' }, h('label', { for: 'l_email', text: 'Email' }), email),
      h('div', { class: 'field', style: 'margin-top:1rem' }, h('label', { for: 'l_pass', text: 'Password' }), pass),
      h('div', { style: 'margin-top:1.2rem' }, go),
      h('p', { class: 'center', style: 'margin:1rem 0 0' }, h('button', { type: 'button', class: 'link-btn', id: 'forgot', text: 'Forgot password?' })));
    function say(msg, kind2) { alertBox.textContent = ''; var a = h('div', { class: 'alert alert-' + kind2, role: 'alert' }); a.textContent = msg; alertBox.appendChild(a); }
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (!email.value.trim() || !pass.value) { say('Please enter your email and password.', 'error'); return; }
      A.busy(go, true);
      try {
        var r = await A.db().auth.signInWithPassword({ email: email.value.trim(), password: pass.value });
        if (r.error) { say('Incorrect email or password.', 'error'); return; }
        await A.enter();
      } catch (err) { say(A.errMsg(err), 'error'); } finally { A.busy(go, false); }
    });
    form.querySelector('#forgot').addEventListener('click', async function () {
      if (!email.value.trim()) { say('Type your email first, then press “Forgot password?”.', 'warn'); return; }
      try {
        await A.db().auth.resetPasswordForEmail(email.value.trim(), { redirectTo: location.origin + location.pathname });
        say('If that email belongs to a staff account, a password reset link has been sent.', 'ok');
      } catch (err) { say(A.errMsg(err), 'error'); }
    });
    app.appendChild(h('div', { class: 'login-wrap' }, h('div', { class: 'login-card' }, brandMark(),
      h('h1', { style: 'font-size:1.5rem;text-align:center;margin-bottom:.2rem', text: 'Staff sign-in' }),
      h('p', { class: 'center hint', style: 'margin-bottom:1.2rem', text: 'Ward No. 65 – Hubballi-Dharwad Municipal Corporation' }), form,
      h('p', { class: 'center', style: 'margin:1.2rem 0 0' }, h('a', { href: 'index.html', text: '← Back to the public website' })))));
    email.focus();
  };

  A.showNewPassword = function () {
    app.textContent = '';
    var p1 = h('input', { type: 'password', id: 'np1', autocomplete: 'new-password', minlength: 10 });
    var p2 = h('input', { type: 'password', id: 'np2', autocomplete: 'new-password' });
    var box = h('div', { 'aria-live': 'assertive' });
    var go = h('button', { type: 'submit', class: 'btn btn-primary btn-lg btn-block' }, h('span', { text: 'Save new password' }));
    var form = h('form', null, box,
      h('div', { class: 'field' }, h('label', { for: 'np1', text: 'New password (at least 10 characters)' }), p1),
      h('div', { class: 'field', style: 'margin-top:1rem' }, h('label', { for: 'np2', text: 'Repeat the new password' }), p2),
      h('div', { style: 'margin-top:1.2rem' }, go));
    form.addEventListener('submit', async function (e) {
      e.preventDefault(); box.textContent = '';
      var msg = p1.value.length < 10 ? 'Use at least 10 characters.' : (p1.value !== p2.value ? 'The two passwords do not match.' : '');
      if (msg) { var a = h('div', { class: 'alert alert-error', role: 'alert' }); a.textContent = msg; box.appendChild(a); return; }
      A.busy(go, true);
      try {
        var r = await A.db().auth.updateUser({ password: p1.value });
        if (r.error) throw r.error;
        history.replaceState(null, '', location.pathname); await A.enter();
      } catch (err) { var b = h('div', { class: 'alert alert-error', role: 'alert' }); b.textContent = A.errMsg(err); box.appendChild(b); } finally { A.busy(go, false); }
    });
    app.appendChild(h('div', { class: 'login-wrap' }, h('div', { class: 'login-card' }, brandMark(), h('h1', { style: 'font-size:1.5rem;text-align:center', text: 'Choose a new password' }), form)));
  };

  /* After a successful password sign-in: confirm this person is on the staff list. */
  A.enter = async function () {
    var db = A.db();
    var role = await db.rpc('my_role');
    if (role.error || !role.data) {
      await db.auth.signOut();
      return A.showLogin('This account is not authorised for the staff area. Ask an administrator to add you.', 'error');
    }
    var u = await db.auth.getUser();
    var prof = await db.from('staff_profiles').select('full_name').eq('user_id', u.data.user.id).maybeSingle();
    A.me = { id: u.data.user.id, email: u.data.user.email, role: role.data, name: (prof.data && prof.data.full_name) || u.data.user.email };
    A.renderShell();
  };

  A.signOut = async function () {
    // Clear the signed-in person FIRST: the auth listener in admin-boot.js also draws the
    // login screen on SIGNED_OUT (for expired sessions), and it skips this when A.me is empty.
    // Otherwise the screen is built twice and the second build can wipe what the next person is typing.
    A.me = null;
    try { await A.db().auth.signOut(); } catch (e) { /* ignore */ }
    A.showLogin('You have been signed out.', 'info');
  };

  /* ---------------- app shell ---------------- */
  A.register = function (key, title, icon, fn, adminOnly) {
    A.views[key] = fn; A.titles[key] = { title: title, icon: icon }; A.order.push(key); if (adminOnly) A.adminOnly[key] = true;
  };
  A.go = function (key) {
    if (!A.views[key] || (A.adminOnly[key] && A.me.role !== 'admin')) key = 'dashboard';
    current = key;
    W65.$$('.admin-nav button').forEach(function (b) { if (b.dataset.view === key) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    var view = $('#view'); view.textContent = '';
    view.appendChild(h('div', { class: 'admin-title' }, h('h1', { text: A.titles[key].title })));
    var body = h('div', { id: 'viewBody' }); view.appendChild(body);
    try { history.replaceState(null, '', '#' + key); } catch (e) { /* ignore */ }
    window.scrollTo(0, 0);
    A.views[key](body);
  };
  A.reload = function () { A.go(current); };

  A.renderShell = function () {
    app.textContent = '';
    var nav = h('nav', { class: 'admin-nav', 'aria-label': 'Staff menu' });
    A.order.forEach(function (k) {
      if (A.adminOnly[k] && A.me.role !== 'admin') return;
      var b = h('button', { type: 'button', 'data-view': k, onclick: function () { A.go(k); } }); b.appendChild(A.icon(A.titles[k].icon)); b.appendChild(h('span', { text: A.titles[k].title }));
      nav.appendChild(b);
    });
    var brand = h('a', { class: 'brand', href: 'index.html' }); brand.innerHTML = W65.MARK;
    brand.appendChild(h('span', { class: 'brand-text' }, h('strong', { text: 'WARD NO. 65' }), h('span', { text: 'Staff dashboard' })));
    var out = A.btn('btn-ghost btn-sm', 'log-out', 'Sign out', A.signOut, { style: 'color:#fff;border-color:rgba(255,255,255,.3)' });
    var side = h('aside', { class: 'admin-side' }, brand, nav,
      h('div', { class: 'admin-user' }, h('span', { class: 'role-pill', text: A.me.role === 'admin' ? 'Administrator' : 'Authorised staff' }), h('strong', { text: A.me.name, style: 'color:#fff' }), h('span', { text: A.me.email, style: 'word-break:break-all' }), out,
        h('a', { href: 'index.html', text: 'View public website', style: 'color:#ffd9a8' })));
    var main = h('main', { class: 'admin-main', id: 'view' });
    app.appendChild(h('div', { class: 'admin-shell' }, side, main));
    var start = (location.hash || '').replace('#', '');
    A.go(A.views[start] ? start : 'dashboard');
  };
})();
