
async function supaGet(tbl, filter=''){
  try{
    const url=SUPA_URL+'/rest/v1/'+tbl+(filter?'?'+filter:'?limit=1000');
    const r=await fetch(url,{headers:{apikey:SUPA_KEY,Authorization:'Bearer '+SUPA_KEY}}); 
    return r.ok?await r.json():null;
  }catch(e){return null;}
}
async function supaPost(tbl, data){
  try{
    const r=await fetch(SUPA_URL+'/rest/v1/'+tbl,{method:'POST',headers:{apikey:SUPA_KEY,Authorization:'Bearer '+SUPA_KEY,'Content-Type':'application/json','Prefer':'return=representation'},body:JSON.stringify(data)});
    return r.ok?await r.json():null;
  }catch(e){return null;}
}
async function supaPatch(tbl, id, data){
  try{
    const r=await fetch(SUPA_URL+'/rest/v1/'+tbl+'?id=eq.'+id,{method:'PATCH',headers:{apikey:SUPA_KEY,Authorization:'Bearer '+SUPA_KEY,'Content-Type':'application/json','Prefer':'return=representation'},body:JSON.stringify(data)});
    return r.ok?await r.json():null;
  }catch(e){return null;}
}
async function supaDelete(tbl, id){
  try{
    const r=await fetch(SUPA_URL+'/rest/v1/'+tbl+'?id=eq.'+id,{method:'DELETE',headers:{apikey:SUPA_KEY,Authorization:'Bearer '+SUPA_KEY}});
    return r.ok;
  }catch(e){return false;}
}

// مزامنة الموظفين مع Supabase
async function syncEmpsToSupa(){
  var emps=getEmps();
  for(var i=0;i<emps.length;i++){
    await supaPost('employees',{id:emps[i].id, data:emps[i]}).catch(()=>{});
  }
}
// مزامنة الإجازات من Supabase
async function syncLeavesFromSupa(force){
  var leaves=await supaGet('leave_requests','order=created_at.desc&limit=1000');
  if(!Array.isArray(leaves)) return [];
  function norm(l){
    var x=Object.assign({},l);
    x.id=String(x.id||x.request_id||uid());
    x.empId=String(x.empId??x.emp_id??x.employeeId??x.employee_id??'');
    x.type=x.type||x.leave_type||x.leaveType||'annual';
    x.from=x.from||x.from_date||x.start_date||x.startDate||x.date||'';
    x.to=x.to||x.to_date||x.end_date||x.endDate||x.date||x.from||'';
    x.days=Number(x.days??x.total_days??x.duration_days??0)||0;
    x.status=String(x.status||x.hr_status||x.hrStatus||'pending').toLowerCase();
    x.notes=x.notes||x.reason||x.comments||'';
    x.workflowRequestId=x.workflowRequestId||x.workflow_request_id||null;
    x.workflowManaged=!!x.workflowRequestId;
    x.workflowStage=x.workflowStage||x.current_stage||(x.workflowManaged?(String(x.mgr_status||'').toLowerCase()==='pending'?'manager':String(x.hr_status||'').toLowerCase()==='pending'?'hr':String(x.ceo_status||'').toLowerCase()==='pending'?'ceo':'completed'):'');
    x.ts=Number(x.ts||new Date(x.created_at||x.createdAt||0).getTime()||0);
    return x;
  }
  var remote=leaves.map(norm), local=getLvs().map(norm), map=new Map();
  local.forEach(function(x){map.set(String(x.id),x);});
  remote.forEach(function(x){map.set(String(x.id),Object.assign({},map.get(String(x.id))||{},x));});
  var merged=Array.from(map.values()).sort(function(a,b){return (b.ts||0)-(a.ts||0);});
  if(remote.length||force) dbS('leaves',merged);
  return merged;
}
// مزامنة الحضور من Supabase
async function syncAttFromSupa(){
  var att=await supaGet('attendance');
  if(att&&att.length){
    dbS('att',att);
  }
}
// مزامنة كل حاجة
async function syncAll(){
  // 1. حفظ CLEAN_EMPS في localStorage
  try{
    if(typeof CLEAN_EMPS!=='undefined'&&CLEAN_EMPS.length&&!localStorage.getItem('hr7_emps')){
      localStorage.setItem('hr7_emps',JSON.stringify(CLEAN_EMPS));
    }
  }catch(ex){}
  // 2. رفع لـ Supabase
  if(typeof syncEmployeesToSupabase==='function'&&typeof CLEAN_EMPS!=='undefined'){
    syncEmployeesToSupabase(CLEAN_EMPS).then(function(){
      toast('تم التحديث والمزامنة بنجاح ✓','tin');
    }).catch(function(){
      toast('تم الحفظ محلياً (Supabase غير متصل)','');
    });
  } else {
    toast('تم تحديث البيانات محلياً ✓','tin');
  }
  // 3. تحديث لوحة التحكم
  if(typeof loadDash==='function') loadDash();
  // 4. حدّث كل الصفحات المفتوحة
  try{
    localStorage.setItem('hr7_last_sync', new Date().toISOString());
    window.dispatchEvent(new StorageEvent('storage',{key:'hr7_emps'}));
  }catch(ex){}
}
