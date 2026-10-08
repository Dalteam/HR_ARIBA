
(function(){
'use strict';

function isTerminatedRecord(e){
  if(!e) return false;
  if(e.isTerminated===true || e.term===true || e.terminated===true) return true;
  var status=String(e.status||e.employeeStatus||e.employmentStatus||e.hrStatus||e.state||'').trim().toLowerCase();
  if(['terminated','inactive','ended','end','former'].indexOf(status)>=0)return true;
  if(/منته|انهاء|إنهاء|خدم/.test(status))return true;
  if(e.terminationDate||e.terminationReason||e.lastDay||e.endDate && e.status==='terminated')return true;
  return false;
}

function normalizeTerminated(){
  try{
    var raw=localStorage.getItem('hr7_emps');
    if(!raw)return;
    var arr=JSON.parse(raw);
    if(!Array.isArray(arr))return;
    var changed=false;
    arr.forEach(function(e){
      var data=(e&&e.data&&typeof e.data==='object')?e.data:{};
      var t=isTerminatedRecord(e)||isTerminatedRecord(data);
      if(t && e.isTerminated!==true){e.isTerminated=true;changed=true}
      if(t && data.isTerminated===true && e.isTerminated!==true){e.isTerminated=true;changed=true}
      if(t && data.term===true && e.isTerminated!==true){e.isTerminated=true;changed=true}
      if(t && !e.lastDay && (data.lastDay||data.ld)){e.lastDay=data.lastDay||data.ld;changed=true}
      if(t && !e.terminationReason && (data.terminationReason||data.tr)){e.terminationReason=data.terminationReason||data.tr;changed=true}
    });
    if(changed)localStorage.setItem('hr7_emps',JSON.stringify(arr));
  }catch(e){}
}

/* Wrap getEmps so every display/calculation sees the same termination flag. */
try{
  var oldGetEmpsV12=window.getEmps;
  if(typeof oldGetEmpsV12==='function'){
    window.getEmps=function(){
      var arr=oldGetEmpsV12()||[];
      return arr.map(function(e){
        var data=(e&&e.data&&typeof e.data==='object')?e.data:{};
        if(isTerminatedRecord(e)||isTerminatedRecord(data)){
          e.isTerminated=true;
          if(!e.lastDay)e.lastDay=data.lastDay||data.ld||e.terminationDate||e.endDate||'';
          if(!e.terminationReason)e.terminationReason=data.terminationReason||data.tr||e.reason||'';
        }
        return e;
      });
    };
  }
}catch(e){}

/* Patch the cloud loader after all existing HR scripts have defined it. */
try{
  var oldPullV12=window.pullEmployeesFromCloud;
  if(typeof oldPullV12==='function'){
    window.pullEmployeesFromCloud=async function(){
      var result=await oldPullV12.apply(this,arguments);
      normalizeTerminated();
      try{
        if(typeof window.rEmps==='function')window.rEmps();
        if(typeof window.loadDash==='function')window.loadDash();
      }catch(e){}
      return result;
    };
  }
}catch(e){}

function boot(){
  normalizeTerminated();
  try{
    if(typeof window.rEmps==='function')window.rEmps();
    if(typeof window.loadDash==='function')window.loadDash();
  }catch(e){}
}
setTimeout(boot,500);
setTimeout(boot,1800);
setTimeout(boot,3500);
/* manual sync only: disabled */
})();
