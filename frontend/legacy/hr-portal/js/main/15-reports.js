// REPORTS
function buildRpts(){const rpts=[{i:'ti-calendar-stats',ar:'أرصدة الإجازات',en:'Leave Balances',fn:'rptLv'},{i:'ti-id',ar:'الإقامات',en:'Iqama',fn:'rptIq'},{i:'ti-passport',ar:'الجوازات',en:'Passports',fn:'rptPp'},{i:'ti-file-text',ar:'العقود',en:'Contracts',fn:'rptCt'},{i:'ti-cash',ar:'الرواتب التفصيلي',en:'Payroll',fn:'rptPay'},{i:'ti-award',ar:'نهاية الخدمة',en:'EOS',fn:'rptEOS'},{i:'ti-alert-triangle',ar:'التنبيهات العاجلة',en:'Urgent Alerts',fn:'rptAlerts'},{i:'ti-users',ar:'كل الموظفين الحاليين',en:'Active Employees',fn:'rptAll'},{i:'ti-user-off',ar:'المنتهية خدمتهم',en:'Terminated',fn:'rptTerm'}];const h=LANG==='en';document.getElementById('RG').innerHTML=rpts.map(r=>`<div onclick="${r.fn}()" style="background:var(--c);border:1px solid var(--bd);border-radius:10px;padding:14px;cursor:pointer;transition:all .15s" onmouseover="this.style.borderColor='var(--bl)';this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='var(--bd)';this.style.transform=''"><i class="ti ${r.i}" style="font-size:22px;color:var(--bl);display:block;margin-bottom:7px"></i><div style="font-size:13px;font-weight:700">${h?r.en:r.ar}</div></div>`).join('');}
function showRpt(t,html){document.getElementById('RT').textContent=t;document.getElementById('RC').innerHTML=html;document.getElementById('RO').style.display='block';document.getElementById('RO').scrollIntoView({behavior:'smooth'});}
function rptLv(){const h=LANG==='en';showRpt(h?'Leave Balances':'أرصدة الإجازات',`<table><tr><th>#</th><th>${h?'Employee':'الموظف'}</th><th>${h?'Employer':'جهة العمل'}</th><th>${h?'Annual':'المستحق'}</th><th>2023</th><th>2024</th><th>2025</th><th>2026</th><th>${h?'Balance':'الرصيد'}</th></tr>${aEmps().map(e=>{var ov=e.leaveYearOverrides||{};function yu(y){return (ov[y]&&ov[y].used!==undefined)?ov[y].used:0;}return`<tr><td>${e.empNo!=null?e.empNo:e.id}</td><td>${e.nameAr}</td><td>${e.employer}</td><td>${e.leaveDaysContract||21}</td><td>${yu('2023')}</td><td>${yu('2024')}</td><td>${yu('2025')}</td><td>${yu('2026')}</td><td style="font-weight:700;color:${(e.leaveBalance||0)>0?'var(--gr)':'var(--rd)'}">${(e.leaveBalance||0).toFixed(1)}</td></tr>`;}).join('')}</table>`);}
function rptIq(){const h=LANG==='en';showRpt(h?'Iqama Report':'تقرير الإقامات',`<table><tr><th>#</th><th>${h?'Employee':'الموظف'}</th><th>${h?'Iqama No':'رقم الإقامة'}</th><th>${h?'Employer':'جهة العمل'}</th><th>${h?'Expiry':'الانتهاء'}</th><th>${h?'Remaining':'المتبقي'}</th></tr>${aEmps().filter(e=>e.iqamaNo).sort((a,b)=>(a.iqamaDaysLeft||9999)-(b.iqamaDaysLeft||9999)).map(e=>`<tr><td>${e.empNo!=null?e.empNo:e.id}</td><td>${e.nameAr}</td><td>${e.iqamaNo}</td><td>${e.employer}</td><td>${fD(e.iqamaExpiry)||'—'}</td><td>${dBadge(e.iqamaDaysLeft||9999)}</td></tr>`).join('')}</table>`);}
function rptPp(){const h=LANG==='en';showRpt(h?'Passport Report':'تقرير الجوازات',`<table><tr><th>#</th><th>${h?'Employee':'الموظف'}</th><th>${h?'Passport':'الجواز'}</th><th>${h?'Nationality':'الجنسية'}</th><th>${h?'Expiry':'الانتهاء'}</th><th>${h?'Remaining':'المتبقي'}</th></tr>${aEmps().filter(e=>e.passportNo).sort((a,b)=>(a.passportDaysLeft||9999)-(b.passportDaysLeft||9999)).map(e=>`<tr><td>${e.id}</td><td>${e.nameAr}</td><td>${e.passportNo}</td><td>${e.nationality}</td><td>${fD(e.passportExpiry)||'—'}</td><td>${dBadge(e.passportDaysLeft||9999)}</td></tr>`).join('')}</table>`);}
function rptCt(){const h=LANG==='en';showRpt(h?'Contract Report':'تقرير العقود',`<table><tr><th>#</th><th>${h?'Employee':'الموظف'}</th><th>${h?'Employer':'جهة العمل'}</th><th>${h?'Type':'النوع'}</th><th>${h?'End':'الانتهاء'}</th><th>${h?'Remaining':'المتبقي'}</th></tr>${aEmps().sort((a,b)=>(a.contractDaysLeft||9999)-(b.contractDaysLeft||9999)).map(e=>`<tr><td>${e.id}</td><td>${e.nameAr}</td><td>${e.employer}</td><td>${e.contractType||'—'}</td><td>${fD(e.contractEnd)||'—'}</td><td>${dBadge(e.contractDaysLeft||9999)}</td></tr>`).join('')}</table>`);}
function rptPay(){
  const h=LANG==='en', asOf=payrollAsOf();
  // اقرأ من CLEAN_EMPS مباشرة
  var src=[];
  if(typeof CLEAN_EMPS!=='undefined'&&CLEAN_EMPS.length&&!localStorage.getItem('hr7_emps')){
    src=CLEAN_EMPS.filter(function(e){return !e.isTerminated&&!e.term;});
  }
  if(!src.length) src=aEmps();
  const ws=src.filter(function(e){
    var s=Number(e.salary||e.sal||0)||Number(e.salaryTotal||0)||Number(e.netSalary||e.net||0);
    return true; // show all active
  }).map(function(e){
    var sal=Number(e.salary||e.sal||0);
    var hou=Number(e.housingAllowance||e.hou||0);
    var tra=Number(e.transportAllowance||e.tra||0);
    var st=Number(e.salaryTotal||0)||(sal+hou+tra);
    var ic=calcIns(Object.assign({},e,{salaryTotal:st}),31,31,asOf);
    var net=Math.round((st-ic.empAmt-(Number(e.otherDeductions||0)))*100)/100;
    return Object.assign({},e,{
      nameAr:e.nameAr||e.na||'',
      employer:e.employer||e.em||'',
      salary:sal, housingAllowance:hou, transportAllowance:tra,
      salaryTotal:st, isSaudi:e.isSaudi||e.saudi||false,
      _ins:ic, _net:net
    });
  });const totT=ws.reduce((s,e)=>s+e.salaryTotal,0),totN=ws.reduce((s,e)=>s+e._net,0),totI=ws.reduce((s,e)=>s+e._ins.empAmt,0);showRpt(h?'Payroll Report':'تقرير الرواتب',`<table><tr><th>#</th><th>${h?'Employee':'الموظف'}</th><th>${h?'Employer':'جهة العمل'}</th><th>${h?'Basic':'الأساسي'}</th><th>${h?'Total':'الإجمالي'}</th><th>${h?'Emp Ins':'تأمين موظف'}</th><th>${h?'Net':'الصافي'}</th></tr>${ws.map(e=>`<tr><td>${e.id}</td><td>${e.nameAr}</td><td>${e.employer}</td><td>${fN(e.salary)} ${h?'SAR':'ر.س'}</td><td style="color:var(--gr)">${fN(e.salaryTotal)} ${h?'SAR':'ر.س'}</td><td style="color:${e.isSaudi?'var(--rd)':'var(--dm)'}">${e.isSaudi?'-'+fN(e._ins.empAmt):(h?'None':'لا يوجد')}</td><td style="color:var(--cy);font-weight:700">${fN(e._net)} ${h?'SAR':'ر.س'}</td></tr>`).join('')}<tfoot><tr><td colspan="4">${h?'Total':'المجموع'}</td><td style="color:var(--gr)">${fN(totT)}</td><td style="color:var(--rd)">-${fN(totI)}</td><td style="color:var(--cy)">${fN(totN)}</td></tr></tfoot></table>`);}
function rptEOS(){const h=LANG==='en';const a=tEmps().filter(e=>(Number(e.yearsOfService)||0)>0&&(Number(e.yearsOfService)||0)<100);showRpt(h?'EOS Report':'تقرير مكافآت نهاية الخدمة',`<table><tr><th>#</th><th>${h?'Employee':'الموظف'}</th><th>${h?'Employer':'جهة العمل'}</th><th>${h?'Service Yrs':'سنوات'}</th><th>${h?'Basic':'الأساسي'}</th><th>${h?'EOS Due':'المكافأة'}</th></tr>${a.sort((a,b)=>(Number(b.yearsOfService)||0)-(Number(a.yearsOfService)||0)).map(e=>{const eos=e.eosLaborLaw||calcEOS(e.salary||0,e.yearsOfService||0,e.housingAllowance||0);return`<tr><td>${e.id}</td><td>${e.nameAr}</td><td>${e.employer}</td><td>${(Number(e.yearsOfService)||0).toFixed(2)}</td><td>${fN(e.salary)} ${h?'SAR':'ر.س'}</td><td style="color:var(--gr);font-weight:700">${eos>0?Math.round(eos).toLocaleString('en-US')+' '+(h?'SAR':'ر.س'):'0'}</td></tr>`;}).join('')}</table>`);}
function rptAlerts(){const h=LANG==='en';const src=aEmps(),al=[];const today=new Date();today.setHours(0,0,0,0);function left(v){if(!v)return null;const d=new Date(v);if(isNaN(d.getTime()))return null;d.setHours(0,0,0,0);return Math.ceil((d-today)/86400000);}src.forEach(e=>{[['iqamaExpiry','الهوية / الإقامة'],['passportExpiry','الجواز'],['contractEnd','العقد']].forEach(p=>{const d=left(e[p[0]]);if(d!==null&&d<=90)al.push({name:e.nameAr,employer:e.employer||'—',type:p[1],date:e[p[0]],days:d});});});al.sort((a,b)=>a.days-b.days);showRpt(h?`Alerts (${al.length})`:`التنبيهات العاجلة (${al.length})`,`<table><tr><th>${h?'Employee':'الموظف'}</th><th>${h?'Employer':'جهة العمل'}</th><th>${h?'Type':'النوع'}</th><th>${h?'Expiry':'الانتهاء'}</th><th>${h?'Remaining':'المتبقي'}</th></tr>${al.map(a=>`<tr><td>${a.name}</td><td>${a.employer}</td><td>${a.type}</td><td>${fD(a.date)}</td><td>${a.days<=0?'<span class="b br">منتهي</span>':dBadge(a.days)}</td></tr>`).join('')}</table>`);}
function rptAll(){
  var h=LANG==='en';
  var emps=aEmps();
  var rows=emps.map(function(e,i){
    var deps=typeof window._getDepsData==='function'?window._getDepsData(e.id):[];
    var manual=typeof _sGet==='function'?(_sGet('deps_manual_'+e.id)||[]):[];
    var allDeps=deps.concat(manual);
    var depsHtml='';
    if(allDeps.length>0){
      depsHtml='<tr><td></td><td colspan="6" style="padding:4px 8px 8px 24px">'+
        '<div style="font-size:10px;color:var(--mu);font-weight:700;margin-bottom:3px">التابعون:</div>'+
        allDeps.map(function(d){
          return '<span style="display:inline-block;background:var(--c2);border-radius:6px;padding:2px 8px;margin:2px;font-size:10px">'+
            d.nameAr+' <span style="color:var(--mu)">('+d.rel+')</span></span>';
        }).join('')+
      '</td></tr>';
    }
    return '<tr style="border-top:1px solid var(--bd)">'+
      '<td style="color:var(--mu)">'+(i+1)+'</td>'+
      '<td style="font-weight:600">'+e.nameAr+'</td>'+
      '<td>'+e.employer+'</td>'+
      '<td>'+e.nationality+'</td>'+
      '<td>'+e.dept+'</td>'+
      '<td>'+(e.contractJoin||'—')+'</td>'+
      '<td style="color:var(--gr)">'+Math.round(e.salaryTotal||0).toLocaleString()+'</td>'+
    '</tr>'+depsHtml;
  }).join('');
  showRpt(h?'Active Employees ('+emps.length+')':'الموظفون الحاليون ('+emps.length+')',
    '<table><tr><th>#</th><th>'+(h?'Name':'الاسم')+'</th><th>'+(h?'Employer':'جهة العمل')+'</th>'+
    '<th>'+(h?'Nationality':'الجنسية')+'</th><th>'+(h?'Dept':'القسم')+'</th>'+
    '<th>'+(h?'Start':'المباشرة')+'</th><th>'+(h?'Salary':'الراتب')+'</th></tr>'+rows+'</table>');
}

function rptTerm(){const h=LANG==='en';showRpt(h?`Terminated (${tEmps().length})`:`المنتهية خدمتهم (${tEmps().length})`,`<table><tr><th>#</th><th>${h?'Name':'الاسم'}</th><th>${h?'Employer':'جهة العمل'}</th><th>${h?'Nationality':'الجنسية'}</th><th>${h?'Last Day':'آخر يوم'}</th><th>${h?'Reason':'السبب'}</th></tr>${tEmps().map(e=>`<tr><td>${e.id}</td><td>${e.nameAr}</td><td>${e.employer}</td><td>${e.nationality||'—'}</td><td>${fD(e.lastDay)||'—'}</td><td><span class="b ${e.terminationReason?.includes('استقال')?'ba':'br'}">${e.terminationReason||'—'}</span></td></tr>`).join('')}</table>`);}
