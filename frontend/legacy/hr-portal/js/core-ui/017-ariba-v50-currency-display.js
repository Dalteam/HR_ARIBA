
(function(){
  'use strict';
  function N(v){var n=Number(v);return Number.isFinite(n)?n:0}
  function rate(e){var c=e&&e.currency||'ريال سعودي';if(c==='ريال سعودي')return 1;var r=N(e.exchRate);return r>0?r:(c==='دولار'?3.75:1)}
  function unit(c){return c==='دولار'?'USD':c==='يورو'?'EUR':c==='جنيه مصري'?'EGP':'SAR'}
  window.ARIBA_MONEY=function(e,field){
    var c=e&&e.currency||'ريال سعودي',v=N(e&&(field==='net'?e.netSalary:e.salaryTotal));
    if(!v)return '—';
    return v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' '+unit(c);
  };
  window.ARIBA_SAR=function(e,field){
    var c=e&&e.currency||'ريال سعودي',v=N(e&&(field==='net'?e.netSalary:e.salaryTotal));
    if(!v)return '—';
    var sar=c==='ريال سعودي'?v:v*rate(e);
    return sar.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' SAR';
  };
})();
