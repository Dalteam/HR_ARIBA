
/* ============================================================
   ARIBA V61 — إصلاح إضافي فقط (Additive-only patch)
   كارت "ملخص الرواتب" (id="PS") في لوحة التحكم كان عنصر HTML
   فاضي من غير أي كود يملأه أبدًا في الملف كله. إضافة دالة تحسب
   ملخص بسيط (إجمالي الرواتب، الصافي، عدد الموظفين) من قائمة
   الموظفين الحاليين وتعرضه في نفس المكان، وتتحدث كل مرة تُفتح
   فيها لوحة التحكم.
   ============================================================ */
(function(){
  'use strict';
  function renderSalarySummary(){
    try{
      var el = document.getElementById('PS');
      if(!el) return;
      var a = (typeof window.aEmps === 'function') ? window.aEmps() : [];
      if(!a.length){ el.innerHTML = '<div style="color:var(--mu);text-align:center;padding:14px;font-size:12px">لا توجد بيانات رواتب حالياً</div>'; return; }
      var totalGross = 0, totalNet = 0;
      a.forEach(function(e){
        totalGross += Number(e.salaryTotal || ((Number(e.salary||e.sal||0)) + Number(e.housingAllowance||e.hou||0) + Number(e.transportAllowance||e.tra||0) + Number(e.projectAllowance||0) + Number(e.otherAllowance||0)) || 0);
        totalNet += Number(e.netSalary || e.net || 0);
      });
      function fmt(n){ return Math.round(n).toLocaleString('en-US') + ' ر.س'; }
      el.innerHTML =
        '<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:12px"><span style="color:var(--mu)">عدد الموظفين</span><strong>' + a.length + '</strong></div>' +
        '<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:12px;border-top:1px solid var(--bd)"><span style="color:var(--mu)">إجمالي الرواتب</span><strong style="color:var(--gr)">' + fmt(totalGross) + '</strong></div>' +
        '<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:12px;border-top:1px solid var(--bd)"><span style="color:var(--mu)">إجمالي الصافي</span><strong style="color:var(--cy)">' + fmt(totalNet) + '</strong></div>';
    }catch(e){ console.warn('ARIBA V61 salary summary', e); }
  }
  window.aribaRenderSalarySummary = renderSalarySummary;
  setTimeout(renderSalarySummary, 700);
  var oldLoadDash61 = window.loadDash;
  if(typeof oldLoadDash61 === 'function' && !oldLoadDash61.__v61){
    window.loadDash = function(){
      var r = oldLoadDash61.apply(this, arguments);
      setTimeout(renderSalarySummary, 100);
      return r;
    };
    window.loadDash.__v61 = true;
  }
})();
