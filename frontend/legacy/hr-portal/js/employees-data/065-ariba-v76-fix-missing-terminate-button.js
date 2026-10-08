
/* ============================================================
   ARIBA V76 — إصلاح: زرار "استبعاد" (نقل الموظف لمنتهية الخدمة)
   كان غائبًا تمامًا من كل صف موظف نشط في قائمة الموظفين — نسخة
   عرض الجدول الحالية كانت بتضيف زرار "رجوع" للمنتهية خدماتهم
   بس، من غير ما تضيف زرار الاستبعاد للموظفين النشطين. الإصلاح
   يضيف الزرار الناقص فقط، بدون تعديل أي منطق حساب أو عرض تاني.
   ============================================================ */
(function(){
  'use strict';
  function injectTermButtons(){
    try{
      var table = document.getElementById('ET');
      if(!table) return;
      var rows = table.querySelectorAll('tr');
      rows.forEach(function(row){
        var delBtn = row.querySelector('button[onclick^="delEmp"]');
        if(!delBtn) return; // مش صف موظف (زي صف العناوين)
        if(row.querySelector('[data-v76-term], button[onclick^="reinstate"]')) return; // موجود بالفعل
        var m = delBtn.getAttribute('onclick').match(/delEmp\('([^']+)'/);
        if(!m) return;
        var id = m[1];
        var btn = document.createElement('button');
        btn.className = 'btn bsm';
        btn.setAttribute('data-v76-term', '1');
        btn.style.color = 'var(--rd)';
        btn.title = 'استبعاد (نقل لمنتهية الخدمة)';
        btn.innerHTML = '<i class="ti ti-user-off"></i>';
        btn.onclick = function(){ if(typeof window.termEmp === 'function') window.termEmp(id); };
        delBtn.parentNode.insertBefore(btn, delBtn.nextSibling);
        delBtn.insertAdjacentText('afterend', ' ');
      });
    }catch(e){}
  }

  var oldREmps76 = window.rEmps;
  if(typeof oldREmps76 === 'function' && !oldREmps76.__v76){
    window.rEmps = function(){
      var r = oldREmps76.apply(this, arguments);
      setTimeout(injectTermButtons, 30);
      return r;
    };
    window.rEmps.__v76 = true;
  }

  setInterval(injectTermButtons, 2000);
})();
