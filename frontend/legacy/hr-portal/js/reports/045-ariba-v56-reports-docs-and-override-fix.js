
/* ============================================================
   ARIBA V56 — إصلاحات إضافية فقط (Additive-only patch)
   1) تعريف دالة عامة window.dl() كانت مفقودة تمامًا من البرنامج
      (مستخدمة داخل تقارير العقود/الجوازات وتبويب الوثائق
      بالكامل، وعدم وجودها كان يوقف هذه الشاشات فورًا بخطأ
      "dl is not defined" فتظهر فارغة دائمًا لأي موظف).
   2) عند اعتماد الموارد البشرية لطلب نيابة عن المدير المباشر:
      تنبيه واضح لو حساب الدخول غير سحابي (لن ينجح الاعتماد)،
      وإزالة الطلب من القائمة المعروضة فورًا بعد نجاح الاعتماد
      حتى لا يظل ظاهرًا في "معلقة".
   ============================================================ */
(function(){
  'use strict';

  /* ---------- 1) دالة dl() العامة المفقودة ---------- */
  if(typeof window.dl !== 'function'){
    window.dl = function(v){
      if(!v) return 9999;
      try{
        if(typeof dateLeft42 === 'function'){
          var d = dateLeft42(v);
          return (d===null || d===undefined) ? 9999 : d;
        }
      }catch(e){}
      var dt = new Date(v), t = new Date();
      if(isNaN(dt.getTime())) return 9999;
      dt.setHours(0,0,0,0); t.setHours(0,0,0,0);
      return Math.round((dt-t)/86400000);
    };
  }

  /* ---------- 2) اعتماد الموارد البشرية نيابة عن المدير: تحديث فوري + تنبيه صحة الجلسة ---------- */
  var oldOverride56 = window.hrOverrideRequest;
  if(typeof oldOverride56 === 'function' && !oldOverride56.__v56){
    window.hrOverrideRequest = async function(id){
      if(!window.ARIBA_HR_TOKEN || window.ARIBA_HR_TOKEN === 'local_admin_token'){
        toast('⚠ يجب تسجيل الدخول بحساب موظف حقيقي (مش الحساب المحلي) عشان الاعتماد يوصل للسحابة فعليًا','ter');
        return;
      }
      var before = (window.ARIBA_WORKFLOW_QUEUE || []).length;
      await oldOverride56(id);
      // إزالة فورية من القائمة المحلية حتى لو تأخر تحديث السحابة، حتى لا يظل الطلب ظاهرًا في "معلقة"
      try{
        if(Array.isArray(window.ARIBA_WORKFLOW_QUEUE)){
          window.ARIBA_WORKFLOW_QUEUE = window.ARIBA_WORKFLOW_QUEUE.filter(function(x){
            return String((x.request||{}).id) !== String(id);
          });
        }
        try{ if(typeof rLvPend==='function') rLvPend(); }catch(e){}
        try{ if(typeof rAllLv==='function') rAllLv(); }catch(e){}
        try{ if(typeof uBadges==='function') uBadges(); }catch(e){}
        try{ if(typeof rWorkflowQueue==='function') rWorkflowQueue(); }catch(e){}
      }catch(e){}
    };
    window.hrOverrideRequest.__v56 = true;
  }
})();
