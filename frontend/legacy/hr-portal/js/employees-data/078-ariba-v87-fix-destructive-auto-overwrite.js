
/* ============================================================
   ARIBA V87 — إصلاح جذري وحرج: كود قديم كان بيشتغل تلقائيًا في
   كل مرة تفتح فيها البرنامج (حتى بعد خروج/دخول عادي)، بيجيب
   الموظفين النشطين من السحابة بس، وبيستبدل بيهم قائمة الموظفين
   المحلية بالكامل — يعني أي موظف مستبعد محليًا (خصوصًا اللي
   معندوش نسخة سحابية أصلًا) كان بيترجع تاني أو بيتفقد، وأي بيانات
   محلية للموظفين مكانتش موجودة في السحابة كانت بتتمسح بصمت.
   الإصلاح: نخلي الحفظ للمفتاح 'emps' يدمج بدل ما يستبدل — نحافظ
   على أي موظف محلي مش موجود في القايمة الجاية من السحابة، ونحافظ
   على حالة "منتهي الخدمة" لو كانت متسجلة محليًا بالفعل.
   ============================================================ */
(function(){
  'use strict';
  var oldDbS87 = window.dbS;
  if(typeof oldDbS87 !== 'function' || oldDbS87.__v87) return;

  function safeParse(s){ try{ return JSON.parse(s); }catch(e){ return null; } }
  function readCurrentEmps(){
    try{
      if(typeof window.db === 'function'){
        var cur = window.db('emps', []);
        if(Array.isArray(cur)) return cur;
      }
    }catch(e){}
    try{
      var raw = localStorage.getItem('hr7_emps');
      var parsed = raw ? safeParse(raw) : null;
      if(Array.isArray(parsed)) return parsed;
    }catch(e){}
    return [];
  }

  window.dbS = function(key, value){
    if(key === 'emps' && Array.isArray(value)){
      try{
        var existing = readCurrentEmps();
        var byId = {};
        existing.forEach(function(e){ if(e && e.id != null) byId[String(e.id)] = e; });

        // نحدّث بيانات أي موظف موجود فعليًا في السحابة، مع الحفاظ
        // على حالة "منتهي الخدمة" لو كانت مسجّلة محليًا من الأول
        var incomingIds = {};
        value.forEach(function(incoming){
          if(!incoming || incoming.id == null) return;
          var idStr = String(incoming.id);
          incomingIds[idStr] = true;
          var localRec = byId[idStr];
          if(localRec && (localRec.isTerminated === true || localRec.term === true)){
            incoming.isTerminated = true; // ما نرجعوش موظف اتقفل محليًا
          }
          byId[idStr] = incoming;
        });

        // أي موظف محلي مش موجود في القايمة الجاية من السحابة (زي
        // الموظفين اللي معندهمش حساب سحابي أصلًا) يفضل زي ما هو،
        // من غير ما يتمسح
        var merged = Object.keys(byId).map(function(id){ return byId[id]; });
        return oldDbS87.call(this, key, merged);
      }catch(e){
        console.warn('ARIBA V87 merge failed, falling back to safe no-op', e);
        return; // في حالة أي خطأ، منعمل حاجة تكسر البيانات
      }
    }
    return oldDbS87.apply(this, arguments);
  };
  window.dbS.__v87 = true;
})();
