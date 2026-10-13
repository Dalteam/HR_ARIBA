
/* ============================================================
   ARIBA V77 — إصلاح: مزامنة الحضور كانت بتخزن معرف الموظف
   السحابي في البيانات المحلية، لكن شاشة عرض الحضور بتطابق
   بمعرف الموظف المحلي — ولو المعرفين مختلفين لنفس الشخص (بيحصل
   كتير مع موظفي XLS-...)، صف الحضور بتاعه ما كان يظهرش خالص.
   الإصلاح: أي بيانات حضور بتتخزن، نحول معرفها لنفس المعرف
   المحلي (عن طريق مطابقة الرقم الوظيفي empNo)، فيبقى العرض شغال
   لأي موظف بغض النظر عن اختلاف المعرفين.
   ============================================================ */
(function(){
  'use strict';
  function empNoMap(){
    var map = {};
    try{
      var list = (typeof window.aEmps === 'function' ? window.aEmps() : [])
        .concat(typeof window.tEmps === 'function' ? window.tEmps() : []);
      list.forEach(function(e){
        if(e && e.empNo !== undefined && e.empNo !== null){
          map[String(e.empNo)] = e.id;
        }
      });
    }catch(err){}
    return map;
  }

  var oldDbS77 = window.dbS;
  if(typeof oldDbS77 === 'function' && !oldDbS77.__v77){
    window.dbS = function(k, v){
      if(k === 'att' && Array.isArray(v)){
        try{
          var map = empNoMap();
          v = v.map(function(rec){
            if(rec && rec.empId != null && map[String(rec.empId)] && map[String(rec.empId)] !== rec.empId){
              var copy = Object.assign({}, rec);
              copy.empId = map[String(rec.empId)];
              return copy;
            }
            return rec;
          });
        }catch(err){}
      }
      return oldDbS77.call(this, k, v);
    };
    window.dbS.__v77 = true;
  }
})();
