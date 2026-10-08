
/* ============================================================
   ARIBA V85 — إضافة فقط: ربط "وقت بدء العمل" و"هامش التأخير" في
   شاشة الإعدادات بقاعدة البيانات السحابية الفعلية اللي بتستخدمها
   دالة تسجيل الحضور من تطبيق الموظف — كانت الإعدادات دي محفوظة
   محليًا بس وبدون أي تأثير حقيقي على حساب التأخير.
   ============================================================ */
(function(){
  'use strict';
  var CLOUD_URL = 'https://iwviydmapqpqihcdazpe.supabase.co';
  var CLOUD_KEY = 'sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB';

  async function cloudRpc85(fn, args){
    if(!window.ARIBA_HR_TOKEN || window.ARIBA_HR_TOKEN === 'local_admin_token'){
      throw new Error('محتاج تسجيل دخول سحابي حقيقي');
    }
    var r = await fetch(CLOUD_URL+'/rest/v1/rpc/'+fn, {
      method:'POST',
      headers:{apikey:CLOUD_KEY, Authorization:'Bearer '+CLOUD_KEY, 'Content-Type':'application/json', 'Prefer':'return=representation'},
      body: JSON.stringify(Object.assign({p_token: window.ARIBA_HR_TOKEN}, args||{}))
    });
    var t = await r.text(), d = null;
    try{ d = t ? JSON.parse(t) : null; }catch(ex){}
    if(!r.ok) throw new Error((d && (d.message||d.hint||d.error)) || 'تعذر الاتصال');
    return d;
  }

  var oldSaveSet85 = window.saveSet;
  if(typeof oldSaveSet85 === 'function' && !oldSaveSet85.__v85){
    window.saveSet = function(){
      var r = oldSaveSet85.apply(this, arguments);
      try{
        var wst = (document.getElementById('CO_ST')||{}).value;
        var tol = (document.getElementById('CO_TOL')||{}).value;
        if(wst && tol !== ''){
          cloudRpc85('ariba_hr_set_attendance_settings', {p_work_start: wst+':00', p_tolerance_minutes: parseInt(tol,10)})
            .then(function(){ if(typeof toast==='function') toast('✓ الإعداد وصل لتطبيق الموظف فعليًا', 'tin'); })
            .catch(function(err){ if(typeof toast==='function') toast('⚠️ الإعداد اتحفظ محليًا بس مش في السحابة: '+err.message, 'ter'); });
        }
      }catch(e){}
      return r;
    };
    window.saveSet.__v85 = true;
  }

  async function loadCloudSettings(){
    var stEl = document.getElementById('CO_ST'), tolEl = document.getElementById('CO_TOL');
    if(!stEl || !tolEl || stEl.__v85loaded) return;
    try{
      var res = await cloudRpc85('ariba_get_attendance_settings', {});
      if(res && res.work_start){ stEl.value = String(res.work_start).slice(0,5); }
      if(res && res.tolerance_minutes != null){ tolEl.value = res.tolerance_minutes; }
      stEl.__v85loaded = true;
    }catch(e){}
  }

  setInterval(function(){
    if(document.getElementById('pg-set') && document.getElementById('pg-set').classList.contains('on')){
      loadCloudSettings();
    }
  }, 1500);
})();
