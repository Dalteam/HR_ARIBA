
/* ============================================================
   ARIBA V91 — إصلاح جذري: تبويب "الموظفون" وتقارير تانية كتير
   بتستخدم v60all() مباشرة (مش aEmps())، وده كان بيتخطى إصلاح
   حساب الأيام المتبقية اللي عملته قبل كده. هنا بنطبّق نفس
   الحساب الحي على v60all() نفسها، عشان كل مكان يستخدمها ياخد
   قيم صحيحة دايمًا.
   ============================================================ */
(function(){
  'use strict';
  function daysLeft91(dateStr){
    if(!dateStr) return undefined;
    var d = new Date(dateStr+'T00:00:00'), t = new Date();
    if(isNaN(d.getTime())) return undefined;
    t.setHours(0,0,0,0);
    return Math.round((d-t)/86400000);
  }
  function yearsBetween91(startStr, endStr){
    if(!startStr) return undefined;
    var s = new Date(startStr+'T00:00:00');
    var e = endStr ? new Date(endStr+'T00:00:00') : new Date();
    if(isNaN(s.getTime())) return undefined;
    return Math.round(((e-s)/(365.25*86400000))*100)/100;
  }
  function refresh91(e){
    if(!e) return e;
    var iq = daysLeft91(e.iqamaExpiry||e.iqe);
    if(iq !== undefined) e.iqamaDaysLeft = iq;
    var ce = daysLeft91(e.contractEnd||e.ce);
    if(ce !== undefined) e.contractDaysLeft = ce;
    var pp = daysLeft91(e.passportExpiry);
    if(pp !== undefined) e.passportDaysLeft = pp;
    var ins = daysLeft91(e.insuranceExpiry);
    if(ins !== undefined) e.insuranceDaysLeft = ins;
    var yos = yearsBetween91(e.contractJoin||e.cj, e.isTerminated ? (e.lastDay||undefined) : undefined);
    if(yos !== undefined) e.yearsOfService = yos;
    return e;
  }
  var oldREmps91 = window.rEmps;
  if(typeof oldREmps91 === 'function' && !oldREmps91.__v91){
    window.rEmps = function(){
      var r = oldREmps91.apply(this, arguments);
      try{
        var lookup = {};
        (typeof window.aEmps === 'function' ? window.aEmps() : []).concat(typeof window.tEmps === 'function' ? window.tEmps() : []).forEach(function(e){ if(e && e.id) lookup[String(e.id)] = e; });
        var tb = document.getElementById('ET');
        if(tb){
          var rows = tb.querySelectorAll('tr');
          rows.forEach(function(tr){
            var btn = tr.querySelector('button[onclick^="editEmp("]');
            if(!btn) return;
            var m = /editEmp\('([^']+)'\)/.exec(btn.getAttribute('onclick')||'');
            if(!m) return;
            var e = lookup[m[1]];
            if(!e) return;
            var tds = tr.querySelectorAll('td');
            if(tds.length < 9) return;
            var iqLeft = daysLeft91(e.iqamaExpiry||e.iqe);
            var ceLeft = daysLeft91(e.contractEnd||e.ce);
            var yos = yearsBetween91(e.contractJoin||e.cj, e.isTerminated ? (e.lastDay||undefined) : undefined);
            if(typeof window.dBadge === 'function'){
              if(iqLeft !== undefined) tds[7].innerHTML = window.dBadge(iqLeft);
              if(ceLeft !== undefined) tds[8].innerHTML = window.dBadge(ceLeft);
            }
            if(yos !== undefined) tds[6].textContent = yos.toFixed(1) + ' سنة';
          });
        }
      }catch(ex){}
      return r;
    };
    window.rEmps.__v91 = true;
  }
})();
