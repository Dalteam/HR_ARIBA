
(function(){
  'use strict';
  /* بيربط نظام حساب الإجازات الذكي (leaveCurrentLedger) اللي كان موجود في الكود
     لكن مش متوصل بحاجة، عشان الرصيد يتحسب لحظيًا من نفس معادلة الإكسيل بالظبط
     (ترحيل بحد أقصى 10 أيام + الزائد يروح لمخزون نهاية الخدمة)، وبيشتغل تلقائيًا
     لأي سنة جديدة (2027 وما بعدها) من غير ما يحتاج تدخل يدوي، لأنه بيعتمد على
     تاريخ اليوم الفعلي مش سنة مكتوبة بالكود. */
  function refreshLeaveLedger93(e){
    try{
      if(e && e.isTerminated){
        /* الموظف منتهي الخدمة: الرصيد يتجمد عند آخر سنة له فعليًا، مش يتحسب لحد النهارده */
        var lastYear = null;
        if(e.lastDay){ var d=new Date(e.lastDay); if(!isNaN(d)) lastYear = d.getFullYear(); }
        if(e.leaveYearOverrides){
          var years = Object.keys(e.leaveYearOverrides).map(Number).filter(function(n){return !isNaN(n);});
          if(years.length){
            var useYear = lastYear && e.leaveYearOverrides[String(lastYear)] ? lastYear : Math.max.apply(null, years);
            var o = e.leaveYearOverrides[String(useYear)];
            if(o && o.yearEnd !== undefined){
              e.leaveBalance = Math.round(Number(o.yearEnd)*100)/100;
              e.lb = e.leaveBalance;
            }
          }
        }
        return e;
      }
      if(typeof window.leaveCurrentLedger === 'function'){
        var bal = window.leaveCurrentLedger(e);
        if(typeof bal === 'number' && !isNaN(bal)){
          e.leaveBalance = Math.round(bal*100)/100;
          e.lb = e.leaveBalance;
        }
      }
      if(typeof window.leaveYearClosing === 'function'){
        var y = new Date().getFullYear();
        var eos = typeof window.leaveYearExcess === 'function' ? window.leaveYearExcess(e, y) : 0;
        if(typeof eos === 'number' && !isNaN(eos)) e.accumulatedLeaveExcessEOS = Math.round(eos*100)/100;
      }
    }catch(ex){}
    return e;
  }
  window.refreshLeaveLedger93 = refreshLeaveLedger93;

  var oldAEmps93 = window.aEmps;
  if(typeof oldAEmps93 === 'function' && !oldAEmps93.__v93){
    window.aEmps = function(){
      var list = oldAEmps93.apply(this, arguments);
      list.forEach(refreshLeaveLedger93);
      return list;
    };
    window.aEmps.__v93 = true;
  }
  var oldTEmps93 = window.tEmps;
  if(typeof oldTEmps93 === 'function' && !oldTEmps93.__v93){
    window.tEmps = function(){
      var list = oldTEmps93.apply(this, arguments);
      list.forEach(refreshLeaveLedger93);
      return list;
    };
    window.tEmps.__v93 = true;
  }

  /* عند اعتماد أي طلب إجازة سنوية أو تسجيل يدوي من HR، لازم نمسح الكاش الداخلي
     لمعادلة الإجازات عشان الرصيد يتحدث فورًا بدل ما يفضل محسوب من قبل الاعتماد */
  window.clearLeaveLedgerCache93 = function(){
    try{ if(window.__leavePerfCache && typeof window.__leavePerfCache.clear==='function') window.__leavePerfCache.clear(); }catch(e){}
  };
  ['approveLv','saveLvs'].forEach(function(fnName){
    var old = window[fnName];
    if(typeof old === 'function' && !old.__v93){
      window[fnName] = function(){
        var r = old.apply(this, arguments);
        window.clearLeaveLedgerCache93();
        return r;
      };
      window[fnName].__v93 = true;
    }
  });
})();
