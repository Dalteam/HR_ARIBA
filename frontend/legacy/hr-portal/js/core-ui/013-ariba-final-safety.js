
(function(){
  window.sT=function(el,id){
    try{
      var bar=el&&el.closest?el.closest('.tbar'):null;
      if(bar)bar.querySelectorAll('.tab').forEach(function(t){t.classList.remove('on');});
      if(el)el.classList.add('on');
      ['lv1','lv2','lv3','lv4','lv5','lv6','dc1','dc2','dc3','dc4'].forEach(function(i){var e=document.getElementById(i);if(e)e.style.display=i===id?'block':'none';});
      if(id==='lv4'){
        if(typeof window.loadLeaveBalanceEmployeeOptions==='function')window.loadLeaveBalanceEmployeeOptions();
        if(typeof window.rLvBal==='function')window.rLvBal();
      }
      if(id==='lv1'&&typeof window.rLvPend==='function')window.rLvPend();
      if(id==='lv2'&&typeof window.rAllLv==='function')window.rAllLv();
      if(id==='lv6'&&typeof window.renderHrOvertime==='function')window.renderHrOvertime();
    }catch(e){console.error('ARIBA leave tab:',e);}
  };
})();
