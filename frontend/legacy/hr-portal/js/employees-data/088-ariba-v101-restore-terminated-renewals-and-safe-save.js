
/* ============================================================
   ARIBA V101/V102
   1) الموظفين المنتهية خدماتهم اللي كانوا متخزنين في أرشيف منفصل (hr7_term_emps)
      مكانوش بيظهروا في تبويب "منتهي الخدمة" — بقوا في قائمة واحدة مع الكل.
   2) تجديد العقد لموظف اتقفل تلقائيًا بسبب "انتهاء العقد" بيرجّعه نشط بالكامل.
   3) منع دمج موظفين مختلفين لمجرد إن ليهم نفس الرقم الوظيفي (كان بيخفي موظف
      ويخلي الحفظ يفشل بصمت).
   4) استرجاع أي موظف موجود في السحابة واختفى من الجهاز.
   5) لو الحفظ فشل لأي سبب، تظهر رسالة واضحة بدل السكوت.
   ============================================================ */
(function(){
  'use strict';
  if(window.__ARIBA_V101) return; window.__ARIBA_V101 = true;

  var KEY = 'hr7_emps', TKEY = 'hr7_term_emps', DKEY = 'hr7_deleted_employee_ids';
  var SUPA = 'https://iwviydmapqpqihcdazpe.supabase.co', ANON = 'sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB';
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var AUTO_REASONS = /انتهاء (مدة )?العقد|انتهاء فترة التدريب|انتهاء التدريب/;

  function rj(k, fb){ try{ var r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; }catch(e){ return fb; } }
  function wj(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); return true; }catch(e){ return false; } }
  function say(m, t){ try{ window.toast(m, t || 'tok'); }catch(e){} }
  function nn(v){ return String(v || '').replace(/\s+/g, ' ').trim().toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه'); }
  function deleted(){ return new Set((rj(DKEY, []) || []).map(String)); }
  function today(){ return new Date().toISOString().slice(0, 10); }

  /* ---- 3) الدمج بالـ id بس، مش بالرقم الوظيفي ---- */
  window.dedupeEmployeeList = function(list){
    /* نفس الشخص (نفس الرقم الوظيفي + نفس الاسم) بس اللي يتدمج — شخصين مختلفين بنفس الرقم يفضلوا اتنين */
    var map = new Map();
    (list || []).forEach(function(e){
      if(!e) return;
      var name = nn(e.nameAr || e.nameEn || '');
      var k = name ? (String(e.empNo != null ? e.empNo : e.id) + '|' + name) : ('id:' + String(e.id));
      var old = map.get(k);
      map.set(k, old ? Object.assign({}, old, e) : e);
    });
    return Array.from(map.values());
  };

  /* الـ id دايمًا نص — عشان البحث عن الموظف وقت الحفظ ميفشلش لو كان رقم */
  var prevDb = window.db;
  window.db = function(k){
    var r = prevDb.apply(this, arguments);
    if(k === 'emps' && Array.isArray(r)) r.forEach(function(e){ if(e && e.id != null && typeof e.id !== 'string') e.id = String(e.id); });
    return r;
  };

  /* ---- 2) رجوع الموظف نشط لو عقده اتجدد ---- */
  function reactivateIfRenewed(e){
    if(!e || !(e.isTerminated || e.term)) return false;
    var reason = String(e.terminationReason || e.reason || '');
    if(reason && !AUTO_REASONS.test(reason)) return false;           /* إنهاء خدمة يدوي — منلمسوش */
    var ce = e.contractEnd || e.ce || '';
    var indefinite = String(e.contractNature || '') === 'indefinite';
    if(!indefinite && !(ce && ce >= today())) return false;           /* العقد لسه منتهي */
    if(!indefinite && e.lastDay && ce <= e.lastDay) return false;     /* مفيش تجديد بعد تاريخ الإنهاء */
    e.isTerminated = false; e.term = false;
    ['lastDay', 'terminationReason', 'reason', 'terminationDate', 'ld', 'tr'].forEach(function(f){ if(f in e) e[f] = ''; });
    return true;
  }

  /* ---- 1) قائمة واحدة لكل الموظفين (نشطين + منتهية خدماتهم) ---- */
  function consolidate(){
    var master = rj(KEY, null); if(!Array.isArray(master)) return 0;
    var arch = rj(TKEY, []); if(!Array.isArray(arch)) arch = [];
    var del = deleted(), ids = {}, names = {}, changed = 0;
    master.forEach(function(e){ if(!e) return; ids[String(e.id)] = true; if(e.nameAr) names[nn(e.nameAr)] = true; });
    arch.forEach(function(a){
      if(!a || a.id == null) return;
      var id = String(a.id);
      if(del.has(id) || ids[id] || (a.nameAr && names[nn(a.nameAr)])) return;
      var rec = Object.assign({}, a, { id: id, isTerminated: true, term: true });
      master.push(rec); ids[id] = true; if(rec.nameAr) names[nn(rec.nameAr)] = true; changed++;
    });
    master.forEach(function(e){ if(reactivateIfRenewed(e)) changed++; });
    if(changed) wj(KEY, master);
    return changed;
  }

  /* تصحيح لمرة واحدة: زينب محمد شاكر — العقد اتجدد لـ 2027-08-18 */
  function zainabFix(){
    if(localStorage.getItem('hr7_v101_zainab_fixed')) return;
    var master = rj(KEY, null); if(!Array.isArray(master)) return;
    var z = master.find(function(e){ return e && /زينب محمد شاكر/.test(e.nameAr || ''); });
    if(!z) return;  /* مش موجودة على الجهاز — هتترجع من السحابة */
    if(!z.contractEnd || z.contractEnd < '2027-08-18'){ z.contractEnd = '2027-08-18'; z.ce = '2027-08-18'; }
    z.isTerminated = false; z.term = false;
    ['lastDay', 'terminationReason', 'reason', 'terminationDate', 'ld', 'tr'].forEach(function(f){ if(f in z) z[f] = ''; });
    wj(KEY, master);
    var arch = rj(TKEY, []); if(Array.isArray(arch)) wj(TKEY, arch.filter(function(a){ return !(a && (String(a.id) === String(z.id) || /زينب محمد شاكر/.test(a.nameAr || ''))); }));
    var d = rj(DKEY, []); if(Array.isArray(d)) wj(DKEY, d.filter(function(x){ return String(x) !== String(z.id); }));
    localStorage.setItem('hr7_v101_zainab_fixed', '1');
  }

  function refreshUI(){ try{ window.rEmps(); }catch(e){} try{ window.uBadges(); }catch(e){} try{ window.loadDash(); }catch(e){} }

  consolidate(); zainabFix(); consolidate();

  /* قائمة المنتهية خدماتهم = من القائمة الموحدة */
  window.tEmps = function(){
    consolidate();
    var del = deleted();
    return (rj(KEY, []) || []).filter(function(e){ return e && !del.has(String(e.id)) && (e.isTerminated || e.term); });
  };
  var prevR = window.rEmps;
  if(typeof prevR === 'function'){
    window.rEmps = function(){ consolidate(); return prevR.apply(this, arguments); };
  }
  var prevSyncAll = window.syncAll;
  if(typeof prevSyncAll === 'function'){
    window.syncAll = async function(){ var r = await prevSyncAll.apply(this, arguments); consolidate(); refreshUI(); return r; };
  }

  /* ---- 5) الحفظ: رسالة واضحة لو فشل + تفعيل الموظف لو العقد اتجدد ---- */
  var saved = false;
  var prevSave = window.saveEmps;
  window.saveEmps = function(){ saved = true; return prevSave.apply(this, arguments); };

  var prevSEmp = window.sEmp;
  window.sEmp = function(ev){
    var eid = (document.getElementById('EID') || {}).value || '';
    var tst = document.getElementById('TST'), before = tst ? tst.textContent + '|' + tst.className : '';
    saved = false;
    var r, err = null;
    try{ r = prevSEmp.apply(this, arguments); }catch(ex){ err = ex; console.error('ARIBA V101 sEmp', ex); }
    try{ if(ev && ev.preventDefault) ev.preventDefault(); }catch(e){}
    var after = tst ? tst.textContent + '|' + tst.className : '';
    if(!saved){
      window.__ARIBA_SAVE_FAILED_AT = Date.now();
      if(err || after === before){
        say('❌ مااتحفظش: ' + (err ? ('خطأ: ' + (err.message || err)) : 'مش لاقي الموظف في البيانات — اعمل تحديث للصفحة وجرّب تاني'), 'ter');
        wj('hr7_v101_last_save_error', { at: new Date().toISOString(), id: eid, error: err ? String(err.message || err) : 'employee-not-found', count: (rj(KEY, []) || []).length });
      }
    } else if(eid){
      /* لو التعديل كان تجديد عقد لموظف اتقفل تلقائيًا، رجّعه نشط */
      var list = rj(KEY, []) || [], e = list.find(function(x){ return x && String(x.id) === String(eid); });
      if(e && reactivateIfRenewed(e)){
        e.updatedAt = new Date().toISOString();
        window.saveEmps(list);
        say('✓ تم تجديد العقد ورجوع الموظف للخدمة', 'tin');
      }
    }
    return r;
  };

  /* ---- 4) استرجاع الموظفين الموجودين في السحابة وناقصين من الجهاز ---- */
  var recovered = false;
  function xhrRpc(fn, args){
    /* XHR عادي عشان في باتش قديم بيمنع الطلب ده عن طريق fetch */
    return new Promise(function(res, rej){
      var x = new XMLHttpRequest();
      x.open('POST', SUPA + '/rest/v1/rpc/' + fn);
      x.setRequestHeader('apikey', ANON); x.setRequestHeader('Authorization', 'Bearer ' + ANON);
      x.setRequestHeader('Content-Type', 'application/json');
      x.onload = function(){ try{ var d = JSON.parse(x.responseText || 'null'); if(x.status >= 200 && x.status < 300) res(d); else rej(new Error((d && d.message) || x.status)); }catch(e){ rej(e); } };
      x.onerror = function(){ rej(new Error('network')); };
      x.send(JSON.stringify(args || {}));
    });
  }
  async function recoverFromCloud(){
    if(recovered || !UUID_RE.test(window.ARIBA_HR_TOKEN || '')) return;
    recovered = true;
    try{
      var d = await xhrRpc('ariba_staff_employees', { p_token: window.ARIBA_HR_TOKEN });
      var rows = (d && d.employees) || [];
      if(!rows.length) return;
      consolidate();
      var master = rj(KEY, []) || [], del = deleted(), ids = {}, names = {}, added = [], reactivated = [];
      master.forEach(function(e){ if(!e) return; ids[String(e.id)] = e; if(e.nameAr) names[nn(e.nameAr)] = e; });
      var SKIP = { password:1, pw:1, pwd:1, pass:1, passwordHash:1, u:1, username:1, id:1, active:1, isTerminated:1, term:1 };
      function empty(v){ return v === undefined || v === null || v === ''; }
      var filledEmps = 0, filledFields = 0;
      rows.forEach(function(c){
        if(!c || c.id == null) return;
        var loc = ids[String(c.id)] || (c.nameAr && names[nn(c.nameAr)]);
        if(loc){
          /* رجّع أي حقل ناقص هنا وموجود في السحابة — من غير ما نغيّر أي قيمة موجودة */
          var n = 0;
          Object.keys(c).forEach(function(k){
            if(SKIP[k] || empty(c[k])) return;
            if(empty(loc[k])){ loc[k] = c[k]; n++; }
          });
          if('pw' in loc) delete loc.pw;
          if(n){ filledEmps++; filledFields += n; }
        }
      });
      rows.forEach(function(c){
        if(!c || c.id == null) return;
        var id = String(c.id);
        if(del.has(id)) return;
        var local = ids[id] || (c.nameAr && names[nn(c.nameAr)]);
        var cloudActive = !(c.isTerminated === true || c.term === true);
        if(!local){
          var rec = Object.assign({}, c, { id: id });
          delete rec.password; delete rec.pw;
          rec.isTerminated = !cloudActive; rec.term = !cloudActive;
          master.push(rec); added.push(rec.nameAr || rec.nameEn || id);
        } else if((local.isTerminated || local.term) && cloudActive && (c.contractEnd || '') > (local.contractEnd || '') && AUTO_REASONS.test(String(local.terminationReason || local.reason || 'انتهاء العقد'))){
          /* الموظف اتجدد عقده في السحابة وهنا لسه متقفل */
          local.contractEnd = c.contractEnd; local.ce = c.contractEnd;
          reactivateIfRenewed(local); reactivated.push(local.nameAr || id);
        }
      });
      if(filledEmps && !(added.length || reactivated.length)){
        wj(KEY, master); refreshUI();
        say('✓ تم استرجاع ' + filledFields + ' حقل ناقص لـ ' + filledEmps + ' موظف من السحابة (تواريخ الميلاد، الجوازات، التأمين…)', 'tin');
      }
      if(added.length || reactivated.length){
        wj(KEY, master); refreshUI();
        say('✓ تم استرجاع ' + (added.length + reactivated.length) + ' موظف من السحابة: ' + added.concat(reactivated).slice(0, 5).join('، '), 'tin');
      }
    }catch(e){ recovered = false; console.warn('ARIBA V101 recover', e); }
  }
  setTimeout(recoverFromCloud, 2500);
  setInterval(recoverFromCloud, 5000);   /* بيشتغل مرة واحدة بس بعد تسجيل الدخول */

  setTimeout(refreshUI, 1200);
})();
