
(function(){
  'use strict';
  var FORCE_TERM_NAMES=['وسيم بن محمد صالح بن كريم','وسيم كريم','Wassim Ben Kraim'];
  function n43(v){return String(v||'').replace(/\s+/g,' ').trim().toLowerCase().replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه');}
  function isWassim43(e){var s=n43(e&&(e.nameAr||e.name||e.na||e.nameEn||e.name_en));return FORCE_TERM_NAMES.some(function(x){var q=n43(x);return s===q||s.indexOf(q)>=0;});}
  function stored43(){try{var x=localStorage.getItem('hr7_emps');return x?JSON.parse(x):[];}catch(e){return [];}}
  function terms43(){try{var x=localStorage.getItem('hr7_term_emps');return x?JSON.parse(x):[];}catch(e){return [];}}
  function putTerms43(list){try{localStorage.setItem('hr7_term_emps',JSON.stringify(list));}catch(e){}}
  function moveWassim43(){
    var cur=stored43();
    if(!cur.length && typeof CLEAN_EMPS!=='undefined')cur=CLEAN_EMPS.slice();
    var found=null, remaining=[];
    (cur||[]).forEach(function(e){if(isWassim43(e)){found=Object.assign({},e,{isTerminated:true,term:true});if(!found.lastDay)found.lastDay=found.lastDay||found.contractEnd||found.ce||'';if(!found.reason)found.reason='انتهاء الخدمة';}else remaining.push(e);});
    var arch=terms43(), map={};
    (arch||[]).forEach(function(e){if(e&&e.id!=null)map[String(e.id)]=e;});
    if(found){map[String(found.id||('WASSIM-'+Date.now()))]=found;try{localStorage.setItem('hr7_emps',JSON.stringify(remaining));}catch(e){}}
    putTerms43(Object.keys(map).map(function(k){return map[k];}));
    return found;
  }
  // Make Wassim terminated even when an old local copy still marks him current.
  moveWassim43();

  var oldCurrent43=window.ARIBA_V42_CURRENT;
  window.ARIBA_V43_CURRENT=function(){
    var a=typeof oldCurrent43==='function'?oldCurrent43():[];
    return (a||[]).filter(function(e){return !isWassim43(e);});
  };
  window.ARIBA_V42_CURRENT=window.ARIBA_V43_CURRENT;
  window.aEmps=function(){return window.ARIBA_V43_CURRENT();};
  window.tEmps=function(){
    moveWassim43();
    return terms43().filter(function(e){return e&&!isWassim43(e) ? true : !!e;});
  };

  // Payroll: Ahmed Al-Bosiri is a technical consultant and must never enter payroll.
  var oldPayExcluded43=window.ARIBA_V42_PAYROLL_EXCLUDED;
  window.ARIBA_V42_PAYROLL_EXCLUDED=function(e){
    var s=n43(e&&(e.nameAr||e.name||e.na||e.nameEn||e.name_en));
    var bosiri=/البوصيري|bosiri|bosairy/.test(s);
    return bosiri || (typeof oldPayExcluded43==='function'&&oldPayExcluded43(e));
  };
  window.ARIBA_V42_PAYROLL_EXCLUDED.__v43=true;

  // EOS report: show ONLY terminated employees with an actual positive labor-law EOS amount.
  // The report source contains the historical EOS calculation/paid amount; current employees are excluded.
  window.rptEOS=function(){
    try{
      var h=typeof LANG!=='undefined'&&LANG==='en';
      var src=(window.ARIBA_EXCEL_REPORT_DATA||[]).filter(function(e){
        if(!e || !e.isTerminated) return false;
        if(/البوصيري|bosiri|bosairy/.test(n43(e.name))) return false;
        if(/وسيم|wassim/.test(n43(e.name))) return false;
        return Number(e.eosLaborLaw||0)>0;
      });
      // If a newly archived employee has EOS fields in the live termination archive, include it too.
      var live=terms43();
      var byName={}; src.forEach(function(e){byName[n43(e.name)]=e;});
      live.forEach(function(e){
        var name=e&&(e.nameAr||e.name||e.na||'');
        if(!name || /البوصيري|bosiri|bosairy|وسيم|wassim/.test(n43(name))) return;
        if(!e.isTerminated && !e.term) return;
        if(Number(e.eosLaborLaw||0)>0 && !byName[n43(name)]){src.push(e);byName[n43(name)]=e;}
      });
      src.sort(function(a,b){return Number(b.eosLaborLaw||0)-Number(a.eosLaborLaw||0);});
      var title=h?'EOS Report — Paid/Entitled EOS Only':'تقرير مكافآت نهاية الخدمة — الموظفون الذين لهم مكافأة فقط';
      var html='<div style="padding:8px 0 12px;font-weight:700">'+(h?'Only terminated employees with EOS amount greater than zero are shown.':'يظهر هنا فقط الموظفون المنتهية خدماتهم الذين لهم مكافأة نهاية خدمة فعلية بأكثر من صفر.')+'</div>'+
        '<table><tr><th>#</th><th>'+(h?'Employee':'الموظف')+'</th><th>'+(h?'Employer':'جهة العمل')+'</th><th>'+(h?'Last Day':'آخر يوم عمل')+'</th><th>'+(h?'Reason / Article':'السبب / بند الاستحقاق')+'</th><th>'+(h?'EOS Amount':'مكافأة نهاية الخدمة')+'</th></tr>'+ 
        src.map(function(e,i){var amt=Number(e.eosLaborLaw||0);return'<tr><td>'+(e.id||i+1)+'</td><td>'+ (e.name||e.nameAr||'') +'</td><td>'+ (e.employer||'') +'</td><td>'+ (typeof fD==='function'?fD(e.lastDay||e.contractEnd||''):(e.lastDay||e.contractEnd||'—')) +'</td><td>'+ (e.reason||'—') +'</td><td style="color:var(--gr);font-weight:700">'+(typeof fN==='function'?fN(amt):amt.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}))+' '+(h?'SAR':'ر.س')+'</td></tr>';}).join('')+'</table>';
      if(!src.length) html+='<div style="padding:20px;text-align:center;color:var(--mu)">'+(h?'No terminated employee has a positive EOS amount.':'لا يوجد موظف منتهي الخدمة له مكافأة نهاية خدمة بأكثر من صفر.')+'</div>';
      showRpt(title,html);
    }catch(err){console.warn('V43 rptEOS',err);}
  };

  // Keep the current-employees report strictly current-only after the Wassim move.
  if(typeof window.rptAll==='function'){
    var oldAll43=window.rptAll;
    window.rptAll=function(){return oldAll43();};
  }

  // Ensure the manual "تحديث البيانات" action cannot bring Wassim back to current after cloud sync.
  try{
    var oldSync43=window.syncAll;
    if(typeof oldSync43==='function'&&!oldSync43.__aribaV43){
      var sync43=function(){
        try{moveWassim43();}catch(e){}
        var r=oldSync43.apply(this,arguments);
        setTimeout(function(){try{moveWassim43();}catch(e){};try{if(typeof window.ARIBA_V42_REFRESH_UI==='function')window.ARIBA_V42_REFRESH_UI();}catch(e){}},900);
        return r;
      };
      sync43.__aribaV43=true;window.syncAll=sync43;
    }
  }catch(e){console.warn('V43 sync wrapper',e);}

  // Refresh UI immediately after applying the correction.
  setTimeout(function(){
    try{if(typeof window.ARIBA_V42_REFRESH_UI==='function')window.ARIBA_V42_REFRESH_UI();}catch(e){}
    try{if(typeof loadDash==='function')loadDash();}catch(e){}
  },100);
})();
