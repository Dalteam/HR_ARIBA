
/* ============================================================
   ARIBA V82 — إضافة فقط: حجب فعلي لأي حساب بصلاحية "مالية"
   (Finance) عن كل تبويبات البرنامج ما عدا قسم المالية (مسير
   الرواتب، كشف الراتب، نهاية الخدمة، المخالصة). بيتحقق من
   الصلاحية الحقيقية من قاعدة البيانات (مش من بيانات محلية يمكن
   التلاعب بيها من نفس الجهاز)، وبيمنع التنقل المباشر كمان.
   ============================================================ */
(function(){
  'use strict';
  var CLOUD_URL = 'https://iwviydmapqpqihcdazpe.supabase.co';
  var CLOUD_KEY = 'sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB';
  var FINANCE_ALLOWED = ['pay','slip','eos','eoscalc'];
  var currentRole = null;
  var restrictionApplied = false;

  async function fetchRole(){
    if(!window.ARIBA_HR_TOKEN || window.ARIBA_HR_TOKEN === 'local_admin_token') return null;
    try{
      var r = await fetch(CLOUD_URL+'/rest/v1/rpc/ariba_session_row', {
        method:'POST',
        headers:{apikey:CLOUD_KEY, Authorization:'Bearer '+CLOUD_KEY, 'Content-Type':'application/json'},
        body: JSON.stringify({p_token: window.ARIBA_HR_TOKEN})
      });
      if(!r.ok) return null;
      var d = await r.json();
      var row = Array.isArray(d) ? d[0] : d;
      return row && row.role ? row.role : null;
    }catch(e){ return null; }
  }

  function hideNonFinanceNav(){
    document.querySelectorAll('.ni').forEach(function(el){
      var id = (el.id||'').replace(/^ni-/,'');
      if(FINANCE_ALLOWED.indexOf(id) === -1) el.style.display = 'none';
    });
    document.querySelectorAll('.ns').forEach(function(el){
      // إخفاء عناوين الأقسام اللي مش فيها أي عنصر مالي ظاهر
      var next = el.nextElementSibling, hasVisible = false;
      while(next && next.classList && next.classList.contains('ni')){
        if(next.style.display !== 'none') hasVisible = true;
        next = next.nextElementSibling;
      }
      if(!hasVisible) el.style.display = 'none';
    });
  }

  function guardNavigation(){
    var oldShowPg82 = window.showPg;
    if(typeof oldShowPg82 !== 'function' || oldShowPg82.__v82) return;
    window.showPg = function(id, el){
      if(currentRole === 'finance' && FINANCE_ALLOWED.indexOf(id) === -1){
        if(typeof toast==='function') toast('⛔ غير مصرح لك بالوصول لهذا القسم', 'ter');
        return oldShowPg82.call(this, 'pay', document.getElementById('ni-pay'));
      }
      return oldShowPg82.apply(this, arguments);
    };
    window.showPg.__v82 = true;
  }

  async function applyRestrictionIfNeeded(){
    if(!window.ARIBA_HR_TOKEN || window.ARIBA_HR_TOKEN === 'local_admin_token') return;
    var role = await fetchRole();
    if(!role) return;
    currentRole = role;
    guardNavigation();
    if(role === 'finance' && !restrictionApplied){
      hideNonFinanceNav();
      restrictionApplied = true;
      // لو حالياً واقف على صفحة غير مسموح بيها، رجّعه لصفحة المسير
      var activePg = document.querySelector('.pg.on');
      if(activePg && FINANCE_ALLOWED.indexOf(activePg.id.replace(/^pg-/,'')) === -1){
        if(typeof window.showPg === 'function') window.showPg('pay', document.getElementById('ni-pay'));
      }
    }
  }

  setInterval(applyRestrictionIfNeeded, 2000);
})();
