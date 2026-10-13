
(function(){
  function N(v){var n=Number(v);return Number.isFinite(n)?n:0;}
  function rate(e){var c=e&&e.currency||'ريال سعودي';if(c==='ريال سعودي')return 1;var r=N(e&&e.exchRate);return r>0?r:(c==='دولار'?3.75:1);}
  function localNet(e){
    var v=N(e&&e.netSalaryLocal);
    if(v>0)return v;
    v=N(e&&e.netSalary);
    var gross=N(e&&e.salaryTotal),r=rate(e);
    if(cmpForeign(e)&&gross>0&&v>gross*2&&Math.abs((v/gross)-r)<0.05)return v/r;
    if(cmpForeign(e)&&gross>0&&v>gross*20)return Math.max(0,gross-N(e&&e.insuranceSub)-N(e&&e.otherDeductions));
    return v;
  }
  function cmpForeign(e){return (e&&e.currency||'ريال سعودي')!=='ريال سعودي';}
  window.ARIBA_SAR=function(e,field){
    if(!e)return '—';
    var c=e.currency||'ريال سعودي', v=field==='net'?localNet(e):N(e.salaryTotal);
    if(!v)return '—';
    return (v*rate(e)).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' SAR';
  };
  window.ARIBA_MONEY=function(e,field){
    if(!e)return '—';
    var c=e.currency||'ريال سعودي', v=field==='net'?localNet(e):N(e.salaryTotal),u=c==='دولار'?'USD':c==='يورو'?'EUR':c==='جنيه مصري'?'EGP':'SAR';
    return v?v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' '+u:'—';
  };
})();
