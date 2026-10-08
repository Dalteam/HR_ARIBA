function loadLeaveBalanceEmployeeOptions(){
  const sels=['LBE','LBME'];
  const emps=aEmps().filter(e=>!e.isTerminated).sort((a,b)=>(a.nameAr||'').localeCompare(b.nameAr||'','ar'));
  sels.forEach(id=>{const sel=document.getElementById(id);if(!sel)return;const old=sel.value;sel.innerHTML='<option value="">'+(LANG==='en'?'Select employee':'اختر الموظف')+'</option>'+emps.map(e=>'<option value="'+e.id+'">'+(e.nameAr||e.nameEn||e.id)+'</option>').join('');if(old&&emps.some(e=>String(e.id)===String(old)))sel.value=old;});
}
function renderLeaveBalanceDetail(e){
  const box=document.getElementById('LBD');if(!box)return;const h=LANG==='en';
  if(!e){box.innerHTML='<div class="al alb"><i class="ti ti-user-search"></i>'+(h?'Select an employee to view detailed balances.':'اختر الموظف لعرض تفاصيل رصيده بالتفصيل.')+'</div>';return;}
  const yr=new Date().getFullYear(),today=leaveCurrentBalance(e),yend=leaveProjectedYearEnd(e,yr),accrued=leaveCumulativeAccruedToToday(e),used=leaveCumulativeUsedToToday(e),cum=Math.max(0,accrued-used+leaveCumulativeManualToToday(e)),eos=leaveAccumulatedEos(e,yr);
  const cards=[['الرصيد المرحل من العام السابق','Previous Carry Forward',leaveCarryForward(e,yr),'var(--cy)'],['الرصيد المتاح حتى اليوم','Available Balance Today',today,'var(--gr)'],['الرصيد المتوقع 31/12/'+yr,'Year End Balance',yend,'var(--pu)'],['إجمالي المستحق من بداية الخدمة','Total Accrued Since Joining',accrued,'var(--bl)'],['إجمالي المستخدم من بداية الخدمة','Total Used Since Joining',used,'var(--rd)'],['الرصيد المتبقي من بداية الخدمة','Cumulative Remaining',cum,'var(--gr)'],['رصيد نهاية الخدمة المتراكم','EOS Leave Excess',eos,'var(--am)']];
  const rows=Array.from({length:Math.max(1,yr-leaveStartYear(e)+1)},(_,i)=>leaveStartYear(e)+i).map(y=>{const l=leaveYearLedger(e,y);return '<tr><td>'+y+'</td><td>'+l.opening.toFixed(2)+'</td><td>'+l.entitlement.toFixed(2)+'</td><td>'+l.used.toFixed(2)+'</td><td>'+l.adjustment.toFixed(2)+'</td><td style="font-weight:900">'+l.close.toFixed(2)+'</td><td>'+l.carry.toFixed(2)+'</td><td style="font-weight:800;color:'+(l.eos>0?'var(--rd)':'var(--dm)')+'">'+l.eos.toFixed(2)+'</td></tr>';}).join('');
  box.innerHTML='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:8px;margin-bottom:12px">'+cards.map(c=>'<div style="padding:12px;border:1px solid var(--bd);border-radius:10px;background:var(--c2)"><div style="font-size:10px;color:var(--mu)">'+(h?c[1]:c[0])+'</div><div style="font-size:20px;font-weight:900;color:'+c[3]+'">'+Number(c[2]).toFixed(2)+' <span style="font-size:11px;font-weight:500">'+(h?'days':'يوم')+'</span></div></div>').join('')+'</div><div class="al alb" style="margin-bottom:8px"><i class="ti ti-info-circle"></i>'+(h?'Accrual uses Sunday–Thursday working days and excludes official holidays. A full year is 21 days; the first year is prorated from the joining date. Up to 10 days roll into the next year; excess remains as end-of-service leave balance.':'الاستحقاق يُحسب على أيام العمل من الأحد إلى الخميس مع استبعاد الإجازات الرسمية. السنة الكاملة = 21 يومًا، والسنة الأولى تُحسب تناسبيًا من تاريخ المباشرة. يرحل بحد أقصى 10 أيام للسنة التالية، وما زاد يبقى ضمن رصيد نهاية الخدمة.')+'</div><div class="tw"><table><tr><th>'+(h?'Year':'السنة')+'</th><th>'+(h?'Carry In':'المرحل')+'</th><th>'+(h?'Entitlement':'استحقاق السنة')+'</th><th>'+(h?'Used':'المستخدم')+'</th><th>'+(h?'Adjustments':'التعديلات')+'</th><th>'+(h?'Year End':'نهاية السنة')+'</th><th>'+(h?'Carry Next':'مرحل للعام التالي')+'</th><th>'+(h?'EOS Excess':'فائض نهاية الخدمة')+'</th></tr>'+rows+'</table></div>';
}
function selectLeaveBalanceEmployee(empId){
  const e=aEmps().find(x=>String(x.id)===String(empId));
  renderLeaveBalanceDetail(e||null);
}
function rLvBal(){
  const h=LANG==='en', yr=new Date().getFullYear(), emps=aEmps().filter(e=>!e.isTerminated);
  // Build the employee selector only when the balances page is rendered; never rebuild it during onchange.
  loadLeaveBalanceEmployeeOptions();
  const summary=emps.reduce((s,e)=>{s.current+=leaveCurrentBalance(e);s.yearEnd+=leaveProjectedYearEnd(e,yr);s.accrued+=leaveCumulativeAccruedToToday(e);s.used+=leaveCumulativeUsedToToday(e);s.eos+=leaveAccumulatedEos(e,yr)+leaveYearExcess(e,yr);return s;},{current:0,yearEnd:0,accrued:0,used:0,eos:0});
  const sm=document.getElementById('LBSUM'); if(sm)sm.innerHTML=['عدد الموظفين|'+emps.length+'|var(--bl)','الرصيد الحالي|'+summary.current.toFixed(2)+' يوم|var(--gr)','رصيد 31/12|'+summary.yearEnd.toFixed(2)+' يوم|var(--pu)','المستحق من بداية الخدمة|'+summary.accrued.toFixed(2)+' يوم|var(--cy)','المستخدم من بداية الخدمة|'+summary.used.toFixed(2)+' يوم|var(--rd)','نهاية الخدمة المتراكم/المتوقع|'+summary.eos.toFixed(2)+' يوم|var(--am)'].map(x=>{const [a,b,c]=x.split('|');return '<div class="kpi" style="--ac:'+c+'"><div class="kl">'+a+'</div><div class="kv" style="font-size:16px">'+b+'</div></div>';}).join('');
  const head='<tr><th>#</th><th>'+(h?'Employee':'الموظف')+'</th><th>المرحّل من السابق</th><th>الرصيد الحالي</th><th>الرصيد 31/12/'+yr+'</th><th>المستحق من بداية الخدمة</th><th>المستخدم من بداية الخدمة</th><th>المتبقي من بداية الخدمة</th><th>نهاية الخدمة</th><th>تعديل</th></tr>';
  const rows=emps.map((e,i)=>{const carry=leaveCarryForward(e,yr),current=leaveCurrentBalance(e),projected=leaveProjectedYearEnd(e,yr),accrued=leaveCumulativeAccruedToToday(e),used=leaveCumulativeUsedToToday(e),cum=Math.max(0,accrued-used+leaveCumulativeManualToToday(e)),eos=leaveAccumulatedEos(e,yr)+leaveYearExcess(e,yr);return '<tr><td>'+(i+1)+'</td><td style="font-weight:700">'+(e.nameAr||e.nameEn||'—')+'</td><td style="color:var(--cy);font-weight:800">'+carry.toFixed(2)+'</td><td style="color:var(--gr);font-weight:900">'+current.toFixed(2)+'</td><td style="color:var(--pu);font-weight:900">'+projected.toFixed(2)+'</td><td>'+accrued.toFixed(2)+'</td><td style="color:var(--rd)">'+used.toFixed(2)+'</td><td style="font-weight:800">'+cum.toFixed(2)+'</td><td style="color:var(--am);font-weight:900">'+eos.toFixed(2)+'</td><td><button class="btn bsm" onclick="openLeaveBalanceM(\''+e.id+'\')"><i class="ti ti-edit"></i> تعديل</button></td></tr>';}).join('');
  const table=document.getElementById('LBT'); if(table)table.innerHTML=head+rows;
  const sel=document.getElementById('LBE'), selected=sel?sel.value:'';
  renderLeaveBalanceDetail(selected?aEmps().find(e=>String(e.id)===String(selected)):null);
}

function toggleLeaveBalanceFocus(){
  const m=document.getElementById('LBM'); if(!m)return;
  document.body.classList.toggle('lbm-focus');
  const b=document.getElementById('LBMFocusBtn');
  if(b)b.innerHTML=document.body.classList.contains('lbm-focus')?'↔ إظهار القائمة':'↔ إخفاء القائمة';
}
function openLeaveBalanceM(empId){
  loadLeaveBalanceEmployeeOptions();
  const sel=document.getElementById('LBME'); if(!sel)return;
  sel.value=String(empId||'');
  if(!sel.value){toast(LANG==='en'?'Select an employee first':'اختر الموظف أولاً','ter');return;}
  document.getElementById('LBMDate').value=tod();
  document.getElementById('LBMN').value='';
  document.body.classList.add('lbm-focus');
  updateLeaveBalanceModal();
  oM('LBM');
}
function updateLeaveBalanceModal(){
  const id=document.getElementById('LBME')?.value,e=getEmps().find(x=>String(x.id)===String(id)); if(!e)return;
  const yNow=new Date().getFullYear(),start=leaveStartYear(e),box=document.getElementById('LBMY'); let rows='';
  for(let y=start;y<=yNow;y++){
    const l=leaveYearLedger(e,y),current=y===yNow?leaveCurrentBalance(e):l.close;
    rows+=`<tr data-lby="${y}">
      <td class="lb-year"><b>${y}</b></td>
      <td><input data-k="carry" type="number" step="0.01" value="${l.opening.toFixed(2)}"></td>
      <td><input data-k="entitlement" type="number" step="0.01" value="${l.entitlement.toFixed(2)}"></td>
      <td><input data-k="used" type="number" step="0.01" value="${l.used.toFixed(2)}"></td>
      <td><input data-k="adjustment" type="number" step="0.01" value="${l.adjustment.toFixed(2)}"></td>
      <td><input data-k="current" type="number" step="0.01" value="${current.toFixed(2)}"></td>
      <td><input data-k="yearEnd" type="number" step="0.01" value="${l.close.toFixed(2)}"></td>
      <td><input data-k="carryNext" type="number" step="0.01" value="${l.carry.toFixed(2)}"></td>
      <td><input data-k="eos" type="number" step="0.01" value="${l.eos.toFixed(2)}"></td>
    </tr>`;
  }
  const h=LANG==='en';
  box.innerHTML=`<table class="lb-edit-table"><tr><th>${h?'Year':'السنة'}</th><th>${h?'Carry In':'المرحل للسنة'}</th><th>${h?'Entitlement':'استحقاق السنة'}</th><th>${h?'Used':'المستخدم'}</th><th>${h?'Adjustment +/-':'تعديل +/-'}</th><th>${h?'Current Balance':'الرصيد الحالي'}</th><th>${h?'Year-End Balance':'رصيد نهاية السنة'}</th><th>${h?'Carry Next':'المرحل للعام التالي'}</th><th>${h?'EOS Excess':'فائض نهاية الخدمة'}</th></tr>${rows}</table>
  <div style="padding:8px;color:var(--mu);font-size:11px">${h?'Edit each service year separately. Automatic rollover starts from 2024 to 2025. Up to 10 days roll into the next year; excess is retained as end-of-service leave. Year-end = carry in + entitlement + adjustment − used unless you intentionally override it.':'عدّل كل سنة من سنوات الخدمة بشكل مستقل. يبدأ نظام الترحيل التلقائي من 2024 إلى 2025؛ ويُسمح بترحيل حد أقصى 10 أيام من كل سنة إلى السنة التالية، وما زاد يُحفظ كرصد نهاية خدمة. رصيد نهاية السنة = المرحل + الاستحقاق + التعديل − المستخدم، ما لم تدخل قيمة يدوية له.'}</div>`;
}
function saveLeaveBalanceAdjustment(){
  const empId=document.getElementById('LBME')?.value,e=getEmps().find(x=>String(x.id)===String(empId));
  if(!e){toast(LANG==='en'?'Select an employee':'اختر الموظف','ter');return;}
  const rows=[...document.querySelectorAll('#LBMY tr[data-lby]')],yNow=new Date().getFullYear(),overrides={};
  rows.forEach(row=>{
    const y=String(row.getAttribute('data-lby')),o={};
    row.querySelectorAll('input[data-k]').forEach(inp=>{const k=inp.getAttribute('data-k'),v=parseFloat(inp.value);if(Number.isFinite(v))o[k]=v;});
    o.carry=Math.max(0,Number(o.carry)||0);o.entitlement=Math.max(0,Number(o.entitlement)||0);o.used=Math.max(0,Number(o.used)||0);o.adjustment=Number(o.adjustment)||0;
    // Keep manual year-end/current values, but normalize carry/eos.
    const calculatedEnd=Math.max(0,o.carry+o.entitlement+o.adjustment-o.used);
    if(!Number.isFinite(o.yearEnd))o.yearEnd=calculatedEnd; else o.yearEnd=Math.max(0,Number(o.yearEnd));
    o.carryNext=Math.min(10,Math.max(0,Number(o.carryNext)||Math.min(10,o.yearEnd)));
    o.eos=Math.max(0,Number(o.eos)||Math.max(0,o.yearEnd-10));
    if(Number(y)!==yNow)delete o.current;
    overrides[y]={...o,note:(document.getElementById('LBMN')?.value||'').trim(),updatedAt:new Date().toISOString()};
  });
  e.leaveYearOverrides=overrides;
  const cy=String(yNow),co=overrides[cy];
  e.leaveBalance=co&&co.current!==undefined?Math.max(0,Number(co.current)||0):leaveCurrentBalance(e);
  e.leaveBalanceUpdatedAt=new Date().toISOString(); e.leaveBalanceUpdatedBy='HR';
  const arr=db('leave_balance_adjustments',[]).filter(a=>String(a.empId??a.emp_id??'')!==String(empId));
  rows.forEach(row=>{const y=row.getAttribute('data-lby'),o=overrides[y];arr.push({id:uid(),empId:String(empId),year:Number(y),action:'replace_year',date:document.getElementById('LBMDate')?.value||tod(),note:o.note||'',newCarry:o.carry,newEntitlement:o.entitlement,newUsed:o.used,newAdjustment:o.adjustment,newCurrent:o.current,newYearEnd:o.yearEnd,newCarryNext:o.carryNext,newEos:o.eos,createdAt:new Date().toISOString()});});
  dbS('leave_balance_adjustments',arr); saveEmps(getEmps());
  document.body.classList.remove('lbm-focus'); cM('LBM'); rLvBal(); uLvBal(); uBadges();
  toast(LANG==='en'?'✓ Yearly leave balances saved and synced':'✓ تم حفظ واستبدال أرصدة كل السنوات ومزامنتها');
}

function rHols(){
  const hols=getHols(); const h=LANG==='en';
  const head=`<tr><th>${h?'Holiday':'الإجازة'}</th><th>${h?'Date':'التاريخ'}</th><th>${h?'Days':'الأيام'}</th><th>${h?'Recurring':'متكررة'}</th><th></th></tr>`;
  const rows=hols.map((hl,i)=>`<tr><td style="font-weight:600">${h?hl.nameEn||hl.name:hl.name}</td><td>${fD(hl.date)}</td><td>${hl.days}</td><td>${hl.recurring?(h?'Yes':'نعم'):(h?'No':'لا')}</td><td><button class="btn bsm" style="color:var(--rd)" onclick="delHol(${i})"><i class="ti ti-trash"></i></button></td></tr>`).join('');
  const html=head+rows;
  const a=document.getElementById('HLT'); if(a)a.innerHTML=html;
  const b=document.getElementById('HLT_DIRECT'); if(b)b.innerHTML=html;
}
function oHolM(){oM('HM');document.getElementById('HN').value='';document.getElementById('HD').value='';document.getElementById('HDY').value='1';}
function sHol(){const name=document.getElementById('HN').value,date=document.getElementById('HD').value,days=parseInt(document.getElementById('HDY').value)||1,recurring=document.getElementById('HRC').value==='1';if(!name||!date){toast(LANG==='en'?'Fill required fields':'يرجى تعبئة الحقول','ter');return;}const hols=getHols();hols.push({id:uid(),name,nameEn:name,date,days,recurring});saveHols(hols);cM('HM');rHols();toast('✓');}
function delHol(i){const hols=getHols();hols.splice(i,1);saveHols(hols);rHols();}
function uLvBal(){const e=getEmps().find(x=>String(x.id)===String(document.getElementById('NLE')?.value));const h=LANG==='en';if(e)document.getElementById('LBI').innerHTML=`<div class="al alb" style="margin-top:0;padding:7px 10px"><i class="ti ti-info-circle"></i><span>${h?'Available today:':'المتاح اليوم:'} <strong>${leaveCurrentBalance(e).toFixed(1)} ${h?'days':'يوم'}</strong></span></div>`;}
function cLvP(){const from=document.getElementById('NLF')?.value,to=document.getElementById('NLT')?.value;const h=LANG==='en';if(!from||!to)return;let d=new Date(from),end=new Date(to),wd=0;while(d<=end){if(d.getDay()>=0&&d.getDay()<=4)wd++;d.setDate(d.getDate()+1);}const cd=Math.round((new Date(to)-new Date(from))/86400000)+1;const days=selLvType==='annual'?countAnnualLeaveDays(from,to):cd;const e=getEmps().find(x=>x.id===document.getElementById('NLE')?.value);let html='';if(selLvType==='annual'){const bal=e?leaveCurrentBalance(e):0;html=days>bal?`<div class="al alr"><i class="ti ti-x"></i>${h?`Exceeds balance (${bal.toFixed(1)} days)`:`يتجاوز الرصيد (${bal.toFixed(1)} يوم)`}</div>`:`<div class="al alg"><i class="ti ti-check"></i>${h?`Working days: ${days} | Remaining: ${(bal-days).toFixed(1)}`:`أيام العمل: ${days} | سيتبقى: ${(bal-days).toFixed(1)} يوم`}</div>`;}else html=`<div class="al alb"><i class="ti ti-info-circle"></i>${h?`Days: ${days}`:`الأيام: ${days}`}</div>`;document.getElementById('LVI').innerHTML=html;}
async function hrLocalAttachmentRead(file){
  if(!file)return null;
  if(file.size>12582912)throw new Error('حجم المرفق يتجاوز 12 MB');
  return await new Promise(function(resolve,reject){
    var r=new FileReader();r.onload=function(){resolve({name:file.name,mime:file.type||'application/octet-stream',data:r.result,size:file.size});};r.onerror=reject;r.readAsDataURL(file);
  });
}
function hrLocalAttachmentSave(id,att){
  if(!att)return Promise.resolve();
  return new Promise(function(resolve,reject){
    try{
      var req=indexedDB.open('ARIBA_HR_LOCAL_ATTACHMENTS_V1',1);
      req.onupgradeneeded=function(){req.result.createObjectStore('files',{keyPath:'id'});};
      req.onsuccess=function(){
        var db=req.result,tx=db.transaction('files','readwrite');
        tx.objectStore('files').put({id:String(id),name:att.name,mime:att.mime,size:att.size,data:att.data});
        tx.oncomplete=function(){resolve();};tx.onerror=reject;
      };
      req.onerror=reject;
    }catch(e){reject(e);}
  });
}
function hrLocalAttachmentOpen(id){
  try{
    var req=indexedDB.open('ARIBA_HR_LOCAL_ATTACHMENTS_V1',1);
    req.onupgradeneeded=function(){req.result.createObjectStore('files',{keyPath:'id'});};
    req.onsuccess=function(){
      var db=req.result,g=db.transaction('files','readonly').objectStore('files').get(String(id));
      g.onsuccess=function(){
        var x=g.result;if(!x){toast('المرفق غير موجود','ter');return;}
        var a=document.createElement('a');a.href=x.data;a.target='_blank';a.rel='noopener';a.click();
      };
    };
  }catch(e){toast('تعذر فتح المرفق','ter');}
}
async function subLv(){
  const empId=document.getElementById('NLE')?.value,from=document.getElementById('NLF')?.value,to=document.getElementById('NLT')?.value;
  const h=LANG==='en';
  if(!empId||!from||!to){toast(h?'Fill required fields':'يرجى تعبئة جميع الحقول','ter');return;}
  let d=new Date(from),end=new Date(to),wd=0;
  while(d<=end){if(d.getDay()>=0&&d.getDay()<=4)wd++;d.setDate(d.getDate()+1);}
  const cd=Math.round((new Date(to)-new Date(from))/86400000)+1;
  const days=selLvType==='annual'?countAnnualLeaveDays(from,to):cd;
  const e=getEmps().find(x=>x.id===empId);
  if(selLvType==='annual'&&days>(e?leaveCurrentBalance(e):0)){toast(h?'Exceeds available balance':'يتجاوز الرصيد المتاح','ter');return;}
  var file=document.getElementById('HR_NLATT')?.files?.[0],att=null;
  try{att=await hrLocalAttachmentRead(file);}catch(ex){toast(ex.message||'تعذر قراءة المرفق','ter');return;}
  var id=uid(),leave={id:id,empId,type:selLvType,from,to,days,notes:document.getElementById('NLN')?.value||'',status:'pending',ts:Date.now(),createdAt:new Date().toISOString()};
  if(att){leave.attachment={name:att.name,mime:att.mime,size:att.size,stored:'indexeddb'};try{await hrLocalAttachmentSave(id,att);}catch(ex){toast('تعذر حفظ المرفق','ter');return;}}
  const lvs=getLvs();lvs.push(leave);saveLvs(lvs);
  var inp=document.getElementById('HR_NLATT');if(inp)inp.value='';
  toast('✓ '+(h?'Request submitted':'تم إرسال الطلب')+(att?' — تم إرفاق الملف':''));
  rLvPend();uBadges();
}

function approvePerm(id){
  var perms=getPerms();
  var idx=perms.findIndex(function(p){return p.id===id;});
  if(idx<0){
    // ابحث في leaves عن perm/early_leave
    approveLv(id); return;
  }
  perms[idx].status='approved';
  perms[idx].approvedAt=new Date().toISOString();
  dbS('perms',perms);
  rLvPend();rAllLv();
  toast('✓ تمت الموافقة على الاستئذان');
}
function rejectPerm(id,reason){
  var perms=getPerms();
  var idx=perms.findIndex(function(p){return p.id===id;});
  if(idx<0){rejectLv(id);return;}
  perms[idx].status='rejected';
  perms[idx].rejectReason=reason||'';
  perms[idx].rejectedAt=new Date().toISOString();
  dbS('perms',perms);
  rLvPend();rAllLv();
  toast('تم رفض الاستئذان');
}

function approveLv(id){
  const lvs=getLvs(),idx=lvs.findIndex(l=>String(l.id)===String(id));if(idx<0)return;
  const l=lvs[idx];l.status='approved';l.approvedAt=new Date().toISOString();
  if(leaveTypeValue(l)==='annual'){
    const emps=(typeof aEmps==='function'?aEmps():[]).concat(typeof tEmps==='function'?tEmps():[]),ei=emps.findIndex(e=>String(e.id)===leaveEmployeeId(l));
    if(ei>=0){
      const e=emps[ei],current=leaveCurrentBalance(e),days=leaveRequestDays(l);
      l.days=days;
      e.leaveCurrentOverride=Math.max(0,current-days);e.leaveBalance=e.leaveCurrentOverride;e.lb=e.leaveCurrentOverride;e['leaveUsed'+new Date(leaveDateValue(l,'from')||tod()).getFullYear()]=(Number(e['leaveUsed'+new Date(leaveDateValue(l,'from')||tod()).getFullYear()])||0)+days;
      saveEmps(emps);
    }
  }
  saveLvs(lvs);rLvPend();rAllLv();rLvBal();toast('✓ '+(LANG==='en'?'Approved':'تمت الموافقة'));
}function rejectLv(id){const lvs=getLvs();const idx=lvs.findIndex(l=>l.id===id);if(idx<0)return;const reason=prompt(LANG==='en'?'Reason for rejection:':'سبب الرفض:');if(reason===null)return;lvs[idx].status='rejected';lvs[idx].rejectedAt=new Date().toISOString();lvs[idx].rejectedReason=reason||'';saveLvs(lvs);rLvPend();rAllLv();rLvBal();toast(LANG==='en'?'Request rejected':'تم رفض الطلب','ter');}
function oRej(id,kind){document.getElementById('RID').value=id;document.getElementById('RKD').value=kind;document.getElementById('RRN').value='';oM('RM');}
function confRej(){const id=document.getElementById('RID').value,kind=document.getElementById('RKD').value,reason=document.getElementById('RRN').value;if(kind==='lv'){const lvs=getLvs();const idx=lvs.findIndex(l=>l.id===id);if(idx>=0){lvs[idx].status='rejected';lvs[idx].rejectReason=reason;lvs[idx].rejected_reason=reason;lvs[idx].rejectedReason=reason;saveLvs(lvs);rLvPend();rAllLv();}}cM('RM');toast(LANG==='en'?'Rejected':'تم الرفض');uBadges();}
