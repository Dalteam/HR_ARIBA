
(function(){
'use strict';

/* Excel master is now a real page-level script, not part of print HTML. */
if (window.ARIBA_EXCEL_EMPLOYEES && Array.isArray(window.ARIBA_EXCEL_EMPLOYEES)) {
  try {
    window.ARIBA_EXCEL_EMPLOYEES = window.ARIBA_EXCEL_EMPLOYEES.map(function(e){ return Object.assign({},e); });
  } catch(e){}
}

/* Manual-only refresh: this is the only path that pushes HR data to the shared cloud. */
window.ARIBA_MANUAL_SYNC_ONLY = true;

/* Make the sidebar reliably visible after login without changing its design. */
function restoreSidebar(){
  try{
    var sb=document.getElementById('SB'), nv=document.getElementById('NV');
    if(!sb)return;
    var lg=document.getElementById('LG');
    var locked=lg && getComputedStyle(lg).display!=='none';
    if(locked){
      sb.style.setProperty('display','none','important');
      return;
    }
    sb.style.setProperty('display','flex','important');
    sb.style.setProperty('visibility','visible','important');
    sb.style.setProperty('opacity','1','important');
    sb.style.setProperty('width','220px','important');
    sb.style.setProperty('right','0','important');
    sb.style.setProperty('left','auto','important');
    sb.style.setProperty('position','fixed','important');
    sb.style.setProperty('top','0','important');
    sb.style.setProperty('bottom','0','important');
    sb.style.setProperty('height','100vh','important');
    if(nv && !nv.innerHTML.trim() && typeof window.buildNav==='function') window.buildNav();
    if(nv){
      nv.style.setProperty('display','block','important');
      nv.style.setProperty('visibility','visible','important');
      nv.style.setProperty('opacity','1','important');
    }
  }catch(e){ console.warn('sidebar restore',e); }
}

function renderData(){
  try{ if(typeof window.popEF==='function') window.popEF(); }catch(e){}
  try{ if(typeof window.rEmps==='function') window.rEmps(); }catch(e){}
  try{ if(typeof window.loadDash==='function') window.loadDash(); }catch(e){}
  restoreSidebar();
}

/* Excel data must populate the dashboard immediately on open. */
function boot(){
  try{
    /* تعطيل نهائي: الدمج التلقائي من البيانات المجمّدة (ARIBA_EXCEL_EMPLOYEES)
       كان بيشتغل في كل مرة تفتح فيها الصفحة ويكتب فوق البيانات الحية (خصوصًا
       رصيد الإجازات) بأرقام قديمة جدًا. ده كان السبب الحقيقي وراء رجوع
       الأرقام القديمة بعد كل تحديث. */
  }catch(e){ console.error('Excel master load',e); }
  renderData();
  setTimeout(renderData,350);
  setTimeout(restoreSidebar,900);
  setTimeout(restoreSidebar,1800);
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
else boot();

/* Rebuild only the UI when needed; no cloud polling. */
var oldShowPg=window.showPg;
if(typeof oldShowPg==='function'){
  window.showPg=function(){
    var r=oldShowPg.apply(this,arguments);
    setTimeout(restoreSidebar,0);
    return r;
  };
}
})();
