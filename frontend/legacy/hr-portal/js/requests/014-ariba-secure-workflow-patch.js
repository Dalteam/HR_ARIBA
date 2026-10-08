

function hrFileToData(file){return new Promise(function(resolve,reject){if(!file)return resolve(null);var r=new FileReader();r.onload=function(){resolve({name:file.name,mime:file.type||'application/octet-stream',data:r.result});};r.onerror=reject;r.readAsDataURL(file);});}
function populateHrOvertimeForm(){
  var sel=document.getElementById('HR_OT_EMP');if(!sel)return;
  var h=LANG==='en',old=sel.value,emps=getEmps().filter(function(e){return !e.isTerminated;});
  sel.innerHTML='<option value="">'+(h?'Select employee':'اختر الموظف')+'</option>'+emps.map(function(e){return '<option value="'+esc(e.id)+'">'+esc(h?(e.nameEn||e.nameAr||e.id):(e.nameAr||e.nameEn||e.id))+'</option>';}).join('');
  if(old)sel.value=old;var d=document.getElementById('HR_OT_DATE');if(d&&!d.value)d.value=new Date().toISOString().slice(0,10);
}
async function hrWorkflowRpc(fn,args){
  var r=await fetch('https://iwviydmapqpqihcdazpe.supabase.co/rest/v1/rpc/'+fn,{method:'POST',headers:{apikey:'sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB',Authorization:'Bearer sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB','Content-Type':'application/json','Prefer':'return=representation'},body:JSON.stringify(args||{})});
  var t=await r.text(),d=null;try{d=t?JSON.parse(t):null;}catch(e){}if(!r.ok)throw new Error(d?.message||d?.error||'تعذر الاتصال');return d;
}
async function submitHrOvertime(){
  try{if(!window.ARIBA_HR_TOKEN){toast('يجب تسجيل الدخول أولاً','ter');return;}
    var emp=document.getElementById('HR_OT_EMP')?.value||'',date=document.getElementById('HR_OT_DATE')?.value||'',hours=parseFloat(document.getElementById('HR_OT_HOURS')?.value)||0,notes=document.getElementById('HR_OT_NOTES')?.value||'';
    if(!emp||!date||hours<=0){toast('حدد الموظف والتاريخ وعدد الساعات','ter');return;}
    var f=document.getElementById('HR_OT_ATT')?.files?.[0],att=null;if(f){if(f.size>12582912){toast('حجم المرفق يتجاوز 12 MB','ter');return;}att=await hrFileToData(f);}
    await hrWorkflowRpc('ariba_hr_submit_overtime',{p_token:window.ARIBA_HR_TOKEN,p_employee_id:String(emp),p_payload:{date:date,hours:hours,notes:notes},p_attachment_name:att?.name||null,p_attachment_mime:att?.mime||null,p_attachment_base64:att?.data||null});
    toast('✓ تم إرسال طلب العمل الإضافي','tin');var n=document.getElementById('HR_OT_NOTES');if(n)n.value='';var a=document.getElementById('HR_OT_ATT');if(a)a.value='';await renderHrOvertime();
  }catch(e){toast(e.message||'تعذر إرسال طلب العمل الإضافي','ter');}
}
async function renderHrOvertime(){
  populateHrOvertimeForm();var box=document.getElementById('HR_OT_LIST');if(!box)return;if(!window.ARIBA_HR_TOKEN){box.innerHTML='<div style="padding:25px;text-align:center;color:var(--mu)">يجب تسجيل الدخول أولاً</div>';return;}
  box.innerHTML='<div style="padding:25px;text-align:center;color:var(--mu)">جاري تحميل طلبات العمل الإضافي...</div>';
  try{var d=await hrWorkflowRpc('ariba_staff_requests',{p_token:window.ARIBA_HR_TOKEN}),all=(d&&d.requests)||[],rows=all.filter(function(x){return String((x.request||{}).request_type||'')==='overtime';});if(!rows.length){box.innerHTML='<div style="padding:25px;text-align:center;color:var(--mu)">✓ لا توجد طلبات عمل إضافي</div>';return;}
    var h=LANG==='en';box.innerHTML=rows.map(function(x){var r=x.request||{},e=x.employee||{},p=r.payload||{},atts=x.attachments||[],name=e.nameAr||e.nameEn||r.employee_id||'—',status=String(r.status||'pending'),stageText=r.current_stage==='manager'?'بانتظار المدير المباشر':r.current_stage==='hr'?'بانتظار الموارد البشرية':r.current_stage==='ceo'?'بانتظار الرئيس التنفيذي':status==='approved'?'موافق':status==='rejected'?'مرفوض':'مكتمل',attHtml=atts.length?'<div style="margin-top:6px">'+atts.map(function(a){return '<button class="btn bsm" style="color:var(--cy);margin:2px" onclick="aribaDownloadDoc(\''+a.id+'\')">📎 '+esc(a.file_name||'مرفق')+'</button>';}).join('')+'</div>':'',can=status==='pending'&&r.current_stage==='hr',acts=can?'<button class="btn bgl bsm" onclick="workflowHrAct(\''+r.id+'\',\'approved\');setTimeout(renderHrOvertime,500)">✓ '+(h?'Approve':'موافقة')+'</button><button class="btn bsm" style="color:var(--rd)" onclick="workflowHrAct(\''+r.id+'\',\'rejected\');setTimeout(renderHrOvertime,500)">✗ '+(h?'Reject':'رفض')+'</button>':'<span class="b '+(status==='approved'?'bgr':status==='rejected'?'br':'ba')+'">'+stageText+'</span>';return '<div style="padding:12px;border-bottom:1px solid var(--bd);display:flex;gap:10px;align-items:center;flex-wrap:wrap"><div style="flex:1;min-width:260px"><strong>'+esc(name)+'</strong><span class="b ba" style="margin-inline-start:7px">'+(h?'Overtime':'عمل إضافي')+'</span><div style="font-size:11px;color:var(--mu);margin-top:4px">'+esc(p.date||'—')+' | '+esc(p.hours||0)+' '+(h?'hours':'ساعة')+(p.notes?' | '+esc(p.notes):'')+'</div><div style="font-size:10px;color:var(--dm);margin-top:3px">'+esc(stageText)+'</div>'+attHtml+'</div>'+acts+'</div>';}).join('');
  }catch(e){box.innerHTML='<div style="padding:25px;text-align:center;color:var(--rd)">تعذر تحميل طلبات العمل الإضافي</div>';}
}
/* ARIBA HR MAIN APP - SECURE CLOUD WORKFLOW PATCH */
(function(){
  'use strict';
  var SUPA_URL='https://iwviydmapqpqihcdazpe.supabase.co';
  var SUPA_KEY='sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB';
  var TOKEN_KEY='ariba_hr_session_v3';
  window.ARIBA_HR_TOKEN=sessionStorage.getItem(TOKEN_KEY)||'';
  async function rpc(fn,args){var r=await fetch(SUPA_URL+'/rest/v1/rpc/'+fn,{method:'POST',headers:{apikey:SUPA_KEY,Authorization:'Bearer '+SUPA_KEY,'Content-Type':'application/json','Prefer':'return=representation'},body:JSON.stringify(args||{})});var t=await r.text(),d=null;try{d=t?JSON.parse(t):null}catch(e){}if(!r.ok)throw new Error(d?.message||d?.hint||d?.error||'تعذر الاتصال');return d;}
  async function hrLogin(u,p){
  // تحقق محلي أولاً
  var validUser = false; /* V104: الدخول المحلي بباسورد مكتوب في الكود اتلغى */
  if(validUser){
    window.ARIBA_HR_TOKEN = 'local_admin_token';
    return Promise.resolve({token:'local_admin_token'});
  }
  // تحقق من Supabase لو متصل
  if(typeof supa!=='undefined'){
    return supa.from('employees').select('*').eq('username',u).eq('password_hash',p).single()
      .then(function(res){
        if(res.data){
          window.ARIBA_HR_TOKEN='hr_token_'+res.data.id;
          return {token:window.ARIBA_HR_TOKEN};
        }
        throw new Error('بيانات الدخول غير صحيحة');
      });
  }
  return Promise.reject(new Error('بيانات الدخول غير صحيحة'));
  }
})();
(function(){
  async function hrRpc(fn,args){var r=await fetch('https://iwviydmapqpqihcdazpe.supabase.co/rest/v1/rpc/'+fn,{method:'POST',headers:{apikey:'sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB',Authorization:'Bearer sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB','Content-Type':'application/json','Prefer':'return=representation'},body:JSON.stringify(args||{})});var t=await r.text(),d=null;try{d=t?JSON.parse(t):null}catch(e){}if(!r.ok)throw new Error(d?.message||d?.error||'تعذر الاتصال');return d;}
  window.syncSecureLocations=async function(){if(!window.ARIBA_HR_TOKEN)return;try{var locs=await hrRpc('ariba_staff_locations',{p_token:window.ARIBA_HR_TOKEN});if(Array.isArray(locs)){dbS('locs',locs.map(function(x){return{id:x.id,name:x.name,nameEn:x.name_en,employer:x.employer,type:x.type,lat:x.latitude,lng:x.longitude,radius:x.radius_m,color:'#29B35E'}}));rLocs();}}catch(e){}}
  var oldSaveLoc=window.sLoc;window.sLoc=function(){var result=oldSaveLoc.apply(this,arguments);try{var id=document.getElementById('LID').value||('L'+Date.now()),payload={id:id,name:document.getElementById('LN').value,name_en:document.getElementById('LN').value,employer:document.getElementById('LE2').value||'all',type:document.getElementById('LTY').value||'project',latitude:parseFloat(document.getElementById('LLAT').value)||0,longitude:parseFloat(document.getElementById('LLNG').value)||0,radius_m:parseInt(document.getElementById('LR2').value)||200,active:true};if(window.ARIBA_HR_TOKEN)hrRpc('ariba_upsert_location',{p_token:window.ARIBA_HR_TOKEN,p_location:payload}).catch(function(e){toast('تم الحفظ محلياً لكن تعذر حفظ الموقع سحابياً','ter');});}catch(e){}return result;};
  window.delLoc=function(id){
    if(!confirm(LANG==='en'?'Delete this location?':'هل تريد حذف هذا الموقع؟'))return;
    var list=getLocs().filter(function(l){return l.id!==id;});
    dbS('locs',list);
    if(typeof rLocs==='function')rLocs();
    if(window.ARIBA_HR_TOKEN)hrRpc('ariba_delete_location',{p_token:window.ARIBA_HR_TOKEN,p_id:id}).catch(function(){});
  };
  window.syncSecureAttendance=async function(){if(!window.ARIBA_HR_TOKEN)return;try{var d=await hrRpc('ariba_staff_attendance',{p_token:window.ARIBA_HR_TOKEN,p_date:(document.getElementById('AD')?.value||tod())});var a=d?.attendance||[];dbS('att',a.map(function(x){return{id:x.id,empId:x.employee_id,date:x.attendance_date,timeIn:x.time_in,timeOut:x.time_out,status:x.status,late_minutes:x.late_minutes,early_minutes:x.early_minutes,locId:x.location_id,location_name:x.location_name,lat:x.latitude,lng:x.longitude,hours:x.time_in&&x.time_out?Math.round(((new Date('1970-01-01T'+x.time_out)-new Date('1970-01-01T'+x.time_in))/3600000)*100)/100:0}}));rAtt();}catch(e){}}
  var oldLoadAtt=window.loadAttPg;window.loadAttPg=async function(){if(typeof oldLoadAtt==='function')oldLoadAtt();await syncSecureAttendance();};
  setTimeout(function(){syncSecureLocations();},1500);
})();
(function(){
  var oldAll=window.rAllLv;window.rAllLv=function(){if(typeof oldAll==='function')oldAll();var q=window.ARIBA_WORKFLOW_QUEUE||[];var box=document.getElementById('LAT');if(!box||!q.length)return;var h=LANG==='en';var extra='<div style="margin-top:12px" class="card"><div class="ct">🔐 Workflow Requests</div><div class="tw"><table><tr><th>الموظف</th><th>النوع</th><th>المرحلة</th><th>التاريخ/التفاصيل</th><th>الحالة</th></tr>'+q.map(function(x){var r=x.request||{},e=x.employee||{},p=r.payload||{};return '<tr><td>'+((e.nameAr||e.na||r.employee_id||'—').split(' ').slice(0,3).join(' '))+'</td><td>'+((LVL[r.request_type]&&LVL[r.request_type].ar)||r.request_type)+'</td><td>'+r.current_stage+'</td><td>'+(p.from?(p.from+' ← '+p.to):(p.date||'')+(p.amount?' | '+Number(p.amount).toLocaleString('ar-SA')+' ر.س':''))+'</td><td><span class="b ba">معلق</span></td></tr>';}).join('')+'</table></div></div>';box.insertAdjacentHTML('afterend',extra);};
})();

