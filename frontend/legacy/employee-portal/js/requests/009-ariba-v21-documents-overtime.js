
(function(){
'use strict';
var DOC_TYPES=[
 ['identity','الهوية / الإقامة','ID / Iqama'],
 ['passport','جواز السفر','Passport'],
 ['degree','شهادة التخرج','Degree Certificate'],
 ['experience','شهادة الخبرة','Experience Certificate'],
 ['social_insurance','شهادة التأمينات الاجتماعية','Social Insurance Certificate'],
 ['national_address','العنوان الوطني','National Address'],
 ['cv','السيرة الذاتية','CV / Resume'],
 ['other','أخرى','Other']
];
function EN(){return typeof window.ARIBA_UI_LANG==='function'&&window.ARIBA_UI_LANG()==='en';}
function T(ar,en){return EN()?en:ar;}
function esc(s){return String(s??'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function fileToData(file){
 return new Promise(function(resolve,reject){
   if(!file)return resolve(null);
   var r=new FileReader();
   r.onload=function(){resolve({name:file.name,mime:file.type||'application/octet-stream',data:r.result,size:file.size});};
   r.onerror=reject;r.readAsDataURL(file);
 });
}
async function rpc(fn,args){
 if(window.aribaRpc)return await window.aribaRpc(fn,args);
 return await hrRpcV21(fn,args);
}
window.aribaDownloadDoc=async function(id){
 try{
   var d=await rpc('ariba_get_document',{p_token:window.ARIBA_SESSION||window.ARIBA_HR_TOKEN,p_document_id:id});
   var bin=atob(d.base64),u8=new Uint8Array(bin.length);
   for(var i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i);
   var blob=new Blob([u8],{type:d.mime_type||'application/octet-stream'});
   var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=d.file_name||'document';a.click();
   setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
 }catch(e){toast(e.message||T('تعذر تحميل الوثيقة','Unable to download document'),'ter');}
};

/* Employee: show synced official documents */
var oldProfV21=window.renderProf;
window.renderProf=function(){
 oldProfV21();
 var el=document.getElementById('appContent');if(!el||!window.ARIBA_CTX)return;
 var docs=ARIBA_CTX.documents||[];
 var card=document.createElement('div');card.className='card';
 card.innerHTML='<div class="card-title">📎 '+T('وثائقي','My Documents')+'</div>'+
   (docs.length?docs.map(function(d){
      return '<div style="display:flex;align-items:center;gap:8px;padding:9px 0;border-bottom:1px solid var(--bd)">'+
      '<div style="flex:1"><div style="font-weight:700;font-size:12px">'+esc(d.document_type)+'</div><div style="font-size:10px;color:var(--mu)">'+esc(d.file_name)+'</div></div>'+
      '<button class="btn bsm" onclick="aribaDownloadDoc(\''+d.id+'\')">⬇ '+T('فتح','Open')+'</button></div>';
   }).join(''):'<div style="color:var(--mu);font-size:11px;text-align:center;padding:12px">'+T('لا توجد وثائق مرفوعة','No documents uploaded')+'</div>');
 el.appendChild(card);
};

/* Employee: add optional attachment to leave requests */
var oldRenderLvV21=window.renderLv;
window.renderLv=function(){
 oldRenderLvV21();
 var form=document.getElementById('lvNotes');
 if(!form||document.getElementById('lvAttachment'))return;
 var wrap=document.createElement('div');wrap.style.marginTop='8px';
 wrap.innerHTML='<label>📎 '+T('مرفق الطلب (اختياري)','Request Attachment (optional)')+'</label>'+
   '<input id="lvAttachment" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" style="width:100%">'+
   '<div style="font-size:10px;color:var(--mu);margin-top:4px">'+T('يمكن إرسال الطلب بدون مرفق. الحد الأقصى 12 MB.','Attachment is optional. Maximum 12 MB.')+'</div>';
 form.parentNode.insertBefore(wrap,form.nextSibling);
};

/* Employee: secure leave submit with optional attachment */
window.submitLv=async function(){
 var notes=document.getElementById('lvNotes'),isPerm=selType==='perm'||selType==='perm_mat'||selType==='early_leave';
 var payload={notes:notes?notes.value:'',type:selType},days=0;
 if(isPerm){
   var pd=document.getElementById('permDate'),pt=document.getElementById('permTime'),pdur=document.getElementById('permDur');
   if(!pd?.value||!pt?.value){toast(T('حدد التاريخ والوقت','Select date and time'),'ter');return;}
   payload.date=pd.value;payload.time=pt.value;payload.dur=parseFloat(pdur?.value)||1;
 }else{
   var from=document.getElementById('lvFrom'),to=document.getElementById('lvTo');
   if(!from?.value||!to?.value){toast(T('حدد التاريخ','Select the dates'),'ter');return;}
   if(selType==='annual'){
     var hols=(ARIBA_CTX&&ARIBA_CTX.holidays)||gLSJ(HR+'hols')||[],hs={};
     hols.forEach(function(x){hs[x.date||'']=true;});
     var d=new Date(from.value),en=new Date(to.value);
     while(d<=en){var ds=d.toISOString().slice(0,10);if(d.getDay()>=0&&d.getDay()<=4&&!hs[ds])days++;d.setDate(d.getDate()+1);}
     if(days>Number(ME.leave_bal||0)){toast(T('يتجاوز الرصيد المتاح','Exceeds available balance'),'ter');return;}
   }else days=Math.round((new Date(to.value)-new Date(from.value))/86400000)+1;
   payload.from=from.value;payload.to=to.value;payload.days=days;
 }
 var af=document.getElementById('lvAttachment'),f=af&&af.files&&af.files[0],att=null;
 if(f){if(f.size>12582912){toast(T('حجم المرفق يتجاوز 12 MB','Attachment exceeds 12 MB'),'ter');return;}try{att=await fileToData(f);}catch(e){toast(T('تعذر قراءة المرفق','Unable to read attachment'),'ter');return;}}
 try{
   await rpc('ariba_submit_request',{p_token:window.ARIBA_SESSION,p_type:selType,p_payload:payload,p_attachment_name:att?.name||null,p_attachment_mime:att?.mime||null,p_attachment_base64:att?.data||null});
   toast(T('تم إرسال الطلب — بانتظار المدير المباشر','Request submitted — pending direct manager'));
   await refreshAribaContext();renderLv();
 }catch(e){toast(e.message||T('تعذر إرسال الطلب','Unable to submit request'),'ter');}
};

/* Employee: overtime request tab */
function installOvertimeTab(){
 var nav=document.querySelector('.bnav');if(!nav||document.getElementById('tb-overtime'))return;
 var b=document.createElement('button');b.className='bni';b.id='tb-overtime';b.onclick=function(){goTab('overtime',this)};
 b.innerHTML='<i class="ti ti-clock-plus"></i><span>'+T('عمل إضافي','Overtime')+'</span>';
 nav.appendChild(b);
}
window.renderOvertime=function(){
 var el=document.getElementById('appContent');if(!el)return;
 el.innerHTML='<div class="card"><div class="card-title">⏱️ '+T('طلب عمل إضافي','Overtime Request')+'</div>'+
 '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'+
 '<div><label>'+T('التاريخ','Date')+'</label><input id="otDate" type="date" value="'+tod()+'"></div>'+
 '<div><label>'+T('عدد الساعات','Hours')+'</label><input id="otHours" type="number" min="0.5" step="0.5" value="1"></div></div>'+
 '<label>'+T('السبب / المهمة','Reason / Task')+'</label><textarea id="otNotes" rows="3"></textarea>'+
 '<label>📎 '+T('مرفق (اختياري)','Attachment (optional)')+'</label><input id="otAttachment" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx">'+
 '<div style="font-size:10px;color:var(--mu);margin-top:4px">'+T('يمكن إرسال الطلب بدون مرفق. الحد الأقصى 12 MB.','Attachment is optional. Maximum 12 MB.')+'</div>'+
 '<button class="btn btn-primary" style="width:100%;margin-top:10px" onclick="submitOvertime()">⏱️ '+T('إرسال الطلب','Submit Request')+'</button></div>'+
 '<div class="card"><div class="card-title">📋 '+T('طلبات العمل الإضافي','Overtime Requests')+'</div>'+
 ((ME.workflowRequests||[]).filter(function(r){return r.request_type==='overtime';}).map(function(r){return '<div style="padding:9px 0;border-bottom:1px solid var(--bd);font-size:11px"><strong>'+esc(r.payload?.date||'')+'</strong> — '+esc(r.payload?.hours||0)+' '+T('ساعة','hours')+' <span class="b ba">'+esc(r.status||'pending')+'</span></div>';}).join('')||'<div style="color:var(--mu);text-align:center;padding:10px">'+T('لا توجد طلبات','No requests')+'</div>')+'</div>';
};
window.submitOvertime=async function(){
 var date=document.getElementById('otDate')?.value,hours=parseFloat(document.getElementById('otHours')?.value)||0,notes=document.getElementById('otNotes')?.value||'';
 if(!date||hours<=0){toast(T('حدد التاريخ وعدد الساعات','Select date and hours'),'ter');return;}
 var f=document.getElementById('otAttachment')?.files?.[0],att=null;
 if(f){if(f.size>12582912){toast(T('حجم المرفق يتجاوز 12 MB','Attachment exceeds 12 MB'),'ter');return;}att=await fileToData(f);}
 try{await rpc('ariba_submit_request',{p_token:window.ARIBA_SESSION,p_type:'overtime',p_payload:{date:date,hours:hours,notes:notes},p_attachment_name:att?.name||null,p_attachment_mime:att?.mime||null,p_attachment_base64:att?.data||null});toast(T('تم إرسال طلب العمل الإضافي','Overtime request submitted'));await refreshAribaContext();renderOvertime();}
 catch(e){toast(e.message||T('تعذر إرسال الطلب','Unable to submit request'),'ter');}
};
var oldGoV21=window.goTab;
window.goTab=function(tab,el){
 if(tab==='overtime'){document.querySelectorAll('.bni').forEach(function(x){x.classList.remove('on')});if(el)el.classList.add('on');document.getElementById('pageTitle').textContent=T('عمل إضافي','Overtime');renderOvertime();return;}
 return oldGoV21(tab,el);
};
setTimeout(installOvertimeTab,100);
setTimeout(installOvertimeTab,700);

/* HR: document inputs inside the employee form */
function addHRDocFields(){
 var ft=document.getElementById('ft2');if(!ft||document.getElementById('ARIBA_HR_DOC_FIELDS'))return;
 var box=document.createElement('div');box.id='ARIBA_HR_DOC_FIELDS';
 box.innerHTML='<div class="fsec" style="margin-top:10px">📎 الوثائق الإلكترونية / Employee Documents</div>'+
 DOC_TYPES.map(function(x){return '<div><label>'+x[1]+' / '+x[2]+'</label><input class="ARIBA_DOC_FILE" data-doctype="'+x[0]+'" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"></div>';}).join('')+
 '<div id="ARIBA_EMP_DOC_LIST" style="margin-top:10px"></div>';
 ft.appendChild(box);
}
async function loadHRDocs(empId){
 var box=document.getElementById('ARIBA_EMP_DOC_LIST');if(!box||!window.ARIBA_HR_TOKEN||!empId)return;
 try{
   var docs=await hrRpcV21('ariba_list_documents',{p_token:window.ARIBA_HR_TOKEN,p_employee_id:String(empId)});
   box.innerHTML='<div style="font-weight:700;margin-bottom:6px">الوثائق المرفوعة</div>'+
   ((docs||[]).map(function(d){return '<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--bd);font-size:11px"><span style="flex:1">'+esc(d.document_type)+' — '+esc(d.file_name)+'</span><button type="button" class="btn bsm" onclick="aribaDownloadDoc(\''+d.id+'\')">⬇ فتح</button></div>';}).join('')||'<div style="color:var(--mu)">لا توجد وثائق</div>');
 }catch(e){box.innerHTML='<div style="color:var(--rd);font-size:11px">تعذر تحميل الوثائق</div>';}
}
async function hrRpcV21(fn,args){
 var r=await fetch('https://iwviydmapqpqihcdazpe.supabase.co/rest/v1/rpc/'+fn,{method:'POST',headers:{apikey:'sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB',Authorization:'Bearer sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB','Content-Type':'application/json','Prefer':'return=representation'},body:JSON.stringify(args||{})});
 var t=await r.text(),d=null;try{d=t?JSON.parse(t):null}catch(e){}if(!r.ok)throw new Error(d?.message||d?.hint||d?.error||'تعذر الاتصال');return d;
}
async function uploadHRDocs(empId){
 if(!window.ARIBA_HR_TOKEN)return;
 var files=document.querySelectorAll('.ARIBA_DOC_FILE'),count=0;
 for(var i=0;i<files.length;i++){
   var f=files[i].files&&files[i].files[0];if(!f)continue;
   if(f.size>12582912){toast('ملف '+f.name+' يتجاوز 12 MB','ter');continue;}
   try{
     var att=await fileToData(f);
     await hrRpcV21('ariba_save_document',{p_token:window.ARIBA_HR_TOKEN,p_employee_id:String(empId),p_document_type:files[i].getAttribute('data-doctype'),p_file_name:att.name,p_mime_type:att.mime,p_base64:att.data,p_request_id:null});
     count++;
   }catch(ex){toast('تعذر رفع '+f.name,'ter');}
 }
 if(count){toast('✓ تم رفع '+count+' وثيقة');files.forEach(function(x){x.value='';});loadHRDocs(empId);}
}
var oldEditV21=window.editEmp;
window.editEmp=function(id){oldEditV21(id);setTimeout(function(){addHRDocFields();loadHRDocs(id);},120);};
var oldShowFormV21=window.oAddEmp;
if(oldShowFormV21)window.oAddEmp=function(){oldShowFormV21();setTimeout(addHRDocFields,120);};
var oldSaveV21=window.sEmp;
window.sEmp=function(ev){
 var id=document.getElementById('EID')?.value;
 var result=oldSaveV21(ev);
 setTimeout(function(){var eid=document.getElementById('EID')?.value||id;if(eid)uploadHRDocs(eid);},250);
 return result;
};

/* HR workflow queue: show request attachments and overtime details */
var oldRQV21=window.rWorkflowQueue;
window.rWorkflowQueue=function(){
 if(typeof oldRQV21==='function')oldRQV21();
 var q=window.ARIBA_WORKFLOW_QUEUE||[],box=document.getElementById('LVP');if(!box||!q.length)return;
 q.forEach(function(x){
   var r=x.request||{},atts=x.attachments||[];
   if(!atts.length)return;
   var cards=box.querySelectorAll('div');
   // append a compact attachment area once at the bottom
 });
 var existing=document.getElementById('ARIBA_REQ_ATTACHMENTS');
 if(existing)existing.remove();
 var c=document.createElement('div');c.id='ARIBA_REQ_ATTACHMENTS';c.className='card';
 c.innerHTML='<div class="ct">📎 '+T('مرفقات الطلبات','Request Attachments')+'</div>'+
 q.filter(function(x){return (x.attachments||[]).length;}).map(function(x){
   var r=x.request||{},e=x.employee||{},atts=x.attachments||[];
   return '<div style="padding:8px 0;border-bottom:1px solid var(--bd)"><strong>'+esc(e.nameAr||e.nameEn||r.employee_id)+'</strong> — '+esc(r.request_type)+
   atts.map(function(a){return '<div style="display:flex;justify-content:space-between;gap:8px;margin-top:5px;font-size:11px"><span>'+esc(a.document_type)+' — '+esc(a.file_name)+'</span><button class="btn bsm" onclick="aribaDownloadDoc(\''+a.id+'\')">⬇ '+T('فتح','Open')+'</button></div>';}).join('')+'</div>';
 }).join('')||'<div style="color:var(--mu);padding:10px">'+T('لا توجد مرفقات','No attachments')+'</div>';
 box.appendChild(c);
};
setTimeout(addHRDocFields,500);
})();
