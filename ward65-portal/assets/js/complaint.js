/* Complaint registration: validation, photo/video handling, optional OTP, submission, upload */
(function () {
  'use strict';
  var W65 = window.W65, h = W65.h, t = W65.t, $ = W65.$, CFG = W65.CFG;
  var MAX_PHOTOS = CFG.MAX_PHOTOS || 5;
  var MAX_VIDEO_BYTES = (CFG.MAX_VIDEO_MB || 25) * 1048576;
  var MAX_FILES = 6;                       // the database allows 6 files per complaint
  var problem = W65.problem();

  var files = [];                          // { kind, blob, type, ext, url }
  var coords = null;
  var needOtp = false, verifiedMobile = null;
  var submitting = false;
  var form = $('#complaintForm');

  /* ---------------- Helpers ---------------- */
  function normMobile(v) {
    var d = W65.digits(v);
    if (d.length === 12 && d.slice(0, 2) === '91') d = d.slice(2);
    else if (d.length === 11 && d.charAt(0) === '0') d = d.slice(1);
    return d.slice(0, 10);
  }
  function setErr(id, msg, inputId) {
    var el = $('#e_' + id); if (el) el.textContent = msg || '';
    var inp = $('#' + (inputId || 'f_' + id)); if (inp) { if (msg) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid'); }
  }
  function clearErrors() {
    ['name', 'mobile', 'area', 'ward', 'desc', 'category', 'media', 'otp'].forEach(function (k) { setErr(k, ''); });
    $('#formAlert').textContent = '';
  }
  function showAlert(msg, kind) {
    var box = $('#formAlert'); box.textContent = '';
    var a = h('div', { class: 'alert alert-' + (kind || 'error'), role: 'alert' }); a.innerHTML = W65.icon(kind === 'warn' ? 'alert' : 'alert');
    a.appendChild(h('span', { text: msg })); box.appendChild(a);
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function rand() {
    var a = new Uint8Array(8); (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }

  /* ---------------- Static pieces: categories, areas ---------------- */
  var preselect = (new URLSearchParams(location.search).get('cat') || '').toLowerCase();
  (function buildCats() {
    var box = $('#catRadios');
    W65.CATEGORIES.forEach(function (c) {
      var id = 'cat_' + c.key;
      var inp = h('input', { type: 'radio', name: 'category', id: id, value: c.key });
      if (c.key === preselect) inp.checked = true;
      var lab = h('label', { for: id }); lab.innerHTML = W65.icon(c.icon); lab.appendChild(W65.i('cat.' + c.key));
      box.appendChild(h('div', null, inp, lab));
    });
    box.addEventListener('change', function () { setErr('category', '', 'catRadios'); });
  })();
  function buildAreas() {
    var dl = $('#areaList'); dl.textContent = '';
    W65.AREAS.forEach(function (a) { dl.appendChild(h('option', { value: a.name, label: W65.areaLabel(a.name) })); });
  }
  buildAreas(); W65.onLang(buildAreas);

  /* ---------------- Field behaviour ---------------- */
  var mobileEl = $('#f_mobile');
  mobileEl.addEventListener('input', function () {
    var n = normMobile(mobileEl.value);
    if (mobileEl.value !== n) mobileEl.value = n;
    if (needOtp && verifiedMobile && verifiedMobile !== n) resetOtp();
  });
  $('#f_desc').addEventListener('input', function () { $('#c_desc').textContent = this.value.length + ' / 2000'; });

  /* ---------------- Location ---------------- */
  $('#locBtn').addEventListener('click', function () {
    var hint = $('#locHint'); hint.textContent = '';
    if (!navigator.geolocation) { hint.textContent = t('complaint.loc.unsupported'); return; }
    var btn = this; btn.disabled = true; hint.textContent = t('complaint.loc.finding');
    navigator.geolocation.getCurrentPosition(function (pos) {
      coords = { lat: Math.round(pos.coords.latitude * 1e6) / 1e6, lng: Math.round(pos.coords.longitude * 1e6) / 1e6 };
      btn.disabled = false; hint.textContent = ''; $('#locStatus').hidden = false;
    }, function () {
      btn.disabled = false; hint.textContent = t('complaint.loc.denied');
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  });
  $('#locClear').addEventListener('click', function () { coords = null; $('#locStatus').hidden = true; });

  /* ---------------- Photos and video ---------------- */
  function imageCount() { return files.filter(function (f) { return f.kind === 'image'; }).length; }
  function renderPreviews() {
    var box = $('#previews'); box.textContent = '';
    files.forEach(function (f, i) {
      var media = f.kind === 'video'
        ? h('video', { src: f.url, muted: true, playsinline: true, preload: 'metadata' })
        : h('img', { src: f.url, alt: '' });
      var rm = h('button', { type: 'button', class: 'remove', 'aria-label': t('complaint.media.remove'), onclick: function () {
        URL.revokeObjectURL(f.url); files.splice(i, 1); setErr('media', ''); renderPreviews();
      } }); rm.innerHTML = W65.icon('x');
      box.appendChild(h('div', { class: 'preview' }, media, rm, f.kind === 'video' ? h('span', { class: 'tag', text: t('complaint.media.videoTag') }) : null));
    });
    $('#btnCamera').disabled = $('#btnPhoto').disabled = imageCount() >= MAX_PHOTOS || files.length >= MAX_FILES;
    $('#btnVideo').disabled = files.some(function (f) { return f.kind === 'video'; }) || files.length >= MAX_FILES;
  }
  /* Photo batches are handled one after another, so two quick picks can never go past the limit. */
  var imageQueue = Promise.resolve();
  function addImages(list) {
    imageQueue = imageQueue.then(function () { return addImagesNow(list); }).catch(function (e) { console.error(e); });
    return imageQueue;
  }
  async function addImagesNow(list) {
    setErr('media', '');
    var rejected = 0;
    for (var i = 0; i < list.length; i++) {
      if (imageCount() >= MAX_PHOTOS || files.length >= MAX_FILES) { rejected = 'max'; break; }
      try {
        var p = await W65.prepareImage(list[i], { maxDim: 1600, maxMB: 10 });
        files.push({ kind: 'image', blob: p.blob, type: p.type, ext: p.ext, url: URL.createObjectURL(p.blob) });
      } catch (e) { rejected = rejected || 'type'; }
    }
    if (rejected === 'max') setErr('media', t('complaint.media.tooMany', { n: MAX_PHOTOS }));
    else if (rejected) setErr('media', t('complaint.media.badImage'));
    renderPreviews();
  }
  function addVideo(file) {
    setErr('media', '');
    var ext = W65.extFor(file.type);
    if (!/^video\//.test(file.type) || !ext) { setErr('media', t('complaint.media.badVideo')); return; }
    if (file.size > MAX_VIDEO_BYTES) { setErr('media', t('complaint.media.videoBig', { n: CFG.MAX_VIDEO_MB || 25 })); return; }
    files.push({ kind: 'video', blob: file, type: file.type, ext: ext, url: URL.createObjectURL(file) });
    renderPreviews();
  }
  function wire(btn, input, fn) {
    $(btn).addEventListener('click', function () { $(input).click(); });
    $(input).addEventListener('change', function () {
      var list = Array.prototype.slice.call(this.files || []); this.value = '';
      if (list.length) fn(list);
    });
  }
  wire('#btnCamera', '#inCamera', addImages);
  wire('#btnPhoto', '#inPhoto', addImages);
  wire('#btnVideo', '#inVideo', function (l) { addVideo(l[0]); });
  renderPreviews();

  /* ---------------- Optional OTP verification ---------------- */
  function resetOtp() {
    verifiedMobile = null; $('#otpOk').hidden = true; $('#otpEnter').hidden = true; $('#otpSend').hidden = false; $('#f_otp').value = '';
    try { W65.db().auth.signOut(); } catch (e) { /* ignore */ }
  }
  W65.settings().then(function (s) {
    needOtp = !problem && String(s.require_phone_verification) === 'true';
    $('#otpBox').hidden = !needOtp;
  });
  $('#otpSend').addEventListener('click', async function () {
    var m = normMobile(mobileEl.value);
    if (!/^[6-9]\d{9}$/.test(m)) { setErr('mobile', t('err.invalid_mobile')); mobileEl.focus(); return; }
    setErr('otp', ''); this.disabled = true;
    try {
      var r = await W65.db().auth.signInWithOtp({ phone: '+91' + m });
      if (r.error) throw r.error;
      $('#otpEnter').hidden = false; $('#f_otp').focus();
    } catch (e) { setErr('otp', t('otp.sendFail'), 'f_otp'); }
    this.disabled = false;
  });
  $('#otpVerify').addEventListener('click', async function () {
    var m = normMobile(mobileEl.value), code = W65.digits($('#f_otp').value);
    if (code.length < 4) { setErr('otp', t('otp.badCode'), 'f_otp'); return; }
    this.disabled = true;
    try {
      var r = await W65.db().auth.verifyOtp({ phone: '+91' + m, token: code, type: 'sms' });
      if (r.error) throw r.error;
      verifiedMobile = m; setErr('otp', '', 'f_otp'); $('#otpEnter').hidden = true; $('#otpSend').hidden = true; $('#otpOk').hidden = false;
    } catch (e) { setErr('otp', t('otp.badCode'), 'f_otp'); }
    this.disabled = false;
  });

  /* ---------------- Validation ---------------- */
  function validate() {
    clearErrors();
    var bad = [];
    function fail(id, key, inputId) { setErr(id, t(key), inputId); bad.push(inputId || 'f_' + id); }
    var name = $('#f_name').value.trim(), mobile = normMobile(mobileEl.value), area = $('#f_area').value.trim();
    var ward = parseInt($('#f_ward').value, 10), desc = $('#f_desc').value.trim();
    var cat = (form.querySelector('input[name="category"]:checked') || {}).value;
    if (name.length < 2) fail('name', 'err.invalid_name');
    if (!/^[6-9]\d{9}$/.test(mobile)) fail('mobile', 'err.invalid_mobile');
    else if (needOtp && verifiedMobile !== mobile) { setErr('otp', t('err.phone_not_verified'), 'f_otp'); bad.push('otpSend'); }
    if (area.length < 2) fail('area', 'err.invalid_area');
    if (!(ward >= 1 && ward <= 99)) fail('ward', 'err.invalid_ward');
    if (!cat) { setErr('category', t('err.invalid_category'), 'catRadios'); bad.push('cat_water'); }
    if (desc.length < 10) fail('desc', 'err.invalid_description');
    if (bad.length) { var first = $('#' + bad[0]); if (first) { first.scrollIntoView({ behavior: 'smooth', block: 'center' }); first.focus({ preventScroll: true }); } return null; }
    return { name: name, mobile: mobile, area: area, ward: ward, category: cat, description: desc, landmark: $('#f_landmark').value.trim() };
  }

  /* ---------------- Submit ---------------- */
  function busy(on, text) {
    submitting = on;
    var b = $('#submitBtn'); b.disabled = on; b.classList.toggle('is-loading', on);
    $('#progressText').textContent = text || '';
    if (!on) $('#progress').hidden = true;
  }
  function progress(done, total, text) {
    $('#progress').hidden = false; $('#progress > i').style.width = Math.round(100 * done / Math.max(1, total)) + '%'; $('#progressText').textContent = text || '';
  }
  form.addEventListener('submit', async function (ev) {
    ev.preventDefault();
    if (submitting) return;
    if (problem) { showAlert(t(problem === 'config' ? 'setup.config' : 'setup.lib'), 'warn'); return; }
    var v = validate(); if (!v) return;
    var db = W65.db();
    busy(true, t('complaint.sending'));
    try {
      var r = await db.rpc('submit_complaint', {
        p_name: v.name, p_mobile: v.mobile, p_area: v.area, p_ward: v.ward, p_category: v.category,
        p_description: v.description, p_landmark: v.landmark || null,
        p_lat: coords ? coords.lat : null, p_lng: coords ? coords.lng : null, p_hp: $('#f_hp').value
      });
      if (r.error) throw r.error;
      var res = r.data, failed = 0;
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        progress(i, files.length, t('complaint.uploading', { i: i + 1, n: files.length }));
        var path = res.id + '/' + rand() + '.' + f.ext;
        var up = await db.storage.from('complaint-media').upload(path, f.blob, { contentType: f.type, upsert: false, cacheControl: '3600' });
        if (up.error) { failed++; continue; }
        var add = await db.rpc('add_complaint_media', { p_complaint: res.id, p_path: path, p_kind: f.kind, p_mime: f.type, p_size: f.blob.size });
        if (add.error) failed++;
      }
      if (files.length) progress(files.length, files.length, '');
      success(res.code, failed);
      if (needOtp) { try { await db.auth.signOut(); } catch (e) { /* ignore */ } verifiedMobile = null; }
    } catch (err) {
      console.error(err);
      showAlert(W65.errText(err));
    } finally { busy(false); }
  });

  function success(code, failed) {
    W65.rememberCode(code);
    $('#newCode').textContent = code;
    $('#trackNow').setAttribute('href', 'track.html?code=' + encodeURIComponent(code));
    var note = $('#successNote'); note.textContent = '';
    if (failed) {
      var a = h('div', { class: 'alert alert-warn', role: 'status', style: 'text-align:left' }); a.innerHTML = W65.icon('alert');
      a.appendChild(h('span', { text: t('success.partial', { n: failed }) })); note.appendChild(a);
    }
    $('#formWrap').hidden = true; $('#successWrap').hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    $('#successWrap h2').setAttribute('tabindex', '-1'); $('#successWrap h2').focus({ preventScroll: true });
  }
  $('#copyCode').addEventListener('click', function () {
    W65.copy($('#newCode').textContent).then(function () { W65.toast(t('success.copied'), 'ok'); }, function () {
      // Copying was blocked: select the ID so the person can copy it by hand.
      try { var r = document.createRange(); r.selectNodeContents($('#newCode')); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); } catch (e) { /* ignore */ }
      W65.toast(t('success.copyFail'), 'err');
    });
  });
  $('#another').addEventListener('click', function () {
    files.forEach(function (f) { URL.revokeObjectURL(f.url); }); files = []; coords = null;
    form.reset(); $('#f_ward').value = 65; $('#c_desc').textContent = '0 / 2000'; $('#locStatus').hidden = true;
    clearErrors(); renderPreviews(); resetOtpUi();
    $('#successWrap').hidden = true; $('#formWrap').hidden = false; window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  function resetOtpUi() { if (needOtp) resetOtp(); }

  if (problem) showAlert(t(problem === 'config' ? 'setup.config' : 'setup.lib'), 'warn');
})();
