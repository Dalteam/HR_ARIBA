
/* ============================================================
   ARIBA V64 — إضافة فقط
   المشكلة: تعديلات الموظف (راتب/إجازة/بيانات) في الموارد البشرية
   كانت بتتحفظ محليًا بس ومحتاجة ضغط "تحديث البيانات" يدويًا عشان
   توصل لتطبيق الموظف. هذا الباتش يخلي أي حفظ للموظفين يبعت تلقائيًا
   (في الخلفية، بدون إبطاء الحفظ نفسه) لنفس قاعدة البيانات السحابية
   اللي تطبيق الموظف بيقرأ منها — خلال ثانيتين من الحفظ، وبتجميع
   عدة تعديلات سريعة في مزامنة واحدة بدل ما تتكرر لكل تعديل.
   ============================================================ */
(function(){
  'use strict';
  var timer = null;

  function scheduleSync(){
    if(!window.ARIBA_HR_TOKEN || window.ARIBA_HR_TOKEN === 'local_admin_token') return;
    if(timer) clearTimeout(timer);
    timer = setTimeout(async function(){
      try{
        var list = (typeof window.v60all === 'function') ? window.v60all() :
                   ((typeof window.getEmps === 'function') ? window.getEmps() : []);
        if(!Array.isArray(list) || !list.length || typeof window.aribaSyncEmployee !== 'function') return;
        for(var i=0; i<list.length; i++){
          try{ await window.aribaSyncEmployee(list[i]); }catch(e){}
        }
      }catch(e){ console.warn('ARIBA V64 auto-sync', e); }
    }, 2000);
  }

  var oldSaveEmps64 = window.saveEmps;
  if(typeof oldSaveEmps64 === 'function' && !oldSaveEmps64.__v64){
    window.saveEmps = function(){
      var r = oldSaveEmps64.apply(this, arguments);
      scheduleSync();
      return r;
    };
    window.saveEmps.__v64 = true;
  }

  var oldTermEmp64 = window.termEmp;
  if(typeof oldTermEmp64 === 'function' && !oldTermEmp64.__v64){
    window.termEmp = function(){ var r = oldTermEmp64.apply(this, arguments); scheduleSync(); return r; };
    window.termEmp.__v64 = true;
  }
  var oldReinstate64 = window.reinstate;
  if(typeof oldReinstate64 === 'function' && !oldReinstate64.__v64){
    window.reinstate = function(){ var r = oldReinstate64.apply(this, arguments); scheduleSync(); return r; };
    window.reinstate.__v64 = true;
  }
})();
