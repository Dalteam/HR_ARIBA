
(function(){
  'use strict';
  window.aribaSyncAttNow = function(btn){
    var orig = btn ? btn.innerHTML : '';
    if(btn){ btn.innerHTML = '<i class="ti ti-loader-2"></i>'; btn.disabled = true; }
    Promise.resolve(typeof window.syncSecureAttendance === 'function' ? window.syncSecureAttendance() : {ok:false, reason:'NOT_LOADED'})
      .then(function(res){
        if(!res){ if(typeof toast==='function') toast('تعذر التحديث', 'ter'); return; }
        if(res.ok){
          if(typeof toast==='function') toast('✓ تم التحديث — '+res.count+' سجل حضور لتاريخ '+res.date, 'tin');
        } else if(res.reason === 'NO_TOKEN'){
          if(typeof toast==='function') toast('⚠️ محتاج تسجيل دخول أولاً', 'ter');
        } else if(res.reason === 'LOCAL_ONLY'){
          if(typeof toast==='function') toast('⚠️ انت مسجل دخول محلي — سجل دخول سحابي حقيقي (يوزر وباسورد)', 'ter');
        } else if(res.reason === 'HTTP_ERROR'){
          if(typeof toast==='function') toast('⚠️ خطأ من الخادم ('+res.status+'): '+(res.detail||''), 'ter');
        } else {
          if(typeof toast==='function') toast('⚠️ خطأ: '+(res.detail||res.reason||'غير معروف'), 'ter');
        }
      })
      .catch(function(err){ if(typeof toast==='function') toast('⚠️ خطأ غير متوقع: '+err.message, 'ter'); })
      .finally(function(){ if(btn){ btn.innerHTML = orig; btn.disabled = false; } });
  };
})();
