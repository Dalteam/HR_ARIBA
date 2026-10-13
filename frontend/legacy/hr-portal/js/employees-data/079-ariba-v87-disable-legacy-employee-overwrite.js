
/* ============================================================
   ARIBA V87 — إصلاح جذري وخطير: كود قديم في البرنامج كان بيشتغل
   تلقائيًا في كل مرة تفتح فيها الصفحة (بدون أي زرار)، وبيمسح
   بيانات الموظفين المحلية بالكامل ويستبدلها بنسخة سحابية جزئية —
   فأي حذف/استبعاد كان بيتلغى تلقائيًا عند أي فتح تاني للصفحة.
   الإصلاح: نمنع هذا الاستبدال التلقائي نهائيًا، مع إبقاء كل حاجة
   تانية شغالة زي ما هي (من غير ما نلمس أي دالة تانية).
   ============================================================ */
(function(){
  'use strict';
  var origFetch87 = window.fetch;
  var BLOCKED_87 = ['ariba_hr_legacy_employees', 'rpc/ariba_staff_employees'];
  window.fetch = function(url, opts){
    try{
      if(typeof url === 'string'){
        for(var i=0;i<BLOCKED_87.length;i++){
          if(url.indexOf(BLOCKED_87[i]) !== -1){
            // بنمنع الطلبات دي نهائيًا عشان توقف مسح/استبدال بيانات الموظفين المحلية تلقائيًا
            return Promise.resolve(new Response('{"employees":[]}', {status: 200, headers: {'Content-Type':'application/json'}}));
          }
        }
      }
    }catch(e){}
    return origFetch87.apply(this, arguments);
  };
})();
