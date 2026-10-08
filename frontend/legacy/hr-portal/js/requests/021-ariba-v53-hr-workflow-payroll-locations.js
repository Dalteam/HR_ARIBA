
(function(){
  'use strict';
  var SUPA_URL='https://iwviydmapqpqihcdazpe.supabase.co';
  var SUPA_KEY='sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB';
  async function hrRPC(fn,args){
    var r=await fetch(SUPA_URL+'/rest/v1/rpc/'+fn,{method:'POST',headers:{apikey:SUPA_KEY,Authorization:'Bearer '+SUPA_KEY,'Content-Type':'application/json','Prefer':'return=representation'},body:JSON.stringify(args||{})});
    var t=await r.text(),d=null;try{d=t?JSON.parse(t):null}catch(e){}
    if(!r.ok)throw new Error(d?.message||d?.hint||d?.error||'تعذر الاتصال بالخادم');
    return d;
  }
  function esc53(s){return String(s??'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function label53(t){try{return (LVL[t]&&LVL[t].ar)||t||'طلب';}catch(e){return t||'طلب';}}

  /* HR sees every pending employee request. If the manager has not acted,
     HR gets an explicit override action instead of waiting for the manager. */
  window.loadWorkflowQueue=async function(){
    if(!window.ARIBA_HR_TOKEN)return[];
    try{
      var d=await hrRPC('ariba_staff_requests',{p_token:window.ARIBA_HR_TOKEN});
      var all=d?.requests||[];
      var q=all.filter(function(x){return String(x?.request?.status||'')==='pending';}).map(function(x){
        var r=x.request||{};
        var managerStage=r.current_stage==='manager';
        var hrStage=r.current_stage==='hr';
        x.can_act=hrStage||managerStage;
        x.hr_override=managerStage;
        return x;
      });
      window.ARIBA_WORKFLOW_QUEUE=q;
      var badge=document.getElementById('nb_lv');if(badge){badge.textContent=q.length;badge.style.display=q.length?'inline':'none';}
      var lb=document.getElementById('LVB');if(lb)lb.textContent=q.length;
      return q;
    }catch(e){console.warn('loadWorkflowQueue V53',e);return window.ARIBA_WORKFLOW_QUEUE||[];}
  };

  window.hrOverrideRequest=async function(id){
    var reason=prompt('سبب اعتماد الموارد البشرية نيابة عن المدير المباشر:');
    if(reason===null)return;
    try{
      await hrRPC('ariba_hr_override_workflow',{p_token:window.ARIBA_HR_TOKEN,p_request_id:id,p_reason:reason||'اعتماد الموارد البشرية نيابة عن المدير المباشر'});
      toast('✓ تم اعتماد الطلب نيابة عن المدير المباشر وانتقل للمرحلة التالية','tin');
      await loadWorkflowQueue();
      try{rLvPend();}catch(e){}
      try{rAllLv();}catch(e){}
      try{uBadges();}catch(e){}
      try{rWorkflowQueue();}catch(e){}
    }catch(e){toast(e.message||'تعذر اعتماد الطلب','ter');}
  };

  window.rWorkflowQueue=function(){
    var q=window.ARIBA_WORKFLOW_QUEUE||[],h=LANG==='en',box=document.getElementById('LVP');if(!box)return;
    var html=q.length?'<div style="padding:10px 12px;background:rgba(1,77,61,.08);border-bottom:1px solid var(--bd);font-weight:800">🔐 '+(h?'Pending Employee Requests':'طلبات الموظفين المعلقة')+'</div>':'<div style="padding:22px;text-align:center;color:var(--mu)">✓ '+(h?'No pending employee requests':'لا توجد طلبات موظفين معلقة')+'</div>';
    html+=q.map(function(x){
      var r=x.request||{},e=x.employee||{},p=r.payload||{},name=h?(e.nameEn||e.nameAr||r.employee_id||'—'):(e.nameAr||e.nameEn||r.employee_id||'—');
      var detail=p.from?(p.from+' ← '+p.to+' | '+(p.days||0)+' '+(h?'days':'يوم')):(p.date||'')+(p.time?' '+p.time:'')+(p.amount?' | '+Number(p.amount).toLocaleString('en-US')+' SAR':'');
      var stage=r.current_stage||'pending';
      var stageText=stage==='manager'?(h?'Pending Direct Manager':'بانتظار المدير المباشر'):stage==='hr'?(h?'Pending HR':'بانتظار الموارد البشرية'):stage==='ceo'?(h?'Pending CEO':'بانتظار الرئيس التنفيذي'):(h?'Completed':'مكتمل');
      var acts='';
      if(x.hr_override){
        acts='<button class="btn bgl bsm" onclick="hrOverrideRequest(\''+r.id+'\')">✓ '+(h?'Approve on behalf':'اعتماد نيابة عن المدير')+'</button>';
      }else if(stage==='hr' && r.status==='pending'){
        acts='<button class="btn bgl bsm" onclick="workflowHrAct(\''+r.id+'\',\'approved\')">✓ '+(h?'Approve':'موافقة')+'</button><button class="btn bsm" style="color:var(--rd)" onclick="workflowHrAct(\''+r.id+'\',\'rejected\')">✗ '+(h?'Reject':'رفض')+'</button>';
      }else{
        acts='<span class="b ba">'+stageText+'</span>';
      }
      var at=(x.attachments||[]).map(function(a){return '<button class="btn bsm" style="color:var(--cy);margin:2px" onclick="aribaDownloadDoc(\''+a.id+'\')">📎 '+esc53(a.file_name||'مرفق')+'</button>';}).join('');
      return '<div style="padding:12px 14px;border-bottom:1px solid rgba(36,48,68,.5)"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><div style="flex:1;min-width:260px"><div style="font-weight:800;font-size:13px">'+esc53(name)+' <span class="b ba">'+esc53(label53(r.request_type))+'</span></div><div style="font-size:11px;color:var(--mu);margin-top:4px">'+esc53(detail)+'</div><div style="font-size:10px;color:var(--dm);margin-top:3px">'+esc53(stageText)+'</div></div>'+acts+'</div>'+at+'</div>';
    }).join('');
    box.innerHTML=html;
  };

  /* Locations: saving is not considered complete until the cloud sync has been attempted.
     The backend is the source of truth used by the employee attendance geofence. */
  try{
    var oldSaveLoc53=window.sLoc;
    window.sLoc=async function(){
      var result=oldSaveLoc53.apply(this,arguments);
      try{
        if(window.ARIBA_HR_TOKEN && window.syncLocationsToCloud){
          await window.syncLocationsToCloud(getLocs());
          if(window.syncLocationsFromCloud)await window.syncLocationsFromCloud();
          rLocs();
          toast('✓ تم حفظ الموقع وتفعيله سحابيًا لتطبيق الموظف','tin');
        }
      }catch(e){toast('تم حفظ الموقع محليًا لكن تعذر تأكيد الحفظ السحابي','ter');}
      return result;
    };
  }catch(e){console.warn('location wrapper V53',e);}

  /* Approved payroll archive: permanent month-by-month cloud review, not just browser storage. */
  function monthName53(m,h){var ar=['','يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];var en=['','January','February','March','April','May','June','July','August','September','October','November','December'];return (h?en:ar)[Number(m)]||m;}
  async function loadPayrollArchive53(){
    var box=document.getElementById('ARIBA_PAYROLL_ARCHIVE');if(!box||!window.ARIBA_HR_TOKEN)return;
    box.innerHTML='<div style="padding:18px;text-align:center;color:var(--mu)">'+(LANG==='en'?'Loading approved payroll history...':'جاري تحميل سجل المسيرات المعتمدة...')+'</div>';
    try{
      var d=await hrRPC('ariba_payroll_archive',{p_token:window.ARIBA_HR_TOKEN});
      var a=d?.archives||[],h=LANG==='en';
      if(!a.length){box.innerHTML='<div style="padding:22px;text-align:center;color:var(--mu)">'+(h?'No approved payroll history yet.':'لا توجد مسيرات رواتب معتمدة محفوظة حتى الآن.')+'</div>';return;}
      box.innerHTML=a.map(function(x){
        var total=0,net=0; (x.rows||[]).forEach(function(r){total+=Number(r.totalDue||r.total||0)||0;net+=Number(r.netSAR||r.net||0)||0;});
        return '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:11px 12px;border-bottom:1px solid var(--bd)"><div style="min-width:150px;flex:1"><strong>'+monthName53(x.month,h)+' '+x.year+'</strong><div style="font-size:10px;color:var(--mu);margin-top:3px">'+(h?'Approved':'معتمد')+' — '+esc53(x.approved_at||'')+' | '+Number(x.employees||0)+' '+(h?'employees':'موظف')+'</div></div><div class="b bgr" style="padding:5px 9px">'+total.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' '+(h?'Total':'إجمالي')+'</div><div class="b ba" style="padding:5px 9px">'+net.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' SAR '+(h?'Net':'صافي')+'</div><button class="btn bsm bpl" onclick="openPayrollArchive53('+x.year+','+x.month+')">'+(h?'Review':'مراجعة')+'</button></div>';
      }).join('');
    }catch(e){box.innerHTML='<div style="padding:18px;text-align:center;color:var(--rd)">'+(LANG==='en'?'Unable to load payroll history':'تعذر تحميل سجل المسيرات المعتمدة')+'</div>';}
  }
  window.openPayrollArchive53=async function(y,m){
    try{
      var d=await hrRPC('ariba_payroll_archive',{p_token:window.ARIBA_HR_TOKEN,p_year:Number(y),p_month:Number(m)}),x=(d?.archives||[])[0];
      if(!x)return;
      var h=LANG==='en',rows=x.rows||[];
      var html='<div class="card" style="margin-top:10px;padding:0;overflow:auto"><div class="ch"><div class="ct">📁 '+(h?'Approved Payroll — ':'مسير معتمد — ')+monthName53(m,h)+' '+y+'</div><button class="btn bsm" onclick="this.closest(\'.card\').remove()">'+(h?'Close':'إغلاق')+'</button></div><table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr><th>#</th><th>'+(h?'Employee':'الموظف')+'</th><th>'+(h?'Currency':'العملة')+'</th><th>'+(h?'Total':'الإجمالي')+'</th><th>'+(h?'Net Local':'الصافي المحلي')+'</th><th>'+(h?'Net SAR':'الصافي بالريال')+'</th></tr></thead><tbody>';
      rows.forEach(function(r,i){html+='<tr><td>'+((r.empNo||r.employee_id||r.id||i+1))+'</td><td>'+esc53(h?(r.nameEn||r.name||'—'):(r.nameAr||r.name||'—'))+'</td><td>'+esc53(r.currency||'ريال سعودي')+'</td><td>'+Number(r.totalDue||r.total||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+'</td><td>'+Number(r.net||r.netLocal||r.netSalary||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+'</td><td style="font-weight:800;color:var(--gr)">'+Number(r.netSAR||r.net||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' SAR</td></tr>';});
      html+='</tbody></table></div>';
      var host=document.getElementById('ARIBA_PAYROLL_ARCHIVE_DETAIL');if(host)host.innerHTML=html;
    }catch(e){toast(e.message||'تعذر فتح المسير','ter');}
  };

  function installArchiveUI53(){
    if(document.getElementById('ARIBA_PAYROLL_ARCHIVE'))return;
    var pg=document.getElementById('pg-pay');if(!pg)return;
    var card=document.createElement('div');card.className='card';card.style.marginTop='12px';
    card.innerHTML='<div class="ch"><div class="ct">📁 '+(LANG==='en'?'Approved Payroll History':'سجل المسيرات المعتمدة')+'</div><button class="btn bpl bsm" onclick="loadPayrollArchive53()">'+(LANG==='en'?'Refresh':'تحديث')+'</button></div><div id="ARIBA_PAYROLL_ARCHIVE" style="padding:0"></div><div id="ARIBA_PAYROLL_ARCHIVE_DETAIL"></div>';
    pg.appendChild(card);loadPayrollArchive53();
  }

  try{
    var oldShowPg53=window.showPg;
    window.showPg=function(id,el){var r=oldShowPg53.apply(this,arguments);if(id==='pay'){setTimeout(installArchiveUI53,60);setTimeout(loadPayrollArchive53,120);}if(id==='lv'){setTimeout(loadWorkflowQueue,80);setTimeout(rWorkflowQueue,120);}return r;};
  }catch(e){setTimeout(installArchiveUI53,200);}

  /* Refresh the HR view frequently so a manager approval/employee request is visible without reopening the app. */
  if(window.__aribaHRV53Timer)clearInterval(window.__aribaHRV53Timer);
  window.__aribaHRV53Timer=null; /* AUTO REFRESH DISABLED */
  setTimeout(function(){if(window.ARIBA_HR_TOKEN)loadWorkflowQueue();},900);
})();
