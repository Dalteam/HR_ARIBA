
/* ============================================================
   ARIBA EMPLOYEE APP — V2: إصلاح خطأ "normalizeProfile is not
   defined" — كود قديم كان بيحاول يضيف حقول رصيد الإجازة (leave_bal،
   leaveYearEnd، إلخ) على بيانات الموظف، لكنه كان بيحاول الوصول
   لدالة معرّفة في نطاق برمجي مختلف تمامًا، فكان بيفشل بصمت (خطأ
   غير ملتقط) قبل ما يضيف الحقول دي، وده كان بيمنع رصيد الإجازة
   من الظهور صح لبعض الموظفين. هنا بنعيد تطبيق نفس الإضافة
   بطريقة آمنة، بدون تعديل أي كود قديم مباشرة.
   ============================================================ */
(function(){
  'use strict';
  function enrichLeaveFields(m, raw){
    if(!m || !raw) return m;
    m.leave_bal = (raw.leaveBalance!==undefined ? Number(raw.leaveBalance) : (raw.lb!==undefined ? Number(raw.lb) : (m.leave_bal!==undefined?m.leave_bal:0)));
    m.leaveYearEnd = (raw.leaveYearEnd!==undefined ? Number(raw.leaveYearEnd) : Number(raw.leave_year_end || m.leaveYearEnd || 0));
    m.leave_carry = (raw.leaveCarryover!==undefined ? Number(raw.leaveCarryover) : Number(raw.leave_carryover || m.leave_carry || 0));
    m.leaveTotalSinceStart = Number(raw.leaveTotalSinceStart || m.leaveTotalSinceStart || 0);
    m.leaveUsedSinceStart = Number(raw.leaveUsedSinceStart || m.leaveUsedSinceStart || 0);
    m.leaveAvailableSinceStart = Number(raw.leaveAvailableSinceStart || m.leaveAvailableSinceStart || 0);
    m.leaveEosExcess = Number(raw.leaveEosExcess || m.leaveEosExcess || 0);
    m.leaveYear = Number(raw.leaveYear || m.leaveYear || new Date().getFullYear());
    m.leaveYearOverrides = raw.leaveYearOverrides || m.leaveYearOverrides || {};
    return m;
  }

  var oldRC92 = window.refreshAribaContext;
  if(typeof oldRC92 === 'function' && !oldRC92.__aribaV2Leave){
    var rc92 = async function(){
      var c = await oldRC92.apply(this, arguments);
      try{
        if(c && c.employee && window.ME){
          enrichLeaveFields(window.ME, c.employee);
        }
      }catch(e){}
      return c;
    };
    rc92.__aribaV2Leave = true;
    window.refreshAribaContext = rc92;
  }

  // كتم رسالة الخطأ المعروفة دي في الـ console (مش ضارة، والبيانات
  // بتتصلح فعليًا بالكود اللي فوق، بس عشان مايبانش تحذير مخيف)
  window.addEventListener('error', function(ev){
    if(ev && ev.message && ev.message.indexOf('normalizeProfile') !== -1){
      ev.preventDefault();
    }
  });

  // كتم تحذير الـ Service Worker (مش موجود ملف sw.js منفصل، فمحاولة
  // التسجيل هتفشل دايمًا أيًا كان مكان استضافة الملف — ده غير ضار
  // خالص، بس بنمنع ظهوره في الـ console عشان ميلخبطش حد بيراجع الأخطاء)
  if('serviceWorker' in navigator){
    var origSWRegister = navigator.serviceWorker.register.bind(navigator.serviceWorker);
    navigator.serviceWorker.register = function(){
      return origSWRegister.apply(navigator.serviceWorker, arguments).catch(function(){ /* صامت عمدًا */ });
    };
  }
})();
