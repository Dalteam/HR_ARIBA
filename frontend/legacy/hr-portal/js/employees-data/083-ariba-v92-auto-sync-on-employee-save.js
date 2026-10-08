
(function(){
  'use strict';
  /* أي تعديل أو إضافة موظف جديد من النموذج (تاريخ إقامة، عقد، جواز، راتب... إلخ)
     يتزامن فورًا مع السحابة بدون ما يحتاج الضغط على "تحديث البيانات" يدويًا،
     عشان برنامج الموظف والمخالصة والعمليات المالية تشوف التعديل أو الموظف الجديد فورًا. */
  var oldSEmp92 = window.sEmp;
  if(typeof oldSEmp92 === 'function' && !oldSEmp92.__v92){
    window.sEmp = function(ev){
      var eid = document.getElementById('EID') ? document.getElementById('EID').value : '';
      var isNew93 = !eid;
      var beforeIds93 = {};
      if(isNew93){
        try{ (typeof aEmps==='function'?aEmps():[]).concat(typeof tEmps==='function'?tEmps():[]).forEach(function(x){ beforeIds93[String(x.id)]=true; }); }catch(e0){}
      }
      var result = oldSEmp92.apply(this, arguments);
      try{
        if(window.ARIBA_HR_TOKEN && typeof window.aribaSyncEmployee === 'function'){
          var all = [];
          try{ all = (typeof aEmps==='function'?aEmps():[]).concat(typeof tEmps==='function'?tEmps():[]); }catch(e2){}
          var e = null;
          if(eid){
            e = all.find(function(x){ return String(x.id) === String(eid); });
          } else if(isNew93){
            /* موظف جديد اتضاف فعلًا — نلاقيه بمقارنة الـ IDs قبل وبعد، مش بعدد القايمة
               (عدد القايمة ممكن يتقلب لأسباب تانية زي فلاتر العرض) */
            e = all.find(function(x){ return !beforeIds93[String(x.id)]; });
          }
          if(e) window.aribaSyncEmployee(e).catch(function(){});
        }
      }catch(ex){}
      return result;
    };
    window.sEmp.__v92 = true;
  }
})();
