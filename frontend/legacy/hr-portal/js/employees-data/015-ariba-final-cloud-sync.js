
(function(){
'use strict';
function photoNormalize(file, cb){
  if(!file){cb('');return;}
  var rd=new FileReader();
  rd.onload=function(){
    var img=new Image();
    img.onload=function(){
      var max=480, scale=Math.min(1,max/Math.max(img.width,img.height));
      var w=Math.max(1,Math.round(img.width*scale)), h=Math.max(1,Math.round(img.height*scale));
      var c=document.createElement('canvas');c.width=w;c.height=h;
      var ctx=c.getContext('2d');ctx.drawImage(img,0,0,w,h);
      cb(c.toDataURL('image/jpeg',0.82));
    };
    img.src=rd.result;
  };
  rd.readAsDataURL(file);
}
window.previewEmployeePhoto=function(input){
  var f=input&&input.files&&input.files[0]; if(!f)return;
  photoNormalize(f,function(data){
    var hid=document.getElementById('EMP_PHOTO_DATA'); if(hid)hid.value=data;
    var p=document.getElementById('EMP_PHOTO_PREVIEW'); if(p)p.innerHTML='<img src="'+data+'" alt="Employee photo">';
  });
};
window.showEmployeePhotoPreview=function(data){
  var p=document.getElementById('EMP_PHOTO_PREVIEW'); if(!p)return;
  p.innerHTML=data?'<img src="'+data+'" alt="Employee photo">':'لا توجد صورة';
  var hid=document.getElementById('EMP_PHOTO_DATA'); if(hid)hid.value=data||'';
};
window.aribaSyncAttendance=async function(rec){
  if(!window.ARIBA_HR_TOKEN)return;
  var r=await fetch('https://iwviydmapqpqihcdazpe.supabase.co/rest/v1/rpc/ariba_sync_attendance',{
    method:'POST',headers:{apikey:'sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB',Authorization:'Bearer sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB','Content-Type':'application/json'},
    body:JSON.stringify({p_token:window.ARIBA_HR_TOKEN,p_employee_id:String(rec.empId||rec.emp_id),p_date:rec.date,p_time_in:rec.timeIn||null,p_time_out:rec.timeOut||null,p_status:rec.status||'present',p_location_id:rec.locId||null,p_location_name:(getLocs().find(function(x){return String(x.id)===String(rec.locId);})||{}).name||null,p_lat:rec.lat||null,p_lng:rec.lng||null,p_notes:rec.notes||null})
  });
  if(!r.ok)throw new Error(await r.text());
  return r.text()?await r.json():null;
};
window.aribaSyncEmployee=async function(e){
  if(!window.ARIBA_HR_TOKEN) return;
  var payload=Object.assign({},e,{
    employee_id:String(e.id), employeeId:String(e.id), name_ar:e.nameAr||'', name_en:e.nameEn||'',
    employer:e.employer||'', department:e.dept||'', job_title:e.jobTitle||'', nationality:e.nationality||'',
    iqama_no:e.iqamaNo||'', dob:e.dob||'', join_date:e.contractJoin||'', manager_id:e.managerId||'',
    active:!e.isTerminated, empNo:e.empNo||e.id, photoUrl:e.photoUrl||''
  });
  var r=await fetch('https://iwviydmapqpqihcdazpe.supabase.co/rest/v1/rpc/ariba_sync_employee',{
    method:'POST',headers:{apikey:'sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB',Authorization:'Bearer sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB','Content-Type':'application/json'},
    body:JSON.stringify({p_token:window.ARIBA_HR_TOKEN,p_employee:payload})
  });
  var t=await r.text();if(!r.ok)throw new Error(t);return t?JSON.parse(t):null;
};
window.syncAllEmployeesSecure=async function(){
  if(!window.ARIBA_HR_TOKEN)return;
  var es=(typeof aEmps==='function'?aEmps():[]).concat(typeof tEmps==='function'?tEmps():[]);
  for(var i=0;i<es.length;i++){try{await window.aribaSyncEmployee(es[i]);}catch(e){console.warn('sync employee',es[i].id,e);}}
};
window.aribaSyncHolidays=async function(v){
  if(!window.ARIBA_HR_TOKEN)return;
  var r=await fetch('https://iwviydmapqpqihcdazpe.supabase.co/rest/v1/rpc/ariba_sync_holidays',{
    method:'POST',
    headers:{apikey:'sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB',Authorization:'Bearer sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB','Content-Type':'application/json','Prefer':'return=representation'},
    body:JSON.stringify({p_token:window.ARIBA_HR_TOKEN,p_holidays:v||[]})
  });
  var t=await r.text();if(!r.ok)throw new Error(t);return t?JSON.parse(t):null;
};
window.syncHolidaysFromCloud=async function(){
  if(!window.ARIBA_HR_TOKEN)return;
  try{
    var r=await fetch('https://iwviydmapqpqihcdazpe.supabase.co/rest/v1/rpc/ariba_staff_holidays',{
      method:'POST',
      headers:{apikey:'sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB',Authorization:'Bearer sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB','Content-Type':'application/json','Prefer':'return=representation'},
      body:JSON.stringify({p_token:window.ARIBA_HR_TOKEN})
    });
    var t=await r.text();if(!r.ok)throw new Error(t);
    var rows=t?JSON.parse(t):[];
    if(Array.isArray(rows)){dbS('hols',rows.map(function(x){return{id:x.id,name:x.name,nameEn:x.nameEn||x.name_en||x.name,date:x.date||x.holiday_date,days:Number(x.days)||1,recurring:!!x.recurring};}));dbS('hols_v2_seeded',true);}
  }catch(e){console.warn('syncHolidaysFromCloud',e);}
};
window.pullEmployeesFromCloud=async function(){
  if(!window.ARIBA_HR_TOKEN)return;
  try{
    var d=await fetch('https://iwviydmapqpqihcdazpe.supabase.co/rest/v1/rpc/ariba_staff_employees',{
      method:'POST',
      headers:{apikey:'sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB',Authorization:'Bearer sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB','Content-Type':'application/json','Prefer':'return=representation'},
      body:JSON.stringify({p_token:window.ARIBA_HR_TOKEN})
    });
    var t=await d.text(),j=null;try{j=t?JSON.parse(t):null;}catch(e){}
    if(!d.ok)throw new Error(j?.message||j?.error||'cloud employee read failed');
    var rows=j?.employees||[];
    if(!rows.length)return;
    var local=getEmps(),by=new Map(local.map(function(e){return[String(e.id),e];}));
    rows.forEach(function(x){
      var base=(x.data&&typeof x.data==='object')?x.data:{};
      var merged=Object.assign({},base,{
        id:String(x.id||x.employee_id),
        empNo:base.empNo||String(x.id||x.employee_id),
        username:x.username||base.username||'',
        nameAr:x.nameAr||x.name_ar||base.nameAr||'',
        nameEn:x.nameEn||x.name_en||base.nameEn||'',
        employer:x.employer||base.employer||'',
        dept:x.department||base.dept||'',
        jobTitle:x.jobTitle||x.job_title||base.jobTitle||'',
        nationality:x.nationality||base.nationality||'',
        iqamaNo:x.iqamaNo||x.iqama_no||base.iqamaNo||'',
        contractJoin:x.joinDate||x.join_date||base.contractJoin||'',
        managerId:x.managerId||x.manager_id||base.managerId||'',
        isTerminated:!x.active
      });
      by.set(String(merged.id),merged);
    });
    var mergedAll=dedupeEmployeeList(Array.from(by.values()));
    dbS('emps',mergedAll);
    if(typeof popEF==='function')popEF();
    if(typeof uBadges==='function')uBadges();
  }catch(e){console.warn('pullEmployeesFromCloud',e);}
};
var oldEdit=window.editEmp;
window.editEmp=function(id){
  oldEdit(id);
  setTimeout(function(){
    var e=(typeof getEmps==='function'?getEmps():[]).find(function(x){return String(x.id)===String(id);});
    if(e)window.showEmployeePhotoPreview(e.photoUrl||'');
  },80);
};
var oldSave=window.sEmp;
window.sEmp=function(ev){
  var f=document.getElementById('EF2');
  var pd=f&&f.elements&&f.elements['photoData'];
  if(pd && !pd.value){
    var current=document.getElementById('EID')&&document.getElementById('EID').value;
    if(current && typeof getEmps==='function'){
      var e=getEmps().find(function(x){return String(x.id)===String(current);});
      if(e)pd.value=e.photoUrl||'';
    }
  }
  var result=oldSave(ev);
  // persist photoData into the saved employee object
  setTimeout(function(){
    var eid=document.getElementById('EID')&&document.getElementById('EID').value;
    if(!eid || typeof getEmps!=='function')return;
    var arr=getEmps(), idx=arr.findIndex(function(x){return String(x.id)===String(eid);});
    if(idx>=0 && pd){arr[idx].photoUrl=pd.value||'';saveEmps(arr);window.showEmployeePhotoPreview(arr[idx].photoUrl||'');}
  },80);
  return result;
};
})();
