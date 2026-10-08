
/* ============================================================
   ARIBA V89 — إصلاح جذري: لقيت إن فيه منطق جاهز ومكتوب صح من
   قبل (V42) بيستبعد المرشحين اللي ما اتوظفوش فعليًا بالاسم،
   وبيحوّل تلقائيًا أي عقد محدد المدة منتهي أو تدريب/تمهير انتهت
   مدته لـ"منتهي الخدمة" — لكن دالة "الموظفين الحاليين" النهائية
   في الملف كانت بتتجاوزه بالكامل بسبب ترتيب تحميل السكربتات.
   هذا الباتش يطبّق نفس المنطق فعليًا على القائمة النهائية.
   ============================================================ */
(function(){
  'use strict';
  var NOT_EMPLOYED_89 = ['عبد الله المصرياني'];

  function norm89(v){ return String(v||'').replace(/\s+/g,' ').trim().toLowerCase().replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه'); }
  function daysLeft90(dateStr){
    if(!dateStr) return undefined;
    var d = new Date(dateStr+'T00:00:00'), t = new Date();
    if(isNaN(d.getTime())) return undefined;
    t.setHours(0,0,0,0);
    return Math.round((d-t)/86400000);
  }
  function yearsBetween90(startStr, endStr){
    if(!startStr) return undefined;
    var s = new Date(startStr+'T00:00:00');
    var e = endStr ? new Date(endStr+'T00:00:00') : new Date();
    if(isNaN(s.getTime())) return undefined;
    return Math.round(((e-s)/(365.25*86400000))*100)/100;
  }
  function refreshComputedDates90(e){
    if(!e) return e;
    var iq = daysLeft90(e.iqamaExpiry||e.iqe);
    if(iq !== undefined) e.iqamaDaysLeft = iq;
    var ce = daysLeft90(e.contractEnd||e.ce);
    if(ce !== undefined) e.contractDaysLeft = ce;
    var pp = daysLeft90(e.passportExpiry);
    if(pp !== undefined) e.passportDaysLeft = pp;
    var ins = daysLeft90(e.insuranceExpiry);
    if(ins !== undefined) e.insuranceDaysLeft = ins;
    var yos = yearsBetween90(e.contractJoin||e.cj, e.isTerminated ? (e.lastDay||undefined) : undefined);
    if(yos !== undefined) e.yearsOfService = yos;
    return e;
  }
  function hasName89(e, list){
    var n = norm89(e && (e.nameAr||e.name||e.na||e.nameEn));
    return list.some(function(x){ var q=norm89(x); return n===q || n.indexOf(q)>=0; });
  }
  function dateLeft89(v){
    if(!v) return null;
    var d=new Date(v), t=new Date();
    if(isNaN(d.getTime())) return null;
    d.setHours(0,0,0,0); t.setHours(0,0,0,0);
    return Math.ceil((d-t)/86400000);
  }
  function expired89(v){ var d=dateLeft89(v); return d!==null && d<0; }
  function trainingEnded89(e){
    var v = e && (e.trainingEndDate||e.training_end_date||e.endTrainingDate||e.lastDay);
    if(!v) return false;
    var typ = norm89((e.empType||'')+' '+(e.wpsType||'')+' '+(e.jobTitle||e.jt||''));
    return /تمهير|متدرب|تدريب|trainee|tamheer/.test(typ) && expired89(v);
  }

  function applyV89(list){
    var out = [];
    (list||[]).forEach(function(src){
      if(!src) return;
      if(hasName89(src, NOT_EMPLOYED_89)) return; // مرشح لم يُوظّف فعليًا — استبعاد تام
      var e = src;
      if(!e.isTerminated){
        if(trainingEnded89(e)){
          e.isTerminated = true; e.term = true;
          if(!e.lastDay) e.lastDay = e.trainingEndDate || e.training_end_date || e.endTrainingDate;
          if(!e.terminationReason) e.terminationReason = 'انتهاء فترة التدريب/التمهير';
        } else if(expired89(e.contractEnd||e.ce) && String(e.contractNature||'fixed') !== 'indefinite'){
          e.isTerminated = true; e.term = true;
          if(!e.lastDay) e.lastDay = e.contractEnd||e.ce;
          if(!e.terminationReason) e.terminationReason = 'انتهاء مدة العقد';
        }
      }
      out.push(e);
    });
    return out;
  }

  var oldAEmps89 = window.aEmps;
  if(typeof oldAEmps89 === 'function' && !oldAEmps89.__v89){
    window.aEmps = function(){
      var list = applyV89(oldAEmps89.apply(this, arguments));
      list.forEach(refreshComputedDates90);
      return list.filter(function(e){ return !e.isTerminated && !e.term; });
    };
    window.aEmps.__v89 = true;
  }

  var oldTEmps89 = window.tEmps;
  if(typeof oldTEmps89 === 'function' && !oldTEmps89.__v89){
    window.tEmps = function(){
      var list = oldTEmps89.apply(this, arguments) || [];
      list = list.filter(function(e){ return !hasName89(e, NOT_EMPLOYED_89); });
      list.forEach(refreshComputedDates90);
      return list;
    };
    window.tEmps.__v89 = true;
  }
})();
