
/* V114: توضيح زر الاعتماد بالنيابة عن المدير المباشر في طلبات الموظفين (إضافة فقط) */
(function(){
  'use strict';
  /* ---------- HR: توضيح زر الموافقة بالنيابة عن المدير المباشر/الرئيس التنفيذي في الطلبات المعلقة ---------- */
  function decorateQ(){
    try{
      var box=document.getElementById('LVP'); if(!box) return;
      box.querySelectorAll('button[onclick*="ariba62Approve"]').forEach(function(b){
        if(b.getAttribute('data-v114q')==='1') return;
        var it=null; try{ it=JSON.parse(b.getAttribute('data-item')||'null'); }catch(e){}
        var r=(it&&it.request)||{};
        if(r.status && r.status!=='pending') return;
        var txt = r.current_stage==='manager' ? '✓ موافقة نيابة عن المدير المباشر' : r.current_stage==='ceo' ? '✓ موافقة نيابة عن الرئيس التنفيذي' : null;
        b.setAttribute('data-v114q','1');
        if(txt){ b.textContent=txt; b.title='الموارد البشرية تعتمد الطلب بالنيابة عن صاحب المرحلة الحالية'; }
      });
    }catch(e){}
  }
  setInterval(decorateQ,800);
})();
