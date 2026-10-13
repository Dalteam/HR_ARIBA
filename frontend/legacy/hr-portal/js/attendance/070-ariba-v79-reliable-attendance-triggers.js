
/* ============================================================
   ARIBA V79 — إضافة فقط: ضمان إن مزامنة الحضور تتشغّل بشكل مضمون
   1) فور الدخول لصفحة "الحضور والانصراف" مباشرة
   2) زرار تحديث واضح ومخصص جوه كارت "سجل الحضور" نفسه
   3) بعد نجاح تسجيل الدخول السحابي مباشرة (بدل انتظار مؤقت)
   ============================================================ */
(function(){
  'use strict';

  function doSync(btn){
    if(typeof window.aribaSyncAttNow === 'function') window.aribaSyncAttNow(btn);
  }

  function injectAttRefreshBtn(){
    try{
      var header = document.querySelector('#t_attlog');
      if(!header) return;
      var toolbar = header.closest('.ch') ? header.closest('.ch').querySelector('div[style*="display:flex"]') : null;
      if(!toolbar || document.getElementById('v79AttRefresh')) return;
      var btn = document.createElement('button');
      btn.id = 'v79AttRefresh';
      btn.className = 'btn bsm';
      btn.style.cssText = 'background:#0a5c9e;color:#fff';
      btn.title = 'تحديث الحضور من السحابة الآن';
      btn.innerHTML = '<i class="ti ti-refresh"></i>';
      btn.onclick = function(){ doSync(btn); };
      toolbar.insertBefore(btn, toolbar.firstChild);
    }catch(e){}
  }

  var oldShowPg79 = window.showPg;
  if(typeof oldShowPg79 === 'function' && !oldShowPg79.__v79){
    window.showPg = function(id, el){
      var r = oldShowPg79.apply(this, arguments);
      if(id === 'att'){ setTimeout(function(){ injectAttRefreshBtn(); doSync(null); }, 150); }
      return r;
    };
    window.showPg.__v79 = true;
  }

  setInterval(injectAttRefreshBtn, 2000);
})();
