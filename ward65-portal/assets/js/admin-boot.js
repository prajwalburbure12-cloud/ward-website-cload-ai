/* ADMIN - start-up. Runs after every view has registered itself. */
(function () {
  'use strict';
  var W65 = window.W65, A = W65.admin;
  var prob = W65.problem();
  if (prob) { A.showSetup(prob); return; }

  var db = A.db();
  db.auth.onAuthStateChange(function (event) {
    // Do not call Supabase from inside this callback; defer it.
    if (event === 'PASSWORD_RECOVERY') setTimeout(A.showNewPassword, 0);
    if (event === 'SIGNED_OUT' && A.me) setTimeout(function () { A.me = null; A.showLogin('You have been signed out.', 'info'); }, 0);
  });

  var recovering = /type=recovery/.test(location.hash) || /type=recovery/.test(location.search);
  db.auth.getSession().then(function (r) {
    if (recovering) return;                       // the PASSWORD_RECOVERY event shows its own screen
    if (r.data && r.data.session) A.enter().catch(function (e) { console.error(e); A.showLogin(A.errMsg(e), 'error'); });
    else A.showLogin();
  }).catch(function () { A.showLogin(); });
})();
