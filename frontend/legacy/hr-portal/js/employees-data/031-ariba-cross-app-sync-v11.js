
(function(){
'use strict';
window.ARIBA_CROSS_APP_SYNC={version:11,interval:3000};
async function pull(){
  if(!window.ARIBA_HR_TOKEN)return;
  try{
    /* Use the HR app's existing authenticated synchronization pipeline. */
    /* automatic cloud sync disabled */
    if(typeof window.loadWorkflowQueue==='function') await window.loadWorkflowQueue();
    if(typeof window.pullEmployeesFromCloud==='function'){
      var e=await window.pullEmployeesFromCloud();
      if(e&&e.length){
        try{if(typeof window.rEmps==='function')window.rEmps();}catch(_){}
        try{if(typeof window.loadDash==='function')window.loadDash();}catch(_){}
      }
    }
    if(typeof window.loadPayrollArchive53==='function')window.loadPayrollArchive53();
    try{if(typeof window.uBadges==='function')window.uBadges();}catch(_){}
    try{if(typeof window.ARIBA_RENDER_TERMINATED_V9==='function')window.ARIBA_RENDER_TERMINATED_V9();}catch(_){}
  }catch(e){console.warn('ARIBA HR live sync',e);}
}
window.ARIBA_SYNC_NOW=pull; /* no automatic cross-app polling */
})();
