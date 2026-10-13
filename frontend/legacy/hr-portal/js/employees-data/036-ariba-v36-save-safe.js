
(function(){
'use strict';
window.ARIBA_AUTO_EMPLOYEE_PULL=false;
window.ARIBA_MANUAL_EMPLOYEE_SYNC=true;
try{
  var originalPull=window.pullEmployeesFromCloud;
  window.pullEmployeesFromCloud=async function(){
    if(window.__ARIBA_MANUAL_PULL_ALLOWED && originalPull) return await originalPull.apply(this,arguments);
    return [];
  };
}catch(e){}

try{
  var oldSave=window.saveEmps;
  if(typeof oldSave==='function' && !oldSave.__aribaV36){
    var wrapped=function(d){
      /* Keep manual HR edits intact in local source of truth before sync. */
      var arr=Array.isArray(d)?d:[];
      arr.forEach(function(e){
        if(e && e.managerId===undefined && e.manager_id!==undefined)e.managerId=e.manager_id;
        if(e && e.dept===undefined && e.department!==undefined)e.dept=e.department;
        if(e && e.employer===undefined && e.company!==undefined)e.employer=e.company;
      });
      return oldSave(arr);
    };
    wrapped.__aribaV36=true;
    window.saveEmps=wrapped;
  }
}catch(e){console.warn('save guard',e);}
})();
