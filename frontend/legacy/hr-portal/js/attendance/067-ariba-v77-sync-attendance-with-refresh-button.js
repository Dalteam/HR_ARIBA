
/* ============================================================
   ARIBA V77 — إضافة فقط: زرار "تحديث البيانات" كان بيحدّث بيانات
   الموظفين بس، وما كانش بيحدّث الحضور خالص (الحضور كان بيعتمد
   على تايمر خلفي كل 30 ثانية فقط). دلوقتي بيحدّث الحضور فورًا
   كمان لحظة الضغط على نفس الزرار، وبيشغّل مزامنة فورية أول ما
   الصفحة تفتح بدل ما ينتظر الدورة التلقائية.
   ============================================================ */
(function(){
  'use strict';
  var oldSyncAll77 = window.syncAll;
  if(typeof oldSyncAll77 === 'function' && !oldSyncAll77.__v77){
    window.syncAll = function(){
      var r = oldSyncAll77.apply(this, arguments);
      try{ if(typeof window.syncSecureAttendance === 'function') window.syncSecureAttendance(); }catch(e){}
      return r;
    };
    window.syncAll.__v77 = true;
  }
  // مزامنة فورية أول ما الصفحة تفتح (بدل انتظار أول تايمر 30 ثانية)
  setTimeout(function(){ try{ if(window.ARIBA_HR_TOKEN && typeof window.syncSecureAttendance === 'function') window.syncSecureAttendance(); }catch(e){} }, 2500);
})();
