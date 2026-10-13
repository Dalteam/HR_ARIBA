
/* ============================================================
   ARIBA V66 — إضافة فقط
   المفاجأة: كود اختيار الشهر/السنة لكشف الراتب (وقراءته من مسير
   الرواتب المعتمد والمحفوظ hr7_pay_YYYY_MM) موجود بالفعل وكامل
   وشغال في الملف (window.rSlip) — لكن عنصري الاختيار نفسهم
   (select الشهر وselect السنة) مش موجودين في الصفحة أصلاً، فمفيش
   حد شايفهم. هذا الباتش بس بيضيف الاثنين جنب اختيار الموظف
   الموجود، وبعدين كل حاجة تشتغل تلقائي زي ما هي مكتوبة بالفعل.
   ============================================================ */
(function(){
  'use strict';
  function addSelectors(){
    try{
      var sle = document.getElementById('SLE');
      if(!sle || document.getElementById('SLM')) return; // already added or SLE not ready yet

      var m = document.createElement('select');
      m.id = 'SLM';
      m.style.cssText = 'max-width:130px';
      m.onchange = function(){ if(typeof window.rSlip==='function') window.rSlip(); };

      var y = document.createElement('select');
      y.id = 'SLY';
      y.style.cssText = 'max-width:100px';
      y.onchange = function(){ if(typeof window.rSlip==='function') window.rSlip(); };

      sle.parentNode.insertBefore(y, sle.nextSibling);
      sle.parentNode.insertBefore(m, sle.nextSibling);
    }catch(e){ console.warn('ARIBA V66 payslip selectors', e); }
  }

  addSelectors();
  setInterval(addSelectors, 1500);

  // لو تبويب كشف الراتب مفتوح دلوقتي، حدّثه فورًا بعد إضافة القوائم
  var oldShowPg66 = window.showPg;
  if(typeof oldShowPg66 === 'function' && !oldShowPg66.__v66){
    window.showPg = function(id, el){
      var r = oldShowPg66.apply(this, arguments);
      if(id === 'slip'){ setTimeout(addSelectors, 50); setTimeout(function(){ if(typeof window.loadSlipPg==='function') window.loadSlipPg(); }, 100); }
      return r;
    };
    window.showPg.__v66 = true;
  }
})();
