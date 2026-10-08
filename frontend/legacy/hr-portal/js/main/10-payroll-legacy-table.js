// PAYROLL
function loadPF(){const sel=document.getElementById('PFE');if(!sel||sel.options.length>1)return;[...new Set(aEmps().map(e=>e.employer))].forEach(em=>{const o=document.createElement('option');o.value=em;o.textContent=em;sel.appendChild(o);});}
function rPay(){
  const fe=document.getElementById('PFE')?.value||'', h=LANG==='en';
  const asOf=payrollAsOf();
  var _allEmps=[];
  if(typeof CLEAN_EMPS!=='undefined'&&CLEAN_EMPS.length&&!localStorage.getItem('hr7_emps')){
    _allEmps=CLEAN_EMPS.filter(function(e){return !e.isTerminated&&!e.term;});
  }
  if(!_allEmps.length) _allEmps=aEmps();
  if(!_allEmps.length&&typeof window.ARIBA_EXCEL_EMPLOYEES!=='undefined'){
    _allEmps=window.ARIBA_EXCEL_EMPLOYEES.filter(function(e){return !e.isTerminated;});
  }
  let a=_allEmps.filter(e=>!fe||e.employer===fe);
  const ws=a.filter(function(e){
    var s=Number(e.salaryTotal||0)||Number(e.salary||e.sal||0)||Number(e.net||e.netSalary||0);
    return s>0;
  }).map(function(e){
    var sal=Number(e.salary||e.sal||0);
    var hou=Number(e.housingAllowance||e.hou||0);
    var tra=Number(e.transportAllowance||e.tra||0);
    var st=Number(e.salaryTotal||0)||(sal+hou+tra);
    var ic=calcIns(e,31,31,asOf);
    var other=Number(e.otherDeductions||0);
    var net=Math.round((st-ic.empAmt-other)*100)/100;
    return Object.assign({},e,{salaryTotal:st,_ins:ic,_net:net});
  });
  const totT=ws.reduce((s,e)=>s+e.salaryTotal,0),totI=ws.reduce((s,e)=>s+e._ins.empAmt,0),totN=ws.reduce((s,e)=>s+e._net,0),totC=ws.reduce((s,e)=>s+e._ins.erAmt,0);
  document.getElementById('PYK').innerHTML=`<div class="kpi" style="--ac:var(--bl)"><div class="kl">${h?'Total Payroll':'إجمالي الرواتب'}</div><div class="kv" style="font-size:16px">${Math.round(totT).toLocaleString('en-US')}</div><div class="ks">${h?'SAR':'ريال'}</div></div><div class="kpi" style="--ac:var(--gr)"><div class="kl">${h?'Net Total':'إجمالي الصافي'}</div><div class="kv" style="font-size:16px">${Math.round(totN).toLocaleString('en-US')}</div><div class="ks">${h?'SAR':'ريال'}</div></div><div class="kpi" style="--ac:var(--rd)"><div class="kl">${h?'Emp Insurance':'استقطاع التأمينات'}</div><div class="kv" style="font-size:16px">${Math.round(totI).toLocaleString('en-US')}</div><div class="ks">${h?'Employee insurance':'تأمينات الموظف'}</div></div><div class="kpi" style="--ac:var(--am)"><div class="kl">${h?'Co Insurance':'تأمينات الشركة'}</div><div class="kv" style="font-size:16px">${Math.round(totC).toLocaleString('en-US')}</div><div class="ks">${h?'Company insurance':'تأمينات الشركة'}</div></div>`;
  document.getElementById('PYT').innerHTML=`<tr><th>#</th><th>${h?'Employee':'الموظف'}</th><th>${h?'Employer':'جهة العمل'}</th><th>${h?'Basic':'الأساسي'}</th><th>${h?'Housing':'السكن'}</th><th>${h?'Transport':'النقل'}</th><th>${h?'Project':'المشروع'}</th><th>${h?'Other':'أخرى'}</th><th>${h?'Total':'الإجمالي'}</th><th>${h?'Emp Ins':'تأمين موظف'}</th><th>${h?'Other Ded':'استقطاعات أخرى'}</th><th>${h?'Net':'الصافي'}</th></tr>`+ws.map(e=>`<tr><td style="color:var(--dm)">${e.id}</td><td style="font-weight:600">${e.nameAr.split(' ').slice(0,3).join(' ')}</td><td><span class="b bb">${e.employer}</span></td><td>${fN(e.salary)}</td><td>${fN(e.housingAllowance)}</td><td>${fN(e.transportAllowance)}</td><td>${fN(e.projectAllowance)}</td><td>${fN(e.otherAllowance||0)}</td><td style="color:var(--gr);font-weight:700">${fN(e.salaryTotal)}</td><td style="color:var(--rd)">${e.isSaudi?'-'+fN(e._ins.empAmt):`<span class="b bk">${h?'None':'لا يوجد'}</span>`}</td><td style="color:var(--am)">${(e.otherDeductions||0)>0?'-'+fN(e.otherDeductions||0):'—'}</td><td style="color:var(--cy);font-weight:700">${fN(e._net)}</td></tr>`).join('')+`<tfoot><tr><td colspan="3">${h?'Total':'المجموع'}</td><td colspan="5">—</td><td style="color:var(--gr)">${Math.round(totT).toLocaleString('en-US')}</td><td style="color:var(--rd)">-${Math.round(totI).toLocaleString('en-US')}</td><td>—</td><td style="color:var(--cy)">${Math.round(totN).toLocaleString('en-US')}</td></tr></tfoot>`;
  const byE={};ws.forEach(e=>{if(!byE[e.employer])byE[e.employer]={t:0,c:0};byE[e.employer].t+=e.salaryTotal||0;byE[e.employer].c+=1;});
  document.getElementById('PBE').innerHTML=Object.entries(byE).map(([k,v])=>`<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid rgba(36,48,68,.4);font-size:12px"><div style="width:100px;font-weight:600">${k}</div><div class="prog"><div class="pf" style="width:${totT?v.t/totT*100:0}%;background:${ec(k)}"></div></div><div style="width:90px;color:var(--gr);font-weight:700">${Math.round(v.t).toLocaleString('en-US')} ${h?'SAR':'ر.س'}</div><div style="width:40px;color:var(--mu)">${v.c}</div></div>`).join('');
}
