
/* ============================================================
   ARIBA V100 — إصلاح جذري لمشكلة "بعمل حفظ ومفيش حاجة بتتحفظ"
   السبب: البرنامج كان فيه مخزنين منفصلين لبيانات الموظفين:
     1) hr7_emps  ← اللي بيتعرض في شاشة الموظفين ونموذج التعديل
     2) نسخة مشفرة/في الذاكرة ← اللي دالة الحفظ (sEmp) بتدور فيها
   لما النسختين بيختلفوا (أو الثانية فاضية)، الحفظ كان بيلاقي الموظف
   "مش موجود" ويخرج بصمت، أو يكتب فوق التعديلات بنسخة قديمة.
   الإصلاح:
     - مصدر واحد فقط لبيانات الموظفين: hr7_emps
     - التأكد إن الحفظ اتكتب فعلًا، ولو المساحة امتلأت نفضّي النسخة القديمة ونعيد
     - إرسال الموظف المعدَّل بس (مش كل الموظفين) للسحابة فورًا، مع طابور
       إعادة محاولة تلقائي لو النت أو الجلسة وقعت
     - رسالة واضحة بعد كل حفظ: اتحفظ ووصل لتطبيق الموظف ولا لأ
   ============================================================ */
(function(){
  'use strict';
  if(window.__ARIBA_V100) return; window.__ARIBA_V100 = true;

  var KEY = 'hr7_emps';
  var QKEY = 'hr7_cloud_sync_queue_v100';
  var OLD_ENC_KEY = (function(){ try{ return '_ar_' + btoa('hr7_emps'); }catch(e){ return ''; } })();
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function readJSON(k, fb){ try{ var r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; }catch(e){ return fb; } }
  function deletedIds(){ return new Set((readJSON('hr7_deleted_employee_ids', []) || []).map(String)); }
  function say(msg, type){ try{ if(typeof window.toast === 'function') window.toast(msg, type || 'tok'); }catch(e){} }
  function sid(e){ return e && e.id != null ? String(e.id) : ''; }

  function readMaster(){ var a = readJSON(KEY, null); return Array.isArray(a) ? a : null; }

  function writeMaster(arr){
    var del = deletedIds();
    arr = (arr || []).filter(function(e){ return e && e.id != null && !del.has(String(e.id)); });
    var raw = JSON.stringify(arr);
    try{ localStorage.setItem(KEY, raw); return true; }
    catch(err){
      /* المساحة ممتلئة: نمسح النسخ القديمة المكررة اللي مبقتش مستخدمة ونعيد المحاولة */
      try{ if(OLD_ENC_KEY) localStorage.removeItem(OLD_ENC_KEY); }catch(e){}
      try{ localStorage.removeItem('hr7_employee_app_users'); }catch(e){}
      try{ localStorage.setItem(KEY, raw); return true; }catch(err2){ console.error('ARIBA V100: storage full', err2); return false; }
    }
  }

  /* أول تشغيل: لو hr7_emps فاضي والنسخة القديمة فيها بيانات، ننقلها */
  (function migrate(){
    var cur = readMaster();
    if(cur && cur.length) return;
    try{
      var old = (typeof window.db === 'function') ? window.db('emps', null) : null;
      if(Array.isArray(old) && old.length) writeMaster(old);
    }catch(e){}
  })();

  /* 1) مصدر واحد للقراءة والكتابة */
  var prevDb = window.db, prevDbS = window.dbS;
  window.db = function(k, def){
    if(k === 'emps'){
      var a = readMaster();
      if(a && a.length) return a;
      return (typeof prevDb === 'function') ? prevDb.apply(this, arguments) : def;
    }
    return prevDb.apply(this, arguments);
  };
  window.dbS = function(k, v){
    if(k === 'emps' && Array.isArray(v)){
      /* دمج بالـ id: أي قائمة جزئية (زي الموظفين النشطين بس) متمسحش باقي الموظفين */
      var cur = readMaster() || [], byId = {}, order = [];
      cur.forEach(function(e){ var i = sid(e); if(!i) return; if(!byId[i]) order.push(i); byId[i] = e; });
      v.forEach(function(e){ var i = sid(e); if(!i) return; if(!byId[i]) order.push(i); byId[i] = e; });
      writeMaster(order.map(function(i){ return byId[i]; }));
      return;
    }
    return prevDbS.apply(this, arguments);
  };

  /* 2) طابور المزامنة مع السحابة (بيتحفظ، فلو قفلت البرنامج بيكمل لما تفتحه) */
  function getQ(){ var q = readJSON(QKEY, []); return Array.isArray(q) ? q.map(String) : []; }
  function setQ(q){ try{ localStorage.setItem(QKEY, JSON.stringify(Array.from(new Set(q)))); }catch(e){} }
  function enqueue(ids){ if(!ids || !ids.length) return; setQ(getQ().concat(ids.map(String))); }
  function isQueued(id){ return getQ().indexOf(String(id)) >= 0; }

  var rawSync = window.aribaSyncEmployee;   /* الدالة الأصلية اللي بتكلم ariba_sync_employee */

  function isoDate(v){
    if(!v) return '';
    var s = String(v).trim();
    if(/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    var m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if(m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    return '';
  }
  function cloudReady(){ var t = window.ARIBA_HR_TOKEN || ''; return UUID_RE.test(t); }

  var flushing = false, again = false, timer = null, userSave = false, warnedLocal = false;

  function scheduleFlush(ms){ if(timer) clearTimeout(timer); timer = setTimeout(flush, ms == null ? 200 : ms); }

  async function flush(){
    timer = null;
    if(flushing){ again = true; return; }
    var q = getQ();
    if(!q.length){ userSave = false; return; }
    if(!cloudReady()){
      if(userSave && !warnedLocal){
        warnedLocal = true;
        say('⚠ اتحفظ على الجهاز ده بس — إنت داخل بحساب محلي أو الجلسة خلصت. سجّل دخول بحسابك السحابي وهيتبعت تلقائيًا لتطبيق الموظف', 'ter');
      }
      userSave = false;
      return;
    }
    if(typeof rawSync !== 'function'){ return; }
    flushing = true;
    var all = readMaster() || [], byId = {};
    all.forEach(function(e){ byId[sid(e)] = e; });
    var ok = 0, failed = [], lastErr = '';
    for(var i = 0; i < q.length; i++){
      var id = q[i], e = byId[id];
      if(!e){ continue; } /* اتحذف — مفيش حاجة تتبعت */
      var payload = Object.assign({}, e);
      payload.dob = isoDate(e.dob);
      payload.contractJoin = isoDate(e.contractJoin || e.cj);
      try{
        await rawSync(payload);
        ok++;
      }catch(err){
        failed.push(id);
        lastErr = String(err && err.message || err || '');
      }
    }
    /* شيل اللي اتبعت بنجاح بس (ولو اتضاف حاجة جديدة للطابور أثناء الإرسال تفضل) */
    var sent = q.filter(function(id){ return failed.indexOf(id) < 0; });
    setQ(getQ().filter(function(id){ return sent.indexOf(id) < 0; }));
    flushing = false;

    if(userSave){
      if(Date.now() - (window.__ARIBA_SAVE_FAILED_AT || 0) < 8000){ /* الحفظ اترفض — منغطيش على رسالة الخطأ */ }
      else if(!failed.length && ok) say('✓ تم الحفظ ووصل التعديل لتطبيق الموظف', 'tin');
      else if(failed.length){
        var why = /جلسة|NOT_AUTHORIZED|uuid/i.test(lastErr) ? 'الجلسة انتهت — سجّل الدخول تاني' : 'مشكلة في الاتصال';
        var cmsg = '';
        try{ var js = String(lastErr); js = JSON.parse(js.slice(js.indexOf('{'))); cmsg = String(js.message||''); }catch(x){ cmsg = String(lastErr); }
        var cm = cmsg.indexOf('CONFLICT:') >= 0 ? cmsg.slice(cmsg.indexOf('CONFLICT:') + 9).trim() : '';
        if(cm){ say('❌ مااتبعتش للسحابة: ' + cm, 'ter'); }
        else say('⚠ اتحفظ على الجهاز، لكن مااتبعتش للسحابة (' + why + '). هنعيد المحاولة تلقائيًا', 'ter');
      }
    }
    userSave = false;
    if(again){ again = false; scheduleFlush(300); }
  }

  /* أي مكان تاني في البرنامج بينادي aribaSyncEmployee (زي المزامنة الشاملة القديمة لكل
     الموظفين بعد كل حفظ) بقى بيبعت بس الموظفين اللي اتعدلوا فعلًا */
  window.aribaSyncEmployee = function(e){
    if(e && isQueued(sid(e))){ scheduleFlush(150); }
    return Promise.resolve({ ok: true, queued: true });
  };
  window.aribaSyncEmployeeNow = function(e){ enqueue([sid(e)]); return flush(); };

  /* 3) الحفظ نفسه: نعرف مين اتغير، ونتأكد إنه اتكتب، ونبعته */
  function snapshot(){
    /* بنقارن بالنسخة "المُجهّزة" (getEmps) مش الخام، عشان الحقول اللي البرنامج
       بيكمّلها تلقائيًا متتحسبش تعديل، ويتبعت الموظف اللي اتعدل فعلًا بس */
    var m = {}, src = null;
    try{ src = (typeof window.getEmps === 'function') ? window.getEmps() : null; }catch(e){}
    if(!Array.isArray(src)) src = readMaster() || [];
    src.forEach(function(e){ m[sid(e)] = JSON.stringify(e); });
    (readMaster() || []).forEach(function(e){ var i = sid(e); if(!(i in m)) m[i] = JSON.stringify(e); });
    return m;
  }
  var prevSave = window.saveEmps;
  if(typeof prevSave === 'function'){
    window.saveEmps = function(d){
      var before = snapshot();
      var r = prevSave.apply(this, arguments);
      /* تأكيد إن البيانات اتكتبت فعلًا */
      if(Array.isArray(d) && d.length){
        var after = readMaster() || [], afterById = {};
        after.forEach(function(e){ afterById[sid(e)] = JSON.stringify(e); });
        var del = deletedIds();
        var lost = d.filter(function(e){ var i = sid(e); return i && !del.has(i) && afterById[i] !== JSON.stringify(e); });
        if(lost.length){
          dbS('emps', d);                 /* إعادة الكتابة من المصدر الموحد */
          after = readMaster() || []; afterById = {};
          after.forEach(function(e){ afterById[sid(e)] = JSON.stringify(e); });
          lost = lost.filter(function(e){ return afterById[sid(e)] !== JSON.stringify(e); });
          if(lost.length) say('❌ لم يتم الحفظ: مساحة التخزين في المتصفح ممتلئة. احذف صور الموظفين الكبيرة أو صدّر نسخة احتياطية', 'ter');
        }
      }
      var changed = [];
      (readMaster() || []).forEach(function(e){ var i = sid(e); if(i && before[i] !== JSON.stringify(e)) changed.push(i); });
      if(changed.length){ enqueue(changed); scheduleFlush(250); }
      return r;
    };
  }

  /* حفظ نموذج الموظف: نعلّم إن ده حفظ من المستخدم عشان نوريه النتيجة */
  var prevSEmp = window.sEmp;
  if(typeof prevSEmp === 'function'){
    window.sEmp = function(){
      userSave = true; warnedLocal = false;
      var r = prevSEmp.apply(this, arguments);
      setTimeout(function(){ if(!timer && !flushing) userSave = false; }, 1500);
      return r;
    };
  }
  ['termEmp', 'reinstate', 'saveLeaveBalanceAdjustment', 'uForm', 'globalUndo'].forEach(function(n){
    var f = window[n];
    if(typeof f === 'function' && !f.__v100){
      window[n] = function(){ userSave = true; warnedLocal = false; return f.apply(this, arguments); };
      window[n].__v100 = true;
    }
  });

  /* زر "تحديث البيانات": يبعت كل الموظفين (يدوي فقط) */
  var prevSyncAll = window.syncAll;
  if(typeof prevSyncAll === 'function'){
    window.syncAll = async function(){
      enqueue((readMaster() || []).map(sid).filter(Boolean));
      userSave = true;
      var r = await prevSyncAll.apply(this, arguments);
      await flush();
      return r;
    };
  }

  /* إعادة محاولة تلقائية لأي حاجة لسه في الطابور */
  setInterval(function(){ if(getQ().length && cloudReady()) scheduleFlush(0); }, 20000);
  window.addEventListener('online', function(){ scheduleFlush(500); });
  window.addEventListener('focus', function(){ if(getQ().length) scheduleFlush(500); });
  setTimeout(function(){ if(getQ().length) scheduleFlush(0); }, 3000);


  /* 4) نموذج الموظف: المتصفح كان بيرفض الحفظ بصمت لو البدل فيه كسور أكتر من رقمين
        (مثلاً بدل سكن 25% = 1017.8125) لأن الحقل مسموح له بـ 0.01 بس.
        بنسمح بأي كسور، ولو في أي حقل تاني غلط بنقول للمستخدم اسمه بالظبط. */
  function fieldLabel(el){
    try{
      var box = el.closest('.fg, .fgr, div');
      var l = box && box.querySelector('label');
      return (l && l.textContent.trim()) || el.getAttribute('placeholder') || el.name || '';
    }catch(e){ return el.name || ''; }
  }
  function fixEmpForm(){
    var f = document.getElementById('EF2'); if(!f) return;
    f.querySelectorAll('input[type="number"]').forEach(function(i){ i.step = 'any'; });
    if(!f.__v100inv){
      f.__v100inv = true;
      var shown = 0;
      f.addEventListener('invalid', function(ev){
        var now = Date.now(); if(now - shown < 800) return; shown = now;
        var el = ev.target;
        say('⚠ مااتحفظش: راجع حقل "' + fieldLabel(el) + '" — ' + (el.validationMessage || 'قيمة غير صحيحة'), 'ter');
        try{ el.scrollIntoView({ block: 'center' }); }catch(e){}
      }, true);
    }
  }
  fixEmpForm();
  var prevEdit = window.editEmp;
  if(typeof prevEdit === 'function'){
    window.editEmp = function(){ var r = prevEdit.apply(this, arguments); fixEmpForm(); return r; };
  }
  document.addEventListener('DOMContentLoaded', fixEmpForm);
  setTimeout(fixEmpForm, 1500);

  /* تحديث الشاشة بعد التعديل */
  window.ARIBA_V100_STATUS = function(){ return { master: (readMaster() || []).length, pending: getQ(), cloud: cloudReady() }; };
})();
