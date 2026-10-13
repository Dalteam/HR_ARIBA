// INIT

// ================================================================
// EXTRA FUNCTIONS - New Pages
// ================================================================
function saudiEmps(){return aEmps().filter(function(e){return e.isSaudi||e.saudi||['سعودي','سعودية'].includes((e.nationality||e.nat||'').trim());});}
function expatsEmps(){return aEmps().filter(function(e){return !e.isSaudi&&!e.saudi&&!['سعودي','سعودية'].includes((e.nationality||e.nat||'').trim());});}

function rList(pgId, list){
  const tbl=document.getElementById(pgId+'T');if(!tbl)return;
  tbl.innerHTML=`<tr><th>#</th><th>الموظف</th><th>الوظيفة</th><th>جهة العمل</th><th>الجنسية</th><th>المدير المباشر</th><th>الإقامة</th><th>العقد</th><th>الراتب</th><th>الصافي</th><th>إجراءات</th></tr>`+
  list.map(e=>{
    const c=ec(e.nameAr);
    const mgr=getEmps().find(m=>m.id===e.managerId);
    return`<tr>
      <td style="color:var(--dm)">${e.id}</td>
      <td><div style="display:flex;align-items:center;gap:7px">${av(e.nameAr,c,28)}<div><div style="font-weight:600">${e.nameAr}</div><div style="font-size:10px;color:var(--dm)">${e.username}/${e.password}</div></div></div></td>
      <td style="color:var(--mu)">${e.jobTitle||'—'}</td>
      <td><span class="b bb">${e.employer}</span></td>
      <td>${e.nationality||'—'}</td>
      <td style="color:var(--mu);font-size:11px">${mgr?mgr.nameAr.split(' ').slice(0,2).join(' '):'—'}</td>
      <td>${dBadge(e.iqamaDaysLeft||9999)}</td>
      <td>${dBadge(e.contractDaysLeft||9999)}</td>
      <td style="color:var(--gr);font-weight:600">${e.salaryTotal>0?fN(e.salaryTotal)+' ر.س':'—'}</td>
      <td style="color:var(--cy);font-weight:600">${e.netSalary>0?fN(e.netSalary)+' ر.س':'—'}</td>
      <td><button class="btn bsm" onclick="showED('${e.id}')"><i class="ti ti-eye"></i></button> <button class="btn bsm" onclick="editEmp('${e.id}')"><i class="ti ti-edit"></i></button></td>
    </tr>`;
  }).join('');
}

function sExclTab(el,id){
  el.closest('.tbar').querySelectorAll('.tab').forEach(t=>t.classList.remove('on'));
  el.classList.add('on');
  ['ex1','ex2','ex3','ex4'].forEach(i=>{const e=document.getElementById(i);if(e)e.style.display=i===id?'block':'none';});
}

function loadExcl(){
  const h=hEmps();
  const exT2=document.getElementById('exT2');
  if(exT2) exT2.innerHTML=`<tr><th>#</th><th>الاسم</th><th>الوظيفة</th><th>جهة العمل</th><th>نوع العمل</th></tr>`+
    h.filter(e=>!e.isTerminated).map(e=>`<tr><td>${e.id}</td><td style="font-weight:600">${e.nameAr}</td><td>${e.jobTitle||'—'}</td><td>${e.employer}</td><td><span class="b ba">استشاري بالساعة</span></td></tr>`).join('');
  // ex3 - terminated consultants
  const exT3d=document.getElementById('exT3_dynamic');
  if(exT3d){
    const tcons=hEmps().filter(e=>e.isTerminated);
    if(tcons.length>0){
      exT3d.innerHTML='<div class=\'tw\'><table><tr><th>#</th><th>الاسم</th><th>الوظيفة</th><th>جهة العمل</th><th>آخر يوم</th><th>السبب</th></tr>'+
        tcons.map(e=>`<tr><td>${e.id}</td><td style='font-weight:600'>${e.nameAr}</td><td>${e.jobTitle||'—'}</td><td>${e.employer}</td><td>${fD(e.lastDay)||'—'}</td><td><span class='b br'>استشاري - انتهت العلاقة</span></td></tr>`).join('')+
        '</table></div>';
    }
  }
  const exT4=document.getElementById('exT4');
  if(exT4) exT4.innerHTML=`<tr><th>#</th><th>الاسم</th><th>جهة العمل</th><th>الجنسية</th><th>آخر يوم</th><th>السبب</th></tr>`+
    tEmps().map(e=>`<tr><td>${e.id}</td><td style="font-weight:600">${e.nameAr}</td><td>${e.employer}</td><td>${e.nationality||'—'}</td><td>${fD(e.lastDay)||'—'}</td><td><span class="b br">${e.terminationReason||'—'}</span></td></tr>`).join('');
}

function loadProjects(){
  const employers=[...new Set(aEmps().map(e=>e.employer))];
  const sel=document.getElementById('projSel');
  if(sel && sel.options.length<=1){
    employers.forEach(e=>{const o=document.createElement('option');o.value=e;o.textContent=e;sel.appendChild(o);});
  }
}

function rProject(){
  const proj=document.getElementById('projSel')?.value;if(!proj)return;
  const list=aEmps().filter(e=>e.employer===proj);
  document.getElementById('projCount').textContent=list.length+' موظف';
  const totSal=list.reduce((s,e)=>s+e.salaryTotal,0);
  document.getElementById('projTable').innerHTML=`
    <div class="kr" style="margin-bottom:12px">
      <div class="kpi"><div class="kl">عدد الموظفين</div><div class="kv">${list.length}</div></div>
      <div class="kpi" style="--ac:var(--gr)"><div class="kl">إجمالي الرواتب</div><div class="kv" style="font-size:16px">${Math.round(totSal).toLocaleString('en-US')}</div><div class="ks">ريال</div></div>
      <div class="kpi" style="--ac:var(--am)"><div class="kl">السعوديون</div><div class="kv">${list.filter(e=>e.isSaudi).length}</div></div>
      <div class="kpi" style="--ac:var(--cy)"><div class="kl">الأجانب</div><div class="kv">${list.filter(e=>!e.isSaudi).length}</div></div>
    </div>
    <div class="card" style="padding:0"><div class="tw"><table>
      <tr><th>#</th><th>الموظف</th><th>الوظيفة</th><th>الجنسية</th><th>المدير المباشر</th><th>الإقامة</th><th>العقد</th><th>الراتب</th></tr>
      ${list.map(e=>{const c=ec(e.nameAr);const mgr=getEmps().find(m=>m.id===e.managerId);return`<tr>
        <td>${e.id}</td>
        <td><div style="display:flex;align-items:center;gap:7px">${av(e.nameAr,c,26)}<strong>${e.nameAr.split(' ').slice(0,3).join(' ')}</strong></div></td>
        <td style="color:var(--mu)">${e.jobTitle||'—'}</td>
        <td>${e.nationality||'—'}</td>
        <td style="color:var(--mu)">${mgr?mgr.nameAr.split(' ').slice(0,2).join(' '):'—'}</td>
        <td>${dBadge(e.iqamaDaysLeft||9999)}</td>
        <td>${dBadge(e.contractDaysLeft||9999)}</td>
        <td style="color:var(--gr);font-weight:600">${e.salaryTotal>0?fN(e.salaryTotal)+' ر.س':'—'}</td>
      </tr>`;}).join('')}
    </table></div></div>`;
}

function popMgrSel(excludeId){
  const sel=document.getElementById('mgrSel');if(!sel)return;
  const cur=sel.value;
  sel.innerHTML='<option value="">لا يوجد مدير مباشر</option>'+
    aEmps().filter(e=>e.id!==excludeId).map(e=>`<option value="${e.id}">${e.nameAr.split(' ').slice(0,3).join(' ')} — ${e.jobTitle||e.employer}</option>`).join('');
  if(cur) sel.value=cur;
}

// undo stack
const _UNDO=[];
function pushUndo(d){_UNDO.push(JSON.stringify(d));if(_UNDO.length>15)_UNDO.shift();}
function globalUndo(){if(!_UNDO.length){toast('لا يوجد شيء للتراجع','ter');return;}saveEmps(JSON.parse(_UNDO.pop()));rEmps&&rEmps();toast('✓ تم التراجع','tin');}


