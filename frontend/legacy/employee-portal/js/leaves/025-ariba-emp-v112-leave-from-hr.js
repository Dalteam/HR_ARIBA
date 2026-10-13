
/* ============================================================
   V112: رصيد الإجازة في تطبيق الموظف = نفس حساب الموارد البشرية بالظبط.
   التطبيق كان فيه 3 أرقام متضاربة: نسخة محفوظة بتحط أيام العقد (21) مكان الرصيد،
   وحساب داخلي تاني بمعادلة مختلفة (V94). دلوقتي المرجع الوحيد هو حساب السحابة
   (ariba_employee_context) اللي بيتحسب يوميًا ومطابق لشاشة الأرصدة في الموارد البشرية.
   ============================================================ */
(function(){
  'use strict';
  function applyServerLeave(e){
    if(!e || e.leaveBalance==null) return;
    var LV={
      balance:Number(e.leaveBalance), yearEnd:(e.leaveYearEnd!=null?Number(e.leaveYearEnd):null),
      carry:(e.leaveCarryover!=null?Number(e.leaveCarryover):null), usedYear:(e.leaveUsedYear!=null?Number(e.leaveUsedYear):null),
      at:Date.now()
    };
    window.ARIBA_LEAVE_SERVER=LV;
    if(window.ME){
      window.ME.leave_bal=LV.balance; window.ME.leaveBalance=LV.balance;
      if(LV.yearEnd!=null) window.ME.leaveYearEnd=LV.yearEnd;
      if(LV.carry!=null) window.ME.leave_carry=LV.carry;
    }
    try{ var k='supa_emp_'+(window.ME&&window.ME.id); var c=JSON.parse(sessionStorage.getItem(k)||'null'); if(c){ c.lb=LV.balance; sessionStorage.setItem(k,JSON.stringify(c)); } }catch(x){}
  }
  /* بعد كل تحديث من السحابة (وبعد أي حساب قديم) نرجّع أرقام السحابة */
  var prev=window.refreshAribaContext;
  if(typeof prev==='function' && !prev.__v112){
    var w=async function(){ var c=await prev.apply(this,arguments); try{ if(c&&c.employee) applyServerLeave(c.employee); }catch(x){} return c; };
    w.__v112=true; window.refreshAribaContext=w;
  }
  /* قبل رسم أي شاشة، اتأكد إن الرقم هو رقم السحابة */
  function enforce(){ var LV=window.ARIBA_LEAVE_SERVER; if(LV&&window.ME){ window.ME.leave_bal=LV.balance; window.ME.leaveBalance=LV.balance; if(LV.yearEnd!=null)window.ME.leaveYearEnd=LV.yearEnd; if(LV.carry!=null)window.ME.leave_carry=LV.carry; } }
  ['renderHome','renderLv','renderProf','renderPay','goTab'].forEach(function(n){
    var f=window[n]; if(typeof f!=='function'||f.__v112) return;
    var g=function(){ enforce(); return f.apply(this,arguments); }; g.__v112=true; window[n]=g;
  });
  setInterval(enforce, 1000);
})();
