
(function(){
  'use strict';
  var HRFIX='ARIBA_HR_V39_FINAL';
  try{localStorage.setItem('ariba_hr_build',HRFIX);}catch(e){}

  /* 1) Never lose salary fields while pulling employees from the cloud. */
  try{
    var __getEmpsV37=getEmps;
    getEmps=function(){
      var arr=__getEmpsV37();
      return (arr||[]).map(function(e){
        var b=Number(e.salary)||0,h=Number(e.housingAllowance)||0,t=Number(e.transportAllowance)||0,p=Number(e.projectAllowance)||0,o=Number(e.otherAllowance)||0;
        if(!(Number(e.salaryTotal)>0) && (b||h||t||p||o)) e.salaryTotal=Math.round((b+h+t+p+o)*100)/100;
        if(e.netSalary===undefined||e.netSalary===null||e.netSalary==='') e.netSalary=e.salaryTotal||0;
        return e;
      });
    };
  }catch(e){console.warn('salary wrapper',e);}

  window.pullEmployeesFromCloud=async function(){
    if(!window.ARIBA_HR_TOKEN)return;
    try{
      var r=await fetch('https://iwviydmapqpqihcdazpe.supabase.co/rest/v1/rpc/ariba_staff_employees',{
        method:'POST',
        headers:{apikey:'sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB',Authorization:'Bearer sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB','Content-Type':'application/json'},
        body:JSON.stringify({p_token:window.ARIBA_HR_TOKEN})
      });
      var txt=await r.text(),j=null;try{j=txt?JSON.parse(txt):null;}catch(e){}
      if(!r.ok)throw new Error(j?.message||j?.error||'cloud employee read failed');
      var rows=Array.isArray(j?.employees)?j.employees:[]; if(!rows.length)return;
      var local=((typeof aEmps==='function'?aEmps():[]).concat(typeof tEmps==='function'?tEmps():[])),by=new Map(local.map(function(e){return[String(e.id),e];}));
      var salaryFields=['salary','housingAllowance','transportAllowance','projectAllowance','otherAllowance','salaryTotal','insuranceSub','insuranceComp','netSalary','netSalarySAR','currency','exchRate','payMethod','extraAllowance','otherDeductions','deductions','insSystem','wpsType','eosLaborLaw'];
      rows.forEach(function(x){
        var id=String(x.id||x.employee_id||''); if(!id)return;
        var cloud=(x.data&&typeof x.data==='object')?Object.assign({},x.data,x):Object.assign({},x);
        var old=by.get(id)||{};
        var merged=Object.assign({},old,cloud,{id:id,empNo:cloud.empNo||cloud.emp_no||old.empNo||id,
          username:cloud.username||old.username||'',nameAr:cloud.nameAr||cloud.name_ar||old.nameAr||'',nameEn:cloud.nameEn||cloud.name_en||old.nameEn||'',
          employer:cloud.employer||old.employer||'',dept:cloud.dept||cloud.department||old.dept||'',jobTitle:cloud.jobTitle||cloud.job_title||old.jobTitle||'',
          nationality:cloud.nationality||old.nationality||'',iqamaNo:cloud.iqamaNo||cloud.iqama_no||old.iqamaNo||'',dob:cloud.dob||old.dob||'',
          contractJoin:cloud.contractJoin||cloud.joinDate||cloud.join_date||old.contractJoin||'',managerId:cloud.managerId||cloud.manager_id||old.managerId||'',
          isTerminated:cloud.isTerminated!==undefined?!!cloud.isTerminated:!cloud.active});
        salaryFields.forEach(function(k){
          if(cloud[k]!==undefined && cloud[k]!==null && cloud[k]!=='') merged[k]=cloud[k];
        });
        var b=Number(merged.salary)||0,h=Number(merged.housingAllowance)||0,t=Number(merged.transportAllowance)||0,p=Number(merged.projectAllowance)||0,o=Number(merged.otherAllowance)||0;
        if(!(Number(merged.salaryTotal)>0) && (b||h||t||p||o)) merged.salaryTotal=Math.round((b+h+t+p+o)*100)/100;
        if((merged.netSalary===undefined||merged.netSalary===null||merged.netSalary==='') && Number(merged.salaryTotal)>0) merged.netSalary=Number(merged.salaryTotal);
        by.set(id,merged);
      });
      dbS('emps',Array.from(by.values()));
      if(typeof popEF==='function')popEF(); if(typeof uBadges==='function')uBadges();
      if(document.getElementById('ET'))rEmps();
    }catch(e){console.warn('V38 pullEmployeesFromCloud',e);}
  };

  /* 2) Official holidays: cloud is the source of truth and page opening refreshes them first. */
  window.syncHolidaysFromCloud=async function(){
    if(!window.ARIBA_HR_TOKEN)return [];
    try{
      var r=await fetch('https://iwviydmapqpqihcdazpe.supabase.co/rest/v1/rpc/ariba_staff_holidays',{
        method:'POST',headers:{apikey:'sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB',Authorization:'Bearer sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB','Content-Type':'application/json'},
        body:JSON.stringify({p_token:window.ARIBA_HR_TOKEN})
      });
      var t=await r.text(); if(!r.ok)throw new Error(t);
      var rows=t?JSON.parse(t):[]; if(!Array.isArray(rows))rows=[];
      var mapped=rows.map(function(x){return{id:x.id,name:x.name,nameEn:x.nameEn||x.name_en||x.name,date:x.date||x.holiday_date,days:Number(x.days)||1,recurring:!!x.recurring};});
      dbS('hols',mapped);dbS('hols_v2_seeded',true);return mapped;
    }catch(e){console.warn('V38 syncHolidaysFromCloud',e);return getHols();}
  };

  /* 3) Work locations: HR saves and reads the same cloud locations used by the employee app. */
  window.syncLocationsToCloud=async function(locs){
    if(!window.ARIBA_HR_TOKEN)return null;
    var clean=(locs||[]).map(function(l){
      var x=Object.assign({},l);
      if(x.type!=='remote')x.radius=Math.max(10,Math.min(5000,Number(x.radius)||1000));
      return x;
    });
    try{
      var r=await fetch('https://iwviydmapqpqihcdazpe.supabase.co/rest/v1/rpc/ariba_sync_locations',{
        method:'POST',headers:{apikey:'sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB',Authorization:'Bearer sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB','Content-Type':'application/json'},
        body:JSON.stringify({p_token:window.ARIBA_HR_TOKEN,p_locations:clean})
      });
      var txt=await r.text();if(!r.ok)throw new Error(txt);return txt?JSON.parse(txt):null;
    }catch(e){console.warn('V38 syncLocationsToCloud',e);return null;}
  };
  window.syncLocationsFromCloud=async function(){
    if(!window.ARIBA_HR_TOKEN)return getLocs();
    try{
      var r=await fetch('https://iwviydmapqpqihcdazpe.supabase.co/rest/v1/rpc/ariba_staff_locations',{
        method:'POST',headers:{apikey:'sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB',Authorization:'Bearer sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB','Content-Type':'application/json'},
        body:JSON.stringify({p_token:window.ARIBA_HR_TOKEN})
      });
      var txt=await r.text();if(!r.ok)throw new Error(txt);var rows=txt?JSON.parse(txt):[];if(!Array.isArray(rows))rows=[];
      var old=getLocs(),colors={};old.forEach(function(x){colors[String(x.id)]=x.color;});
      var mapped=rows.map(function(x){return{id:x.id,name:x.name,nameEn:x.nameEn||x.name_en||x.name,employer:x.employer||'all',type:x.type||'project',lat:Number(x.lat??x.latitude??0),lng:Number(x.lng??x.longitude??0),radius:x.type==='remote'?999999:1000,color:colors[String(x.id)]||'#29B35E',active:x.active!==false};});
      if(mapped.length){dbS('locs',mapped);return mapped;}
      return old;
    }catch(e){console.warn('V38 syncLocationsFromCloud',e);return getLocs();}
  };
  try{
    var __saveLocsV37=saveLocs;
    saveLocs=function(v){
      var clean=(v||[]).map(function(l){var x=Object.assign({},l);if(x.type!=='remote')x.radius=1000;return x;});
      dbS('locs',clean);if(window.syncLocationsToCloud)window.syncLocationsToCloud(clean);
    };
  }catch(e){console.warn('saveLocs wrapper',e);}
  try{
    var __sLocV37=window.sLoc;
    window.sLoc=function(){
      var r=document.getElementById('LR2');if(r && document.getElementById('LTY')?.value!=='remote')r.value='1000';
      return __sLocV37.apply(this,arguments);
    };
  }catch(e){}

  /* 4) On opening leaves, refresh official holidays before rendering. */
  try{
    var __showPgV37=showPg;
    showPg=function(id,el){
      __showPgV37(id,el);
      if(id==='lv'){
        Promise.all([window.syncHolidaysFromCloud?window.syncHolidaysFromCloud():Promise.resolve(),window.syncLocationsFromCloud?window.syncLocationsFromCloud():Promise.resolve()]).then(function(){try{rHols();}catch(e){};try{rLvPend();}catch(e){}});
      }
      if(id==='loc'){
        Promise.resolve(window.syncLocationsFromCloud?window.syncLocationsFromCloud():null).then(function(){try{rLocs();}catch(e){}});
      }
    };
  }catch(e){console.warn('showPg wrapper',e);}

  /* 5) Keep both data sets synchronized while HR is open. */
  setTimeout(function(){
    if(window.ARIBA_HR_TOKEN){
      window.pullEmployeesFromCloud();
      window.syncHolidaysFromCloud();
      window.syncLocationsFromCloud();
    }
  },800);
  /* AUTO CLOUD REFRESH DISABLED: use the main Update button. */
})();
