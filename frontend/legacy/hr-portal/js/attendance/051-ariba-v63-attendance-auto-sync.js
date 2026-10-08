
/* ============================================================
   ARIBA V63 — إضافة فقط
   تشغيل مزامنة الحضور السحابية (syncSecureAttendance، الموجودة
   بالفعل بالملف بعد إصلاح القوس) بشكل دوري تلقائي، مش بس لما
   تفتح تبويب سجل الحضور يدويًا — عشان بصمة الموظف تظهر عند
   الموارد البشرية بسرعة من غير تدخل.
   ============================================================ */
(function(){
  'use strict';
  function tick(){
    try{
      if(window.ARIBA_HR_TOKEN && window.ARIBA_HR_TOKEN !== 'local_admin_token' && typeof window.syncSecureAttendance === 'function'){
        window.syncSecureAttendance();
      }
    }catch(e){}
  }
  setTimeout(tick, 3000);
  setInterval(tick, 30000);
})();
