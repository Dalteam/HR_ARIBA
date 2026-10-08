
(function(){
'use strict';
window.ARIBA_EXCEL_MASTER_VERSION='2026-08-27';
(function(){
  // بيانات الموظفين - محمية داخل closure
  var _EMPS_SEALED=[]; /* V104: اتشالت من الكود لأسباب أمنية */;;
  Object.defineProperty(window,'ARIBA_EXCEL_EMPLOYEES',{
    get:function(){return _EMPS_SEALED;},
    set:function(v){_EMPS_SEALED=v;},
    configurable:false,enumerable:false
  });
})();

function normName16(s){return String(s||'').replace(/\s+/g,' ').trim().toLowerCase();}
function mergeExcelSeed16(){/* disabled: Excel must not overwrite manual employee edits */}

var originalPull16=window.pullEmployeesFromCloud;
window.pullEmployeesFromCloud=async function(){
  var result=null;
  try{if(originalPull16) result=await originalPull16.apply(this,arguments);}catch(e){console.warn(e);}
  // Merge cloud rows by employee name so Excel-seeded rows never duplicate existing accounts.
  try{
    var arr=((typeof aEmps==='function'?aEmps():[]).concat(typeof tEmps==='function'?tEmps():[]))||[];
    var map=new Map();
    arr.forEach(function(e){
      var k=normName16(e.nameAr||e.nameEn||e.name);
      if(!k)return;
      var old=map.get(k);
      if(!old){map.set(k,e);return;}
      var score=function(x){return Object.keys(x||{}).filter(function(z){return x[z]!==null&&x[z]!==undefined&&x[z]!=='';}).length;};
      map.set(k,score(e)>=score(old)?e:old);
    });
    dbS('emps',Array.from(map.values()));
  }catch(e){console.warn('cloud/name merge',e);}
  return result;
};

// One-time local Excel import. It does NOT push anything to the cloud automatically.
setTimeout(function(){
  /* disabled: no automatic Excel merge */
  try{if(typeof popEF==='function')popEF();}catch(e){}
  try{if(typeof rEmps==='function')rEmps();}catch(e){}
  try{if(typeof loadDash==='function')loadDash();}catch(e){}
},250);

// Explicit manual update: pull cloud first, then persist the complete local master back to cloud.
var oldSyncAll16=window.syncAll;
window.syncAll=async function(){
  var btns=[].slice.call(document.querySelectorAll('[onclick*="syncAll"]'));
  btns.forEach(function(b){b.disabled=true;b.style.opacity='.65';});
  try{
    /* disabled: no automatic Excel merge */
    if(window.ARIBA_HR_TOKEN&&window.pullEmployeesFromCloud)await window.pullEmployeesFromCloud();
    var emps=(typeof aEmps==='function'?aEmps().concat(typeof tEmps==='function'?tEmps():[]):[])||[];
    if(window.aribaSyncEmployee){
      for(var i=0;i<emps.length;i++){try{await window.aribaSyncEmployee(emps[i]);}catch(e){console.warn('employee sync',e);}}
    }else if(typeof supaUpsert==='function'){
      for(var j=0;j<emps.length;j++){try{await supaUpsert('employee_directory',employeeCloudRow(emps[j]));}catch(e){}}
    }
    try{await syncLeavesFromSupa();}catch(e){}
    try{await syncAttFromSupa();}catch(e){}
    try{if(window.syncHolidaysFromCloud)await window.syncHolidaysFromCloud();}catch(e){}
    dbS('ariba_excel_last_sync',new Date().toISOString());
    try{if(typeof popEF==='function')popEF();}catch(e){}
    try{if(typeof rEmps==='function')rEmps();}catch(e){}
    try{if(typeof loadDash==='function')loadDash();}catch(e){}
    try{if(typeof uBadges==='function')uBadges();}catch(e){}
    toast('✓ تم تحديث وحفظ بيانات الموظفين ومزامنتها مع برنامج الموظفين','tin');
  }catch(e){
    console.error(e);
    toast('تعذر إكمال التحديث: '+(e.message||e),'ter');
  }finally{
    btns.forEach(function(b){b.disabled=false;b.style.opacity='';});
  }
};

// Make Ariba dark green in BOTH employer charts: salary-by-employer and employer distribution.
function darkAribaCharts16(){
 try{
  var dark='#014D3D';
  ['cSal','cEmp'].forEach(function(id){
   var ch=window.charts&&window.charts[id]; if(!ch||!ch.data||!ch.data.labels)return;
   var labels=ch.data.labels||[];
   var colors=labels.map(function(x){
     var n=String(x||'').trim().toLowerCase().replace(/[أإآ]/g,'ا').replace(/ة/g,'ه');
     return (n==='اريبا'||n==='ariba')?dark:(id==='cSal'?'#D6D3C7':'#E8ECEA');
   });
   if(ch.data.datasets&&ch.data.datasets[0]){ch.data.datasets[0].backgroundColor=colors;ch.update('none');}
  });
 }catch(e){}
}
setTimeout(darkAribaCharts16,500);setTimeout(darkAribaCharts16,1500);setTimeout(darkAribaCharts16,3000);
/* disabled: no recurring chart repaint */
})();


// DEPS removed

