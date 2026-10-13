// LEAVES
function loadLvPg(){
  const a=aEmps().filter(e=>!e.isTerminated), h=LANG==='en';
  ['NLE','LFE'].forEach(id=>{const sel=document.getElementById(id);if(!sel)return;const old=sel.value;const first=id==='LFE'?(h?'All employees':'كل الموظفين'):(h?'Select employee':'اختر الموظف');sel.innerHTML='<option value="">'+first+'</option>'+a.map(e=>'<option value="'+e.id+'">'+(h?(e.nameEn||e.nameAr||e.id):(e.nameAr||e.nameEn||e.id))+'</option>').join('');if(old&&a.some(e=>String(e.id)===String(old)))sel.value=old;});
  document.getElementById('LTG').innerHTML=Object.entries(LVL).map(([k,v])=>`<div onclick="selLT('${k}',this)" style="background:var(--c2);border:1.5px solid ${selLvType===k?v.color:'var(--bd)'};border-radius:9px;padding:8px 6px;text-align:center;cursor:pointer;font-size:11px;font-weight:600;${selLvType===k?`background:${v.color}22;color:${v.color}`:''}" id="lt_${k}"><i class="ti ${v.icon}" style="font-size:18px;display:block;margin-bottom:3px;color:${v.color}"></i>${h?v.en:v.ar}</div>`).join('');
  // Paint the active tab only. Other tabs are rendered on first click, preventing a multi-second pause.
  const active=document.querySelector('#pg-lv .tbar .tab.on');
  const activeId=active&&active.getAttribute('onclick')?.match(/'([^']+)'/)?.[1]||'lv1';
  if(activeId==='lv1'){rLvPend();} else if(activeId==='lv2'){rAllLv();} else if(activeId==='lv4'){loadLeaveBalanceEmployeeOptions();rLvBal();} else if(activeId==='lv5'){rHols();}else if(activeId==='lv6'){renderHrOvertime();}
  // Synchronize in the background; never block the first paint.
  async function syncLeaveOverridesFromCloud(){
  try{
    const rows=await supaGet('employee_directory','select=employee_id,data,updated_at&active=eq.true&limit=1000');
    if(!Array.isArray(rows)||!rows.length)return;
    const local=aEmps(); let changed=false;
    rows.forEach(r=>{
      const e=local.find(x=>String(x.id)===String(r.employee_id));
      const d=r.data||{};
      if(e && d.leaveYearOverrides && typeof d.leaveYearOverrides==='object'){
        e.leaveYearOverrides=d.leaveYearOverrides;
        if(d.leaveBalance!==undefined)e.leaveBalance=Number(d.leaveBalance)||0;
        e.leaveBalanceUpdatedAt=d.leaveBalanceUpdatedAt||r.updated_at||e.leaveBalanceUpdatedAt;
        changed=true;
      }
    });
    if(changed)dbS('emps',local);
  }catch(e){console.warn('leave override cloud sync',e);}
}
setTimeout(function(){syncLeaveOverridesFromCloud();},250);
setInterval(function(){
  try{
    var cur=document.querySelector('.pg.on');
    var tab=document.querySelector('#pg-lv .tab.on');
    var oc=tab&&tab.getAttribute('onclick')||'';
    if(cur&&cur.id==='pg-lv'&&/lv4/.test(oc))syncLeaveOverridesFromCloud().then(function(){clearLeavePerfCache();rLvBal();});
  }catch(e){}
},60000);
setTimeout(function(){syncLeavesFromSupa(true).then(function(){
    const pg=document.getElementById('pg-lv'); if(!pg||!pg.classList.contains('on'))return;
    if(activeId==='lv1'){rLvPend();} else if(activeId==='lv2'){rAllLv();} else if(activeId==='lv4'){loadLeaveBalanceEmployeeOptions();rLvBal();} else if(activeId==='lv5'){rHols();}else if(activeId==='lv6'){renderHrOvertime();}
    uBadges();
  }).catch(function(){});},1200);
}
function selLT(k,el){selLvType=k;document.querySelectorAll('[id^="lt_"]').forEach(e=>{const lv=LVL[e.id.replace('lt_','')];if(lv){e.style.border=`1.5px solid ${e.id==='lt_'+k?lv.color:'var(--bd)'}`;e.style.background=e.id==='lt_'+k?`${lv.color}22`:'var(--c2)';e.style.color=e.id==='lt_'+k?lv.color:'var(--tx)';}});uLvBal();}
function leaveDateValue(l,key){return l[key]||l[(key==='from'?'from_date':key==='to'?'to_date':key)]||l.date||'';}
function leaveEmployeeId(l){return String(l.empId??l.emp_id??l.employeeId??l.employee_id??'');}
function leaveTypeValue(l){return l.type||l.leave_type||l.leaveType||'annual';}
function leaveRequestDays(l){const type=leaveTypeValue(l),from=leaveDateValue(l,'from'),to=leaveDateValue(l,'to');if(type==='annual'&&from&&to)return countAnnualLeaveDays(from,to);return Number(l.days)||0;}
function leaveIsCurrentlyPending(l){if(String(l.status||'').toLowerCase()!=='pending')return false;const to=leaveDateValue(l,'to');if(!to)return true;return String(to)>=new Date().toISOString().slice(0,10);}

function hrLocalAttachmentButton(l){
  if(!l||!l.attachment)return '';
  return '<button class="btn bsm" style="color:var(--cy)" onclick="hrLocalAttachmentOpen(\''+String(l.id).replace(/'/g,"\'")+'\')"><i class="ti ti-paperclip"></i> مرفق</button>';
}
function rLvPend(){
  const pend=[...getLvs().filter(leaveIsCurrentlyPending),...getPerms().filter(l=>String(l.status||'').toLowerCase()==='pending'&&(!l.date||String(l.date)>=new Date().toISOString().slice(0,10)))];
  const h=LANG==='en';document.getElementById('LVB').textContent=pend.length;
  document.getElementById('LVP').innerHTML=pend.length===0?`<div style="color:var(--mu);text-align:center;padding:24px;font-size:13px">✓ ${h?'No pending requests':'لا توجد طلبات معلقة حالياً'}</div>`:
  pend.map(l=>{const empId=leaveEmployeeId(l),e=aEmps().find(x=>String(x.id)===empId),c=ec(e?.nameAr||''),type=leaveTypeValue(l),lt=LVL[type]||{ar:type,en:type,color:'#8A928F'},isPerm=['perm','perm_mat','early_leave','advance'].includes(type),from=leaveDateValue(l,'from'),to=leaveDateValue(l,'to'),detail=isPerm?(l.date||fD(from))+(l.time?' '+l.time:'')+(l.dur?' ('+l.dur+' ساعة)':''):(fD(from)+' ← '+fD(to)+' ('+leaveRequestDays(l)+' '+(h?'days':'أيام')+')');
  let action='';
  if(l.workflowManaged){const can=String(l.workflowStage||'')==='hr';action=can?`<button class="btn bgl bsm" onclick="workflowHrAct('${l.workflowRequestId}','approved')">✓ ${h?'Approve':'موافقة'}</button> <button class="btn bsm" style="color:var(--rd)" onclick="workflowHrAct('${l.workflowRequestId}','rejected')">✗ ${h?'Reject':'رفض'}</button>`:`<span class="b ba">${l.workflowStage==='manager'?(h?'Pending Manager':'بانتظار المدير'):l.workflowStage==='ceo'?(h?'Pending CEO':'بانتظار الرئيس التنفيذي'):(h?'Pending':'معلق')}</span>`;}
  else action=`${hrLocalAttachmentButton(l)} <button class="btn bgl bsm" onclick="${isPerm?'approvePerm':'approveLv'}('${l.id}')">✓ ${h?'Approve':'موافقة'}</button> <button class="btn bsm" style="color:var(--rd)" onclick="oRej('${l.id}','${isPerm?'perm':'lv'}')">✗ ${h?'Reject':'رفض'}</button>`;
  return `<div style="display:flex;align-items:center;gap:10px;padding:11px 14px;border-bottom:1px solid rgba(36,48,68,.5)">${av(e?e.nameAr:'؟',c,32)}<div style="flex:1"><div style="font-weight:600;font-size:13px">${e?e.nameAr.split(' ').slice(0,3).join(' '):'—'}</div><div style="font-size:11px;color:var(--mu)">${h?lt.en:lt.ar} | ${detail}</div>${l.notes?'<div style="font-size:11px;color:var(--dm)">'+l.notes+'</div>':''}</div><span class="b ba">${h?'Pending':'معلق'}</span>${action}</div>`;}).join('');uBadges();
}
function rAllLv(){
  const ef=document.getElementById('LFE')?.value||'',tf=document.getElementById('LFT')?.value||'',sf=document.getElementById('LFS')?.value||'',h=LANG==='en';
  const list=getLvs().filter(l=>{const eid=leaveEmployeeId(l),type=leaveTypeValue(l),status=String(l.status||'').toLowerCase();return(!ef||eid===String(ef))&&(!tf||type===tf)&&(!sf||status===sf);}).sort((a,b)=>new Date(leaveDateValue(b,'from')||0)-new Date(leaveDateValue(a,'from')||0)||(Number(b.ts||b.created_at||0)-Number(a.ts||a.created_at||0)));
  const stB={pending:`<span class="b ba">${h?'Pending':'معلق'}</span>`,approved:`<span class="b bg">${h?'Approved':'موافق'}</span>`,rejected:`<span class="b br">${h?'Rejected':'مرفوض'}</span>`};
  document.getElementById('LAT').innerHTML=`<tr><th>${h?'Employee':'الموظف'}</th><th>${h?'Type':'النوع'}</th><th>${h?'From':'من'}</th><th>${h?'To':'إلى'}</th><th>${h?'Days':'الأيام'}</th><th>${h?'Status':'الحالة'}</th><th>${h?'Action':'إجراء'}</th></tr>`+
  list.map(l=>{const e=aEmps().find(x=>String(x.id)===leaveEmployeeId(l)),type=leaveTypeValue(l),lt=LVL[type]||{ar:type,en:type},from=leaveDateValue(l,'from'),to=leaveDateValue(l,'to'),status=String(l.status||'').toLowerCase();let action=hrLocalAttachmentButton(l);
  if(status==='pending'){if(l.workflowManaged){action+=String(l.workflowStage||'')==='hr'?` <button class="btn bgl bsm" onclick="workflowHrAct('${l.workflowRequestId}','approved')">✓</button> <button class="btn bsm" style="color:var(--rd)" onclick="workflowHrAct('${l.workflowRequestId}','rejected')">✗</button>`:` <span class="b ba">${l.workflowStage==='manager'?(h?'Pending Manager':'بانتظار المدير'):l.workflowStage==='ceo'?(h?'Pending CEO':'بانتظار الرئيس التنفيذي'):(h?'Pending':'معلق')}</span>`;}else action+=` <button class="btn bgl bsm" onclick="${['perm','perm_mat','early_leave','advance'].includes(type)?'approvePerm':'approveLv'}('${l.id}')">✓</button> <button class="btn bsm" style="color:var(--rd)" onclick="oRej('${l.id}','${['perm','perm_mat','early_leave','advance'].includes(type)?'perm':'lv'}')">✗</button>`;}
  return `<tr><td style="font-weight:600">${e?.nameAr?.split(' ').slice(0,3).join(' ')||l.employee_name||'—'}</td><td>${h?lt.en:lt.ar}</td><td>${fD(from)}</td><td>${fD(to)}</td><td>${leaveRequestDays(l)}</td><td>${stB[status]||''}</td><td>${action}</td></tr>`;}).join('');
}
