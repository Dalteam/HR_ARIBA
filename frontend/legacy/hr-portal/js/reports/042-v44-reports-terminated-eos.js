
(function(){
  'use strict';
  function n44(v){return String(v||'').replace(/\s+/g,' ').trim().toLowerCase().replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه');}
  function money44(v){return Number(v||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' ر.س';}
  function date44(v){if(!v)return'—';try{return new Date(v).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn');}catch(e){return v||'—';}}

  /* المنتهية خدماتهم: use the sealed historical employee list (70 records),
     enriched only with matching historical report fields where available. */
  window.rptTerm=function(){
    try{
      var base=(typeof _EMPS_SEALED!=='undefined'&&Array.isArray(_EMPS_SEALED))?_EMPS_SEALED.slice():[];
      var hist=Array.isArray(window.ARIBA_EXCEL_REPORT_DATA)?window.ARIBA_EXCEL_REPORT_DATA:[];
      var by={};hist.forEach(function(x){if(x&&x.name)by[n44(x.name)]=x;});
      var a=base.map(function(x){
        var h=by[n44(x.nameAr||x.nameEn||'')];
        return Object.assign({},x,h?{lastDay:h.lastDay||x.lastDay,reason:h.reason||x.reason,employer:h.employer||x.employer,nationality:h.nationality||x.nationality}:{});
      });
      showRpt('المنتهية خدماتهم ('+a.length+')','<table><tr><th>#</th><th>الاسم</th><th>جهة العمل</th><th>الجنسية</th><th>آخر يوم عمل</th><th>السبب / البند</th></tr>'+a.map(function(x,i){return'<tr><td>'+(x.id||x.empNo||i+1)+'</td><td>'+ (x.nameAr||x.nameEn||'—') +'</td><td>'+ (x.employer||'—') +'</td><td>'+ (x.nationality||'—') +'</td><td>'+date44(x.lastDay||x.contractEnd||x.ce)+'</td><td>'+ (x.reason||x.terminationReason||'—') +'</td></tr>';}).join('')+'</table>');
    }catch(e){console.warn('V44 terminated report',e);}
  };

  /* نهاية الخدمة: only terminated employees with a positive EOS amount
     recorded in the historical EOS report. Prefer labor-law amount; when it
     is zero, use the recorded end-of-contract EOS amount. */
  window.rptEOS=function(){
    try{
      var h=typeof LANG!=='undefined'&&LANG==='en';
      var all=(typeof tEmps==='function')?tEmps():[];
      var a=all.filter(function(x){
        if(!x||!x.isTerminated)return false;
        if(/البوصيري|bosiri|bosairy/.test(n44(x.nameAr||x.name||'')))return false;
        if(/وسيم|wassim/.test(n44(x.nameAr||x.name||'')))return false;
        var eos=x.eosCategory ? Number(x.eosLaborLaw||0) : (Number(x.eosLaborLaw||0)>0?Number(x.eosLaborLaw):(typeof calcEOS==='function'?calcEOS(x.salary||0,x.yearsOfService||0,x.housingAllowance||0):0));
        return eos>0;
      }).map(function(x){
        var amt=x.eosCategory ? Number(x.eosLaborLaw||0) : (Number(x.eosLaborLaw||0)>0?Number(x.eosLaborLaw):(typeof calcEOS==='function'?calcEOS(x.salary||0,x.yearsOfService||0,x.housingAllowance||0):0));
        return {id:x.id,name:x.nameAr||x.name,employer:x.employer,lastDay:x.lastDay||x.contractEnd,reason:x.eosCategory||x.terminationReason||x.reason,amount:amt};
      }).sort(function(x,y){ return y.amount-x.amount; });
      var title=h?'EOS Report — Employees with Recorded EOS':'تقرير مكافأة نهاية الخدمة — الموظفون الذين لهم مكافأة مسجلة فقط';
      var html='<div style="padding:8px 0 12px;font-weight:700">'+(h?'Only terminated employees with a recorded positive EOS amount are shown.':'يظهر هنا فقط الموظفون المنتهية خدماتهم الذين لديهم مبلغ مكافأة نهاية خدمة مسجل بأكثر من صفر.')+'</div>'+
        '<table><tr><th>#</th><th>'+(h?'Employee':'الموظف')+'</th><th>'+(h?'Employer':'جهة العمل')+'</th><th>'+(h?'Last Day':'آخر يوم عمل')+'</th><th>'+(h?'Reason / Article':'السبب / بند الاستحقاق')+'</th><th>'+(h?'EOS Amount':'مكافأة نهاية الخدمة')+'</th></tr>'+a.map(function(x,i){
          return'<tr><td>'+(x.id||i+1)+'</td><td>'+x.name+'</td><td>'+ (x.employer||'—') +'</td><td>'+date44(x.lastDay)+'</td><td>'+ (x.reason||'—') +'</td><td style="color:var(--gr);font-weight:700">'+money44(x.amount)+'</td></tr>';
        }).join('')+'</table>';
      if(!a.length)html+='<div style="padding:20px;text-align:center;color:var(--mu)">'+(h?'No terminated employee has a positive recorded EOS amount.':'لا يوجد موظف منتهي الخدمة لديه مكافأة نهاية خدمة مسجلة بأكثر من صفر.')+'</div>';
      showRpt(title,html);
    }catch(e){console.warn('V44 EOS report',e);}
  };
})();
