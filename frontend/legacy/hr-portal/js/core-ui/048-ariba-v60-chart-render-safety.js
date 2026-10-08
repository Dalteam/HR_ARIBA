
/* ============================================================
   ARIBA V60 — إصلاح إضافي فقط (Additive-only patch)
   المشكلة: الأربع رسومات البيانية في أعلى لوحة التحكم (جهات العمل،
   الجنسيات، الرواتب حسب جهة العمل، الأقسام) بتترسم كلها في نفس
   اللحظة (بعد 500ms من فتح اللوحة). لو مكتبة الرسم البياني
   (Chart.js) لسه ما وصلتش/اتحملتش في نفس اللحظة دي (نت بطيء
   مثلاً)، أول رسمة بتفشل بصمت وتوقف الباقي كله معاها فمفيش ولا
   رسمة بتظهر. هذا الباتش يخلي كل رسمة تتعامل بشكل مستقل (فشل
   واحدة مايأثرش على الباقي) ويعيد المحاولة تلقائيًا لو المكتبة
   لسه ما جهزتش، بدون ما يغيّر شكل أو محتوى أي رسمة موجودة.
   ============================================================ */
(function(){
  'use strict';
  var oldMkBar = window.mkBar;
  var oldMkDonut = window.mkDonut;

  function retryUntilReady(fn, args, tries){
    tries = tries || 0;
    try{
      if(typeof window.Chart === 'undefined'){
        if(tries < 20){ setTimeout(function(){ retryUntilReady(fn, args, tries+1); }, 300); }
        return;
      }
      fn.apply(null, args);
    }catch(e){
      console.warn('ARIBA V60 chart render', e);
      if(tries < 20){ setTimeout(function(){ retryUntilReady(fn, args, tries+1); }, 300); }
    }
  }

  if(typeof oldMkBar === 'function'){
    window.mkBar = function(){ retryUntilReady(oldMkBar, arguments); };
  }
  if(typeof oldMkDonut === 'function'){
    window.mkDonut = function(){ retryUntilReady(oldMkDonut, arguments); };
  }
})();
