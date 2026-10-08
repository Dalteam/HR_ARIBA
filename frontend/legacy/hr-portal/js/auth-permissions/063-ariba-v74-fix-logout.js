
/* ============================================================
   ARIBA V74 — إصلاح إضافي فقط: زرار "تسجيل الخروج" كان بيستدعي
   دالة hrLogout() غير موجودة خالص في الكود (مش معرّفة في أي
   مكان)، فكان الضغط عليه ما بيعملش أي حاجة. إضافة الدالة فقط.
   ============================================================ */
(function(){
  'use strict';
  window.hrLogout = function(){
    try{ sessionStorage.removeItem('ariba_hr_session_v3'); }catch(e){}
    try{ window.ARIBA_HR_TOKEN = ''; }catch(e){}
    location.reload();
  };
})();
